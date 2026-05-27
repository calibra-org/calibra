import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Per-gateway non-secret metadata bag, separate from `settings` (which holds rotated credentials
 * and is mask-on-read). The first key shipped through `attributes` is
 * `implementation_status: "stub" | "live"`: stub gateways are seeded so the admin UI knows the
 * platform recognises them, but neither the operator-facing toggle nor the storefront submit
 * flow can flip them to enabled until a real adapter lands and the seeder writes `"live"`.
 *
 * Defaulted to `'{}'::jsonb` so historical rows are valid; the seeder backfills the
 * implementation_status key.
 */
export default class extends BaseSchema {
    protected tableName = "payment_gateways";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("attributes");
        });
    }
}
