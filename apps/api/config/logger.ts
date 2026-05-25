import { defineConfig, targets } from "@adonisjs/core/logger";
import app from "@adonisjs/core/services/app";

import env from "#start/env";

/**
 * When the spin runs in observability mode it also tees ndjson to a per-spin file
 * (`<worktree>/.spin/logs/api.ndjson`). Promtail bind-mounts that path and ships every line
 * to Loki with `service=calibra-api` + `spin=<slug>` labels. The file target stays inert in
 * production and tests where `DEV_OBSERVABILITY` is unset.
 */
const spinLogPath = env.get("DEV_OBSERVABILITY") ? env.get("SPIN_API_LOG_PATH") : undefined;

const loggerConfig = defineConfig({
    default: "app",
    loggers: {
        app: {
            enabled: true,
            name: env.get("APP_NAME"),
            level: env.get("LOG_LEVEL"),
            transport: {
                /**
                 * Pretty-print to stdout in dev; ndjson to stdout in production so the host log
                 * aggregator (Loki, CloudWatch, Datadog) can parse without a custom transformer.
                 * In a spin with observability enabled we additionally tee ndjson to a file that
                 * Promtail watches — keeps the dev console readable while still feeding Loki.
                 */
                targets: targets()
                    .pushIf(!app.inProduction, targets.pretty())
                    .pushIf(app.inProduction, targets.file({ destination: 1 }))
                    .pushIf(Boolean(spinLogPath), targets.file({ destination: spinLogPath ?? "/dev/null" }))
                    .toArray(),
            },
        },
    },
});

export default loggerConfig;

declare module "@adonisjs/core/types" {
    export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
