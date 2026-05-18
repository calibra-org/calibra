import { defineConfig } from "@adonisjs/lucid";

import env from "#start/env";

/**
 * Lucid database config. Single Postgres connection — add named connections here if/when we split
 * read replicas or introduce per-tenant databases.
 *
 * @see https://lucid.adonisjs.com/docs/configuration
 */
const dbConfig = defineConfig({
    connection: "postgres",
    connections: {
        postgres: {
            client: "pg",
            connection: {
                host: env.get("DB_HOST"),
                port: env.get("DB_PORT"),
                user: env.get("DB_USER"),
                password: env.get("DB_PASSWORD"),
                database: env.get("DB_DATABASE"),
            },
            migrations: {
                naturalSort: true,
                paths: ["database/migrations"],
            },
            seeders: {
                paths: ["database/seeders"],
            },
        },
    },
});

export default dbConfig;
