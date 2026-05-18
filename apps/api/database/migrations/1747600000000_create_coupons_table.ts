import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "coupons";

    async up() {
        /**
         * `citext` was already created by the users migration; reasserting `IF NOT EXISTS` keeps
         * this file independently runnable when migrations are replayed against a fresh DB.
         */
        this.schema.raw("CREATE EXTENSION IF NOT EXISTS citext");

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            /**
             * Case-insensitive code so `WELCOME10` and `welcome10` resolve to the same row without
             * `LOWER(code) = LOWER(?)` everywhere; `@beforeSave` normalizes to uppercase for the
             * canonical display form.
             */
            table.specificType("code", "citext").notNullable();
            table.string("discount_type", 20).notNullable();
            /** Rial minor units; used by `fixed_cart` and `fixed_product`. NULL for percent / free_shipping. */
            table.bigInteger("amount_minor").nullable();
            /** Percent value 0–100 with two decimals; used only by `percent`. */
            table.decimal("amount_percent", 5, 2).nullable();
            table.timestamp("starts_at", { useTz: true }).nullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.boolean("individual_use").notNullable().defaultTo(false);
            table.boolean("exclude_sale_items").notNullable().defaultTo(false);
            table.bigInteger("minimum_amount").nullable();
            table.bigInteger("maximum_amount").nullable();
            table.integer("usage_limit_global").nullable();
            table.integer("usage_limit_per_user").nullable();
            table.integer("limit_usage_to_x_items").nullable();
            /**
             * Orthogonal to `discount_type='free_shipping'`. A percent coupon may also waive the
             * shipping line by setting this flag.
             */
            table.boolean("free_shipping").notNullable().defaultTo(false);
            table.string("status", 16).notNullable().defaultTo("active");
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.unique(["code"], { indexName: "coupons_code_unique" });
            table.index(["status"], "coupons_status_idx");
            table.index(["expires_at"], "coupons_expires_at_idx");
            table.index(["deleted_at"], "coupons_deleted_at_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "coupons_discount_type_check" CHECK (discount_type IN ('percent','fixed_cart','fixed_product','free_shipping'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "coupons_status_check" CHECK (status IN ('active','disabled'))`,
        );
        /**
         * Discount-type ↔ amount column shape: percent uses `amount_percent`, the fixed types use
         * `amount_minor`, and `free_shipping` uses neither (or either is fine — the discount math
         * never reads them). Enforced at the DB so misconfigured rows can't survive an admin update.
         */
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "coupons_amount_shape_check" CHECK (
                (discount_type = 'percent' AND amount_percent IS NOT NULL AND amount_minor IS NULL)
                OR (discount_type IN ('fixed_cart','fixed_product') AND amount_minor IS NOT NULL AND amount_percent IS NULL)
                OR (discount_type = 'free_shipping')
            )`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
