import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "customer_downloads";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("customer_id").unsigned().notNullable().references("id").inTable("customers").onDelete("CASCADE");
            /**
             * `product_id`, `product_download_id`, and `order_id` are advisory bigints — the
             * `products` and `orders` tables were not yet present in the migration ordering when
             * this table was created. The FKs are added later, once those parents exist.
             */
            table.bigInteger("product_id").unsigned().notNullable();
            table.bigInteger("product_download_id").unsigned().nullable();
            table.bigInteger("order_id").unsigned().nullable();
            table.timestamp("granted_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.integer("download_limit").nullable();
            table.integer("downloads_used").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["customer_id"], "customer_downloads_customer_id_idx");
            table.index(["product_id"], "customer_downloads_product_id_idx");
            table.index(["order_id"], "customer_downloads_order_id_idx");
            table.index(["expires_at"], "customer_downloads_expires_at_idx");
        });
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
