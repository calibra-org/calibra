import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "product_reviews";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("product_id").unsigned().notNullable().references("id").inTable("products").onDelete("cascade");
            table.bigInteger("customer_id").unsigned().nullable();
            table.string("reviewer_name", 200).notNullable();
            table.string("reviewer_email", 320).notNullable();
            table.text("body").notNullable();
            table.smallint("rating").notNullable();
            table.string("status", 16).notNullable().defaultTo("pending");
            table.boolean("verified").notNullable().defaultTo(false);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["product_id"], "product_reviews_product_id_idx");
            table.index(["status"], "product_reviews_status_idx");
            table.index(["customer_id"], "product_reviews_customer_id_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "product_reviews_status_check" CHECK (status IN ('pending','approved','spam','trash'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "product_reviews_rating_check" CHECK (rating BETWEEN 1 AND 5)`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
