/**
 * Validated environment for the API. Anything read elsewhere via `env.get(…)` must be declared here
 * — values that don't pass validation will block boot in every environment, including production.
 */

import { Env } from "@adonisjs/core/env";

export default await Env.create(new URL("../", import.meta.url), {
    NODE_ENV: Env.schema.enum(["development", "production", "test"] as const),
    PORT: Env.schema.number(),
    APP_KEY: Env.schema.string(),
    APP_NAME: Env.schema.string(),
    HOST: Env.schema.string({ format: "host" }),
    LOG_LEVEL: Env.schema.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),

    /** Postgres connection — matches the `docker-compose.yml` defaults out of the box. */
    DB_HOST: Env.schema.string({ format: "host" }),
    DB_PORT: Env.schema.number(),
    DB_USER: Env.schema.string(),
    DB_PASSWORD: Env.schema.string.optional(),
    DB_DATABASE: Env.schema.string(),

    /** Comma-separated origins allowed via CORS. Empty falls back to `*` in dev. */
    ALLOWED_ORIGINS: Env.schema.string.optional(),

    /**
     * Mail / SMTP. The spin script writes `localhost:11025` (Mailpit) by default;
     * production overrides to the real relay. `MAIL_NOTIFICATIONS_ENABLED` is the runner-side
     * opt-out — CI runs with no catcher set it to `false` so terminal-event notifications
     * don't fail the test.
     */
    MAIL_FROM_ADDRESS: Env.schema.string({ format: "email" }),
    MAIL_FROM_NAME: Env.schema.string(),
    MAIL_NOTIFICATIONS_ENABLED: Env.schema.boolean(),
    SMTP_HOST: Env.schema.string({ format: "host" }),
    SMTP_PORT: Env.schema.number(),
    SMTP_USERNAME: Env.schema.string.optional(),
    SMTP_PASSWORD: Env.schema.string.optional(),
    MAILPIT_WEB_URL: Env.schema.string.optional(),
});
