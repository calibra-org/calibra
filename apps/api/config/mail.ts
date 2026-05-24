import { defineConfig, transports } from "@adonisjs/mail";

import env from "#start/env";

/**
 * SMTP-only mail config. The dev/CI target is Mailpit (`scripts/mailpit-compose.yml`) on
 * `localhost:11025` — `SMTP_HOST=localhost` + `SMTP_PORT=11025` are written into the spin's
 * `.env` by `scripts/spin.mjs`. Production deployments override `SMTP_HOST/PORT/USERNAME/
 * PASSWORD` to point at the real relay.
 *
 * `MAIL_NOTIFICATIONS_ENABLED` gates the runner-side `mail.sendLater(...)` call — when false
 * (e.g. a CI run with no SMTP catcher), runners skip the notification step entirely instead of
 * failing the run when the SMTP connection refuses.
 */
export default defineConfig({
    default: "smtp",
    from: {
        address: env.get("MAIL_FROM_ADDRESS"),
        name: env.get("MAIL_FROM_NAME"),
    },
    mailers: {
        smtp: transports.smtp({
            host: env.get("SMTP_HOST"),
            port: env.get("SMTP_PORT"),
            secure: false,
            ignoreTLS: true,
            auth:
                env.get("SMTP_USERNAME") !== undefined
                    ? {
                          type: "login",
                          user: env.get("SMTP_USERNAME") as string,
                          pass: env.get("SMTP_PASSWORD") ?? "",
                      }
                    : undefined,
        }),
    },
});
