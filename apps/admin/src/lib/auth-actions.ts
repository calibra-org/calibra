"use server";

import { createApiClient } from "@calibra/sdk";
import { cookies } from "next/headers";

import { redirect } from "#/lib/i18n/navigation";

import { SESSION_COOKIE, getSession } from "./auth";

interface LoginState {
    ok: boolean;
    error: string | null;
}

/**
 * Calls `POST /api/v1/auth/login`, enforces an admin role, and stores the bearer token plus the
 * resolved user identity in the `admin_session` cookie (httpOnly). The cookie payload is
 * `{ token, userId, email, displayName }` JSON so `getSession()` can deserialise it without
 * round-tripping to the API on every page render.
 */
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
    const email = formData.get("email");
    const password = formData.get("password");
    const locale = (formData.get("__locale") as string | null) ?? "fa";
    if (typeof email !== "string" || typeof password !== "string" || email.length === 0 || password.length === 0) {
        return { ok: false, error: locale === "fa" ? "ایمیل و رمز عبور الزامی است." : "Email and password are required." };
    }

    const api = createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
        locale,
    });
    const { data, error, response } = await api.storefront.POST("/api/v1/auth/login", {
        body: { email, password },
    });
    if (error !== undefined || !data) {
        const status = response?.status ?? 400;
        if (status === 400 || status === 422) {
            return { ok: false, error: locale === "fa" ? "ایمیل یا رمز عبور نادرست است." : "Invalid email or password." };
        }
        return { ok: false, error: locale === "fa" ? "ورود ناموفق بود. دوباره تلاش کنید." : "Sign-in failed. Please try again." };
    }

    if (data.user.role !== "admin") {
        return { ok: false, error: locale === "fa" ? "حساب کاربری شما اجازه ورود به پنل را ندارد." : "This account is not allowed in the admin panel." };
    }

    const customer = data.customer;
    const displayName =
        customer && (customer.first_name || customer.last_name)
            ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
            : data.user.email;

    const session = {
        token: data.token.value,
        userId: Number(data.user.id),
        email: data.user.email,
        displayName,
    };

    const store = await cookies();
    store.set(SESSION_COOKIE, JSON.stringify(session), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
    });
    /** `redirect` throws an internal Next.js exception, so this never returns. The explicit
     * unreachable success object satisfies TypeScript's control-flow analysis. */
    redirect({ href: "/dashboard", locale });
    return { ok: true, error: null };
}

export async function logoutAction(): Promise<void> {
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
    redirect({ href: "/login", locale: "fa" });
}
