import * as Sentry from "@sentry/node";

/**
 * Initialise Sentry **before** anything else loads, so its async-hook patching catches
 * the instrumented modules. When `SENTRY_DSN` is not set the SDK installs no transport
 * and `captureException(...)` returns immediately — handy for local dev + CI.
 *
 * The DSN is read straight from `process.env` here, not via `#start/env`, because the
 * env validator runs later in the boot order (under `app.booting`). Sentry needs to be
 * armed before that.
 */
const dsn = process.env.SENTRY_DSN;
if (dsn !== undefined && dsn !== "") {
    Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? "development",
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
}
