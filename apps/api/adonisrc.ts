import { indexEntities } from "@adonisjs/core";
import { defineConfig } from "@adonisjs/core/app";

export default defineConfig({
    /**
     * v7 hooks. `indexEntities()` is always required: it generates the barrel files under
     * `.adonisjs/server/` that power `#generated/*` imports for controllers, events, and policies.
     */
    hooks: {
        init: [indexEntities()],
    },

    /**
     * Ace commands. The `./commands/` directory auto-scans — list only third-party packages here.
     */
    commands: [() => import("@adonisjs/core/commands"), () => import("@adonisjs/lucid/commands")],

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
        () => import("@adonisjs/auth/auth_provider"),
    ],

    preloads: [() => import("#start/routes"), () => import("#start/kernel")],

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
