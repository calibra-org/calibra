import { Secret } from "@adonisjs/core/helpers";
import { defineConfig } from "@adonisjs/core/http";
import app from "@adonisjs/core/services/app";

import env from "#start/env";

/**
 * Encryption key for cookies, signed URLs, and the encryption module. Losing or rotating it
 * invalidates all previously-signed data — keep it in a secret manager in production.
 */
export const appKey = new Secret(env.get("APP_KEY"));

export const http = defineConfig({
    generateRequestId: true,
    allowMethodSpoofing: false,
    /**
     * Async local storage lets you reach `HttpContext.getOrFail()` from anywhere (services, jobs,
     * models). Off by default — turn on when you need it and accept the small perf cost.
     */
    useAsyncLocalStorage: false,
    cookie: {
        domain: "",
        path: "/",
        maxAge: "2h",
        httpOnly: true,
        secure: app.inProduction,
        sameSite: "lax",
    },
});
