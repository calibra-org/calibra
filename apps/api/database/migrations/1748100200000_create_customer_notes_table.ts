import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_notes";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            table.bigInteger("author_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.text("body").notNullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["customer_id", "created_at"], "customer_notes_customer_id_created_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
