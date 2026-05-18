import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "shipping_zones";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("name", 120).notNullable();
            table.boolean("is_fallback").notNullable().defaultTo(false);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        /**
         * At most one zone may be the fallback. Partial unique index keeps the constraint database-side
         * so concurrent inserts can't both claim it.
         */
        this.schema.raw(
            `CREATE UNIQUE INDEX "shipping_zones_one_fallback_unique" ON "${this.tableName}" ((1)) WHERE is_fallback = true`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
