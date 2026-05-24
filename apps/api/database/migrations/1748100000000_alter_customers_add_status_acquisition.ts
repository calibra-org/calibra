import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customers";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.string("status", 16).notNullable().defaultTo("active");
            table.string("acquisition_channel", 32).nullable();
            table.timestamp("last_seen_at", { useTz: true }).nullable();
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "customers_status_check" CHECK (status IN ('active', 'suspended', 'deleted'))`,
        );

        this.schema.raw(`CREATE INDEX "customers_status_idx" ON "${this.tableName}" (status)`);
        this.schema.raw(
            `CREATE INDEX "customers_acquisition_channel_idx" ON "${this.tableName}" (acquisition_channel)`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "customers_acquisition_channel_idx"`);
        this.schema.raw(`DROP INDEX IF EXISTS "customers_status_idx"`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT IF EXISTS "customers_status_check"`);
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("last_seen_at");
            table.dropColumn("acquisition_channel");
            table.dropColumn("status");
        });
    }
}
