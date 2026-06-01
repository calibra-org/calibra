import type { QueryClientContract } from "@adonisjs/lucid/types/database";

/**
 * Idempotent bootstrap of the two Postgres roles the multi-tenant runtime depends on. Must run on a
 * **superuser** connection — `BYPASSRLS` can only be granted by a superuser.
 *
 *  - `calibra_admin` (LOGIN, **BYPASSRLS**, CREATE on schema) — owns the schema; migrations,
 *    seeders, and the queue worker connect as this role so they read/write across every tenant.
 *  - `calibra_app` (LOGIN, NOSUPERUSER, **NOBYPASSRLS**) — the runtime app role. RLS is always
 *    enforced for it; default privileges grant it DML on every table `calibra_admin` creates.
 *
 * Re-running is a no-op beyond re-asserting attributes, passwords, and grants. Identifiers are fixed
 * constants; only the passwords are interpolated, single-quote-escaped (Postgres `PASSWORD` requires
 * a string literal and cannot be a bind parameter).
 */
export interface BootstrapRolesConfig {
    appUser: string;
    appPassword: string;
    adminUser: string;
    adminPassword: string;
}

/** Escape a single-quoted Postgres string literal. */
function lit(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
}

/** Quote a Postgres identifier (role name). */
function ident(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}

async function ensureRole(
    client: QueryClientContract,
    role: string,
    password: string,
    attributes: string,
): Promise<void> {
    const exists = await client.rawQuery("SELECT 1 FROM pg_roles WHERE rolname = ?", [role]);
    const verb = exists.rows.length > 0 ? "ALTER" : "CREATE";
    await client.rawQuery(`${verb} ROLE ${ident(role)} WITH LOGIN ${attributes} PASSWORD ${lit(password)}`);
}

/**
 * Creates/updates the roles and (re)applies grants + default privileges so that every table the
 * admin role creates is automatically DML-accessible to the app role.
 */
export async function bootstrapRoles(client: QueryClientContract, config: BootstrapRolesConfig): Promise<void> {
    await ensureRole(client, config.adminUser, config.adminPassword, "NOSUPERUSER BYPASSRLS CREATEDB");
    await ensureRole(client, config.appUser, config.appPassword, "NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");

    const app = ident(config.appUser);
    const admin = ident(config.adminUser);

    const statements = [
        `GRANT USAGE ON SCHEMA public TO ${app}, ${admin}`,
        `GRANT CREATE ON SCHEMA public TO ${admin}`,
        /**
         * App role: DML only. Admin role: full DML on tables it doesn't own too — in the canonical
         * flow calibra_admin owns the tables it migrates, but when a superuser ran the migrations
         * (dev DBs, fresh validation) the admin role needs explicit grants to read/write across them.
         */
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${app}`,
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${app}`,
        `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO ${admin}`,
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${admin}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${admin} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE ${admin} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${app}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${app}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO ${admin}`,
        `ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${admin}`,
    ];

    for (const sql of statements) {
        await client.rawQuery(sql);
    }
}
