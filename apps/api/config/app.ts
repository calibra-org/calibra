import { defineConfig } from "@adonisjs/core/http";
import app from "@adonisjs/core/services/app";

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
