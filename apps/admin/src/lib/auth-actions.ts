"use server";

import { cookies } from "next/headers";

import { redirect } from "#/lib/i18n/navigation";

import { SESSION_COOKIE } from "./auth";

/**
 * Mock login. Accepts any non-empty email + password and writes a token-shaped value to the
 * `admin_session` cookie. When phase 03 lands, replace the cookie write with
 * `apiServer().auth.login({ email, password })` and store the returned bearer.
 */
export async function loginAction(
    _state: { ok: boolean; error: string | null },
    formData: FormData,
): Promise<{ ok: boolean; error: string | null }> {
    const email = formData.get("email");
    const password = formData.get("password");
    const locale = (formData.get("__locale") as string | null) ?? "fa";
    if (typeof email !== "string" || typeof password !== "string" || email.length === 0 || password.length === 0) {
        return { ok: false, error: locale === "fa" ? "ایمیل و رمز عبور الزامی است." : "Email and password are required." };
    }
    const store = await cookies();
    store.set(SESSION_COOKIE, `mock_${Date.now()}`, {
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
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect({ href: "/login", locale: "fa" });
}
