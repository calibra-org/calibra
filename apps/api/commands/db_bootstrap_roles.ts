import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Creates the two Postgres roles the multi-tenant runtime needs — `calibra_app` (NOBYPASSRLS,
 * runtime) and `calibra_admin` (BYPASSRLS, migrations/seeders/worker). Run ONCE per database against
 * a superuser connection (role creation with `BYPASSRLS` requires superuser); idempotent on re-run.
 *
 * Connects via `DB_SUPERUSER_USER`/`DB_SUPERUSER_PASSWORD` (falling back to `DB_USER`/`DB_PASSWORD`),
 * which must be a superuser. The role names + passwords come from `DB_ADMIN_USER`/`DB_ADMIN_PASSWORD`
 * and `DB_USER`/`DB_PASSWORD`. After this runs, point migrations + seeders at `postgres_admin` and the
 * runtime at the default `postgres` connection.
 *
 *   node ace db:bootstrap-roles
 */
export default class DbBootstrapRoles extends BaseCommand {
    static commandName = "db:bootstrap-roles";
    static description = "Create the calibra_app (NOBYPASSRLS) + calibra_admin (BYPASSRLS) Postgres roles. Idempotent.";

    static options: CommandOptions = {
        startApp: true,
    };

    async run() {
        const { default: env } = await import("#start/env");
        const { default: db } = await import("@adonisjs/lucid/services/db");
        const { bootstrapRoles } = await import("#services/db_roles");

        const appUser = env.get("DB_USER");
        const appPassword = env.get("DB_PASSWORD");
        const adminUser = env.get("DB_ADMIN_USER");
        const adminPassword = env.get("DB_ADMIN_PASSWORD");

        if (!adminUser || !adminPassword) {
            this.logger.error("DB_ADMIN_USER and DB_ADMIN_PASSWORD must be set to bootstrap roles.");
            this.exitCode = 1;
            return;
        }
        if (!appPassword) {
            this.logger.error("DB_PASSWORD must be set (calibra_app needs a password to LOGIN).");
            this.exitCode = 1;
            return;
        }

        const connectionName = "postgres_superuser";
        db.manager.add(connectionName, {
            client: "pg",
            connection: {
                host: env.get("DB_HOST"),
                port: env.get("DB_PORT"),
                user: env.get("DB_SUPERUSER_USER") ?? appUser,
                password: env.get("DB_SUPERUSER_PASSWORD") ?? appPassword,
                database: env.get("DB_DATABASE"),
            },
        });

        try {
            const client = db.connection(connectionName);
            await bootstrapRoles(client, { appUser, appPassword, adminUser, adminPassword });
            this.logger.success(`Roles ready: ${appUser} (NOBYPASSRLS) + ${adminUser} (BYPASSRLS).`);
        } finally {
            await db.manager.close(connectionName);
        }
    }
}
