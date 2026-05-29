import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "currencies";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.string("code", 8).notNullable();
            table.string("symbol", 16).notNullable();
            table.string("name_en", 64).notNullable();
            table.string("name_fa", 64).notNullable();
            table.integer("decimals").notNullable().defaultTo(0);
            table.string("position", 12).notNullable().defaultTo("right_space");

            /**
             * Stored-base (Rial) minor units per one MAJOR unit of this currency. IRR=1, IRT=10,
             * IRHR=1000, IRHT=10000 — the Rial family is the only set with a defined ratio. Non-Rial
             * currencies seed `0` (a sentinel meaning "no Rial relationship"); they ship disabled
             * until a future cross-currency FX mechanism lands — that work would add an
             * exchange-rate column here rather than overloading `base_ratio`.
             */
            table.integer("base_ratio").notNullable();
            table.boolean("enabled").notNullable().defaultTo(false);
            table.integer("ordering").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["code"], { indexName: "currencies_code_unique" });
            table.index(["enabled", "ordering"], "currencies_enabled_ordering_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "currencies_position_check" CHECK (position IN ('left', 'right', 'left_space', 'right_space'))`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
