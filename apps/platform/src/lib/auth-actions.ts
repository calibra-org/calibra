"use server";

import { randomUUID } from "node:crypto";
import { BackendError, createApiClient } from "@calibra/sdk";
import { cookies } from "next/headers";

import { getPathname } from "#/lib/i18n/navigation";

import { CSRF_COOKIE, SESSION_COOKIE } from "./auth";

interface LoginState {
    ok: boolean;
    error: string | null;
    /**
     * On success, the locale-aware path the client should navigate to. We do **not** `redirect()`
     * from the server action: Next resolves a server-action redirect by sub-rendering the
     * destination through an internal fetch to its own loopback origin, which can land on the wrong
     * host. A real browser navigation from the client always carries the right `Host`.
     * {@link LoginForm} reads this and calls `window.location.assign`.
     */
    redirectTo?: string;
}

/**
 * Calls `POST /api/v1/platform/auth/login` and stores the `pat_` bearer plus the operator identity
 * in the `platform_session` cookie (httpOnly). Global route — no tenant context. Any valid platform
 * operator (owner or staff) may sign in; a shopper/shop token can't authenticate against the
 * platform guard, so there's nothing extra to gate here.
 */
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
    const email = formData.get("email");
    const password = formData.get("password");
    const locale = (formData.get("__locale") as string | null) ?? "fa";
    if (typeof email !== "string" || typeof password !== "string" || email.length === 0 || password.length === 0) {
        return { ok: false, error: locale === "fa" ? "ایمیل و رمز عبور الزامی است." : "Email and password are required." };
    }

    const api = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL, locale });
    /** The login response is the standard `{ data: PlatformAuthSession }` envelope — unwrap `.data`. */
    let loginData:
        | { platform_user: { id: number; email: string; name: string | null; role: string }; token: { value: string } }
        | undefined;
    try {
        const result = await api.platform.POST("/api/v1/platform/auth/login", { body: { email, password } });
        loginData = result.data?.data as typeof loginData;
    } catch (err) {
        if (err instanceof BackendError && (err.status === 400 || err.status === 401 || err.status === 422)) {
            return { ok: false, error: locale === "fa" ? "ایمیل یا رمز عبور نادرست است." : "Invalid email or password." };
        }
        return { ok: false, error: locale === "fa" ? "ورود ناموفق بود. دوباره تلاش کنید." : "Sign-in failed. Please try again." };
    }
    if (!loginData || !loginData.platform_user || !loginData.token) {
        return { ok: false, error: locale === "fa" ? "ورود ناموفق بود. دوباره تلاش کنید." : "Sign-in failed. Please try again." };
    }

    const session = {
        token: loginData.token.value,
        userId: Number(loginData.platform_user.id),
        email: loginData.platform_user.email,
        name: loginData.platform_user.name ?? loginData.platform_user.email,
        role: loginData.platform_user.role,
    };

    const store = await cookies();
    store.set(SESSION_COOKIE, JSON.stringify(session), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
    });
    /** Companion CSRF token, readable by client JS so mutation helpers can echo it into the
     * `X-CSRF-Token` header the proxy validates on writes. */
    store.set(CSRF_COOKIE, randomUUID(), {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
    });
    return { ok: true, error: null, redirectTo: getPathname({ href: "/", locale }) };
}

/**
 * Clears the session cookies and tells the caller where to go next. Navigation happens client-side
 * (see the `redirectTo` note on {@link loginAction}). There's no platform logout endpoint — the
 * `pat_` token simply expires; clearing the cookie ends the console session immediately.
 */
export async function logoutAction(): Promise<{ redirectTo: string }> {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    store.delete(CSRF_COOKIE);
    return { redirectTo: getPathname({ href: "/login", locale: "fa" }) };
}
