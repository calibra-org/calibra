import { indexPolicies } from "@adonisjs/bouncer";
import { indexEntities } from "@adonisjs/core";
import { defineConfig } from "@adonisjs/core/app";

export default defineConfig({
    /**
     * v7 hooks. `indexEntities()` is always required: it generates the barrel files under
     * `.adonisjs/server/` that power `#generated/*` imports for controllers, events, and policies.
     */
    hooks: {
        init: [indexEntities(), indexPolicies()],
    },

    /**
     * Ace commands. The `./commands/` directory auto-scans — list only third-party packages here.
     */
    commands: [
        () => import("@adonisjs/core/commands"),
        () => import("@adonisjs/lucid/commands"),
        () => import("@adonisjs/queue/commands"),
        () => import("@adonisjs/bouncer/commands"),
    ],

    /**
     * Service providers registered in boot order. Lucid must come before Auth (auth queries users
     * through the ORM); CORS slots in before the HTTP server starts dispatching.
     */
    providers: [
        () => import("@adonisjs/core/providers/app_provider"),
        () => import("@adonisjs/core/providers/hash_provider"),
        {
            file: () => import("@adonisjs/core/providers/repl_provider"),
            environment: ["repl", "test"],
        },
        () => import("@adonisjs/core/providers/vinejs_provider"),
        () => import("@adonisjs/cors/cors_provider"),
        () => import("@adonisjs/i18n/i18n_provider"),
        () => import("@adonisjs/lucid/database_provider"),
        () => import("@adonisjs/redis/redis_provider"),
        () => import("@adonisjs/auth/auth_provider"),
        () => import("@adonisjs/drive/drive_provider"),
        () => import("@adonisjs/cache/cache_provider"),
        () => import("@adonisjs/mail/mail_provider"),
        () => import("@adonisjs/queue/queue_provider"),
        () => import("@adonisjs/transmit/transmit_provider"),
        () => import("@adonisjs/bouncer/bouncer_provider"),
        () => import("@adonisjs/limiter/limiter_provider"),
        () => import("@adonisjs/shield/shield_provider"),
        () => import("@adonisjs/lock/lock_provider"),
    ],

    preloads: [
        () => import("#start/routes"),
        () => import("#start/kernel"),
        () => import("#start/transmit"),
        () => import("#start/limiter"),
    ],

    tests: {
        suites: [
            {
                files: ["tests/unit/**/*.spec.{ts,js}"],
                name: "unit",
                timeout: 2000,
            },
            {
                files: ["tests/functional/**/*.spec.{ts,js}"],
                name: "functional",
                timeout: 30_000,
            },
        ],
        forceExit: false,
    },
});
