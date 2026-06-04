"use server";

import { randomUUID } from "node:crypto";
import { BackendError, createApiClient } from "@calibra/sdk";
import { cookies } from "next/headers";

import { getPathname } from "#/lib/i18n/navigation";
import { CONSOLE_URL, TENANT_HEADER } from "#/lib/tenant/constants";
import { tenantRefFromHeaders } from "#/lib/tenant/current-tenant";

import { CSRF_COOKIE, getSession, SESSION_COOKIE } from "./auth";

interface LoginState {
    ok: boolean;
    error: string | null;
    /**
     * On success, the locale-aware path the client should navigate to. We do **not** `redirect()`
     * from the server action: Next resolves a server-action redirect by issuing an internal
     * server-side `fetch` to sub-render the destination, and that fetch hits the server's own
     * loopback origin (`localhost`) rather than the tenant `Host` — so the per-tenant middleware
     * (`proxy.ts`) resolves no shop and renders "unknown shop" (visible as a flash that "fixes
     * itself" on manual refresh). A real browser navigation from the client always carries the
     * shop's `Host`, so the middleware resolves the right tenant. {@link LoginForm} reads this and
     * calls `window.location.assign`.
     */
    redirectTo?: string;
}

/**
 * Calls `POST /api/v1/auth/login`, enforces an admin role, and stores the bearer token plus the
 * resolved user identity in the `admin_session` cookie (httpOnly). The cookie payload is
 * `{ token, userId, email, displayName, tenantSlug }` JSON so `getSession()` can deserialise it
 * without round-tripping to the API on every page render.
 *
 * Login is tenant-scoped (RULE A): the host resolves to a tenant ref, which is forwarded as
 * `X-Calibra-Tenant` so the API authenticates the user *within that shop* (RLS scopes the lookup —
 * a user from another shop simply isn't found, yielding "invalid credentials"). The ref is then
 * pinned into the session and re-checked on every request against the `Host`.
 */
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
    const email = formData.get("email");
    const password = formData.get("password");
    const locale = (formData.get("__locale") as string | null) ?? "fa";
    if (typeof email !== "string" || typeof password !== "string" || email.length === 0 || password.length === 0) {
        return { ok: false, error: locale === "fa" ? "ایمیل و رمز عبور الزامی است." : "Email and password are required." };
    }

    /**
     * No resolvable shop on this `Host` — the admin is per-tenant, so there is nothing to log into.
     * The middleware already rewrites such hosts to the "unknown shop" page; this guards the action
     * path (server actions bypass the middleware matcher).
     */
    const tenant = await tenantRefFromHeaders();
    if (tenant === null) {
        return {
            ok: false,
            error: locale === "fa" ? "این آدرس به هیچ فروشگاهی متصل نیست." : "This address isn't connected to a shop.",
        };
    }

    const api = createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
        headers: { [TENANT_HEADER]: tenant },
    });
    let data: NonNullable<Awaited<ReturnType<typeof api.storefront.POST>>["data"]> | undefined;
    try {
        const result = await api.storefront.POST("/api/v1/auth/login", { body: { email, password } });
        data = result.data;
    } catch (err) {
        if (err instanceof BackendError && (err.status === 400 || err.status === 422)) {
            return { ok: false, error: locale === "fa" ? "ایمیل یا رمز عبور نادرست است." : "Invalid email or password." };
        }
        return { ok: false, error: locale === "fa" ? "ورود ناموفق بود. دوباره تلاش کنید." : "Sign-in failed. Please try again." };
    }
    if (!data || typeof data !== "object" || !("user" in data) || !("token" in data)) {
        return { ok: false, error: locale === "fa" ? "ورود ناموفق بود. دوباره تلاش کنید." : "Sign-in failed. Please try again." };
    }
    const loginData = data as {
        user: { id: string; email: string; role: string };
        customer: { first_name?: string | null; last_name?: string | null } | null;
        token: { value: string };
    };

    if (loginData.user.role !== "admin") {
        return {
            ok: false,
            error:
                locale === "fa"
                    ? "حساب کاربری شما اجازه ورود به پنل را ندارد."
                    : "This account is not allowed in the admin panel.",
        };
    }

    const customer = loginData.customer;
    const displayName =
        customer && (customer.first_name || customer.last_name)
            ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
            : loginData.user.email;

    const session = {
        token: loginData.token.value,
        userId: Number(loginData.user.id),
        email: loginData.user.email,
        displayName,
        tenantSlug: tenant,
    };

    const store = await cookies();
    store.set(SESSION_COOKIE, JSON.stringify(session), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
    });
    /**
     * Companion CSRF token: readable by client JS so the React Query mutation helpers can echo it
     * into the `X-CSRF-Token` header. The route handler proxy rejects mutations whose header value
     * doesn't match this cookie, blocking cross-origin requests even if the SameSite policy ever
     * relaxes.
     */
    store.set(CSRF_COOKIE, randomUUID(), {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
    });
    return { ok: true, error: null, redirectTo: getPathname({ href: "/dashboard", locale }) };
}

/**
 * Clears the session and tells the caller where to go next. Like {@link loginAction}, navigation
 * happens client-side (see the `redirectTo` note there) — {@link UserMenu} calls `window.location`
 * with the returned path so the post-logout `/login` render lands on the shop's own `Host`.
 */
export async function logoutAction(): Promise<{ redirectTo: string }> {
    const session = await getSession();
    const store = await cookies();
    if (session) {
        try {
            const api = createApiClient({
                baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
                token: session.token,
            });
            await api.storefront.POST("/api/v1/auth/logout", {});
        } catch {
            /** Best-effort revocation. The cookie is cleared either way. */
        }
    }
    store.delete(SESSION_COOKIE);
    store.delete(CSRF_COOKIE);
    return { redirectTo: getPathname({ href: "/login", locale: "fa" }) };
}

/**
 * Exit an impersonation session (RULE D). Calls `POST /api/v1/auth/impersonation/stop` so the API
 * revokes the short-lived impersonation token and stamps `ended_at` on the audit event, clears the
 * admin cookies, and returns the platform operator to the control plane (`NEXT_PUBLIC_CONSOLE_URL`)
 * — or this shop's login when no console URL is configured. Best-effort on the revoke: the cookies
 * are cleared regardless, so the operator always leaves the impersonated session.
 *
 * Navigation happens client-side ({@link ImpersonationBanner}) — see the `redirectTo` note on
 * {@link loginAction} for why a server-action redirect would land on the platform "unknown shop".
 * Returns the control-plane URL when configured, else this shop's login.
 */
export async function stopImpersonationAction(): Promise<{ redirectTo: string }> {
    const session = await getSession();
    const tenant = await tenantRefFromHeaders();
    if (session) {
        try {
            const api = createApiClient({
                baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
                token: session.token,
                ...(tenant ? { headers: { [TENANT_HEADER]: tenant } } : {}),
            });
            await api.storefront.POST("/api/v1/auth/impersonation/stop", {});
        } catch {
            /** Best-effort: the cookies are cleared either way so the impersonation can't continue. */
        }
    }
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    store.delete(CSRF_COOKIE);

    return { redirectTo: CONSOLE_URL.length > 0 ? CONSOLE_URL : getPathname({ href: "/login", locale: "fa" }) };
}
