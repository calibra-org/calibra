/**
 * HTTP server entry. Runs directly (`node bin/server.js`) in production and behind `node ace serve`
 * in development.
 *
 * Sentry/GlitchTip init runs BEFORE the Ignitor boot so the SDK can patch http + global
 * unhandled handlers in time. Gated on `GLITCHTIP_DSN` — when blank (tests, no-spin dev,
 * production-with-no-GlitchTip) the SDK is never imported and the binary stays light.
 */

import "reflect-metadata";
import { Ignitor, prettyPrintError } from "@adonisjs/core";

if (process.env.GLITCHTIP_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({
        dsn: process.env.GLITCHTIP_DSN,
        environment: process.env.NODE_ENV ?? "development",
        release: process.env.GIT_SHA,
        /**
         * GlitchTip honours Sentry's `tracesSampleRate` semantics. 0.1 in dev is plenty
         * for catching pattern breakage without flooding the per-spin instance.
         */
        tracesSampleRate: 0.1,
    });
}

const APP_ROOT = new URL("../", import.meta.url);

const IMPORTER = (filePath: string) => {
    if (filePath.startsWith("./") || filePath.startsWith("../")) {
        return import(new URL(filePath, APP_ROOT).href);
    }
    return import(filePath);
};

new Ignitor(APP_ROOT, { importer: IMPORTER })
    .tap((app) => {
        app.booting(async () => {
            await import("#start/env");
        });
        app.listen("SIGTERM", () => app.terminate());
        app.listenIf(app.managedByPm2, "SIGINT", () => app.terminate());
    })
    .httpServer()
    .start()
    .catch((error) => {
        process.exitCode = 1;
        prettyPrintError(error);
    });
