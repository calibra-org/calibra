import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "tax_rates";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("tax_class_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("tax_classes")
                .onDelete("restrict");
            table.specificType("country", "char(2)").nullable();
            table.bigInteger("region_id").unsigned().nullable().references("id").inTable("regions").onDelete("restrict");
            table.specificType("postcodes", "text[]").nullable();
            table.specificType("cities", "text[]").nullable();
            table.decimal("rate", 7, 4).notNullable();
            table.string("label", 200).notNullable();
            table.smallint("priority").notNullable().defaultTo(1);
            table.boolean("compound").notNullable().defaultTo(false);
            table.boolean("applies_to_shipping").notNullable().defaultTo(false);
            table.integer("ordering").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tax_class_id"], "tax_rates_tax_class_id_idx");
            table.index(["country"], "tax_rates_country_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
