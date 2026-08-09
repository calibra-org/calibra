import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Promotes the schema-only `order_documents` landing table into the tenant-scoped invoice and
 * proforma subsystem. Existing order documents remain valid; every new column is additive and
 * nullable/defaulted. Monetary values are stored as integer tenant-currency minor units.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.raw(`ALTER TYPE "order_document_type_enum" ADD VALUE IF NOT EXISTS 'proforma'`);
        this.schema.raw(`ALTER TYPE "order_document_type_enum" ADD VALUE IF NOT EXISTS 'invoice'`);
        this.schema.raw(`ALTER TYPE "order_document_type_enum" ADD VALUE IF NOT EXISTS 'credit_note'`);

        /** Backing orders created by this module must be distinguishable without bypassing the base check. */
        this.schema.raw(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_created_via_check"`);
        this.schema.raw(
            `ALTER TABLE "orders" ADD CONSTRAINT "orders_created_via_check" CHECK (created_via IN ('checkout','admin','api','import','factor'))`,
        );

        this.schema.alterTable("order_documents", (table) => {
            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("SET NULL");
            table
                .bigInteger("parent_document_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("order_documents")
                .onDelete("SET NULL");
            table.string("reference", 80).nullable();
            table.string("delivery_channel", 24).notNullable().defaultTo("none");
            table.jsonb("customer_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("billing_snapshot").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("subtotal_minor").notNullable().defaultTo(0);
            table.bigInteger("line_discount_minor").notNullable().defaultTo(0);
            table.bigInteger("order_discount_minor").notNullable().defaultTo(0);
            table.bigInteger("shipping_minor").notNullable().defaultTo(0);
            table.bigInteger("tax_minor").notNullable().defaultTo(0);
            table.bigInteger("rounding_minor").notNullable().defaultTo(0);
            table.bigInteger("round_to_minor").notNullable().defaultTo(1);
            table.bigInteger("payable_minor").notNullable().defaultTo(0);
            table.decimal("tax_percent", 8, 4).notNullable().defaultTo(0);
            table.text("customer_note").nullable();
            table.text("internal_note").nullable();
            table.timestamp("due_at", { useTz: true }).nullable();
            table.timestamp("expires_at", { useTz: true }).nullable();
            table.timestamp("sent_at", { useTz: true }).nullable();
            table.timestamp("viewed_at", { useTz: true }).nullable();
            table.timestamp("paid_at", { useTz: true }).nullable();
            table.timestamp("cancelled_at", { useTz: true }).nullable();
            table.integer("version").notNullable().defaultTo(1);
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
        });

        this.schema.raw(`ALTER TABLE "order_documents" ALTER COLUMN "order_id" DROP NOT NULL`);
        this.schema.raw(`ALTER TABLE "order_documents" DROP CONSTRAINT IF EXISTS "order_documents_status_check"`);
        this.schema.raw(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_status_check" CHECK (status IN (` +
                `'draft','sent','viewed','awaiting','paid','expired','cancelled','refunded','credited','issued','voided'))`,
        );
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_type_number_unique"`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_tenant_type_number_unique" ON "order_documents" (tenant_id, type, number) WHERE number IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_tenant_reference_unique" ON "order_documents" (tenant_id, reference) WHERE reference IS NOT NULL`,
        );
        this.schema.raw(`CREATE INDEX "order_documents_customer_id_idx" ON "order_documents" (customer_id)`);
        this.schema.raw(`CREATE INDEX "order_documents_status_due_idx" ON "order_documents" (status, due_at)`);
        this.schema.raw(`CREATE INDEX "order_documents_parent_id_idx" ON "order_documents" (parent_document_id)`);
        this.schema.raw(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_factor_delivery_channel_check" ` +
                `CHECK (delivery_channel IN ('none','sms','email','whatsapp'))`,
        );
        this.schema.raw(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_factor_money_check" ` +
                `CHECK (subtotal_minor >= 0 AND line_discount_minor >= 0 AND order_discount_minor >= 0 ` +
                `AND shipping_minor >= 0 AND tax_minor >= 0 AND payable_minor >= 0 AND round_to_minor > 0 AND tax_percent >= 0 AND tax_percent <= 100)`,
        );

        this.schema.createTable("order_document_items", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("document_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_documents")
                .onDelete("CASCADE");
            table.bigInteger("product_id").unsigned().nullable().references("id").inTable("products").onDelete("SET NULL");
            table
                .bigInteger("variation_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("product_variations")
                .onDelete("SET NULL");
            table.string("sku_snapshot", 191).nullable();
            table.string("name_snapshot", 255).notNullable();
            table.text("description_snapshot").nullable();
            table.integer("quantity").notNullable();
            table.bigInteger("unit_price_minor").notNullable();
            table.decimal("discount_percent", 8, 4).notNullable().defaultTo(0);
            table.bigInteger("discount_minor").notNullable().defaultTo(0);
            table.decimal("tax_percent", 8, 4).notNullable().defaultTo(0);
            table.bigInteger("tax_minor").notNullable().defaultTo(0);
            table.bigInteger("line_total_minor").notNullable();
            table.integer("position").notNullable().defaultTo(0);
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "document_id"], "order_document_items_tenant_document_idx");
            table.index(["product_id"], "order_document_items_product_idx");
        });

        this.schema.createTable("order_document_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("document_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_documents")
                .onDelete("CASCADE");
            table.bigInteger("actor_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.string("event_type", 80).notNullable();
            table.jsonb("metadata").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "document_id", "created_at"], "order_document_events_tenant_document_idx");
        });

        this.schema.createTable("factor_document_payments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().references("id").inTable("tenants").onDelete("CASCADE");
            table
                .bigInteger("document_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("order_documents")
                .onDelete("CASCADE");
            table
                .bigInteger("payment_attempt_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("payment_attempts")
                .onDelete("SET NULL");
            table
                .bigInteger("gateway_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("payment_gateways")
                .onDelete("SET NULL");
            table.bigInteger("amount_minor").notNullable();
            table.string("method", 32).notNullable().defaultTo("manual");
            table.string("status", 20).notNullable().defaultTo("paid");
            table.string("reference", 191).nullable();
            table.text("notes").nullable();
            table.timestamp("paid_at", { useTz: true }).nullable();
            table.bigInteger("created_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.index(["tenant_id", "document_id"], "factor_document_payments_tenant_document_idx");
            table.index(["status", "paid_at"], "factor_document_payments_status_paid_idx");
        });
        this.schema.raw(
            `ALTER TABLE "factor_document_payments" ADD CONSTRAINT "factor_document_payments_status_check" CHECK (status IN ('pending','paid','failed','refunded'))`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "factor_document_payments_attempt_unique" ON "factor_document_payments" (payment_attempt_id) WHERE payment_attempt_id IS NOT NULL`,
        );
        this.schema.raw(
            `ALTER TABLE "order_document_items" ADD CONSTRAINT "order_document_items_factor_values_check" ` +
                `CHECK (quantity > 0 AND unit_price_minor >= 0 AND discount_percent >= 0 AND discount_percent <= 100 ` +
                `AND discount_minor >= 0 AND tax_percent >= 0 AND tax_percent <= 100 AND tax_minor >= 0 AND line_total_minor >= 0)`,
        );
        this.schema.raw(
            `ALTER TABLE "factor_document_payments" ADD CONSTRAINT "factor_document_payments_amount_check" CHECK (amount_minor > 0)`,
        );

        this.schema.alterTable("payment_links", (table) => {
            table
                .bigInteger("document_id")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("order_documents")
                .onDelete("SET NULL");
        });
        this.schema.raw(`CREATE INDEX "payment_links_document_id_idx" ON "payment_links" (document_id)`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "payment_links_one_active_per_document" ON "payment_links" (tenant_id, document_id) ` +
                `WHERE status = 'active' AND document_id IS NOT NULL`,
        );

        for (const table of ["order_document_items", "order_document_events", "factor_document_payments"]) {
            this.schema.raw(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
            this.schema.raw(
                `CREATE POLICY "tenant_isolation" ON "${table}" ` +
                    `USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint) ` +
                    `WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint)`,
            );
        }
    }

    async down() {
        this.schema.raw(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM "order_documents"
                    WHERE type::text IN ('proforma','invoice','credit_note')
                ) THEN
                    RAISE EXCEPTION 'Factor migration is forward-only while factor documents exist. Restore a verified database backup instead.';
                END IF;
            END
            $$;
        `);
        this.schema.raw(`DROP INDEX IF EXISTS "payment_links_one_active_per_document"`);
        this.schema.raw(`DROP INDEX IF EXISTS "payment_links_document_id_idx"`);
        this.schema.raw(`DROP INDEX IF EXISTS "factor_document_payments_attempt_unique"`);
        this.schema.alterTable("payment_links", (table) => table.dropColumn("document_id"));
        this.schema.dropTable("factor_document_payments");
        this.schema.dropTable("order_document_events");
        this.schema.dropTable("order_document_items");

        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_tenant_reference_unique"`);
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_tenant_type_number_unique"`);
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_customer_id_idx"`);
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_status_due_idx"`);
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_parent_id_idx"`);
        this.schema.raw(
            `ALTER TABLE "order_documents" DROP CONSTRAINT IF EXISTS "order_documents_factor_delivery_channel_check"`,
        );
        this.schema.raw(`ALTER TABLE "order_documents" DROP CONSTRAINT IF EXISTS "order_documents_factor_money_check"`);
        this.schema.raw(`ALTER TABLE "order_documents" DROP CONSTRAINT IF EXISTS "order_documents_status_check"`);
        this.schema.raw(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_status_check" CHECK (status IN ('draft','issued','voided'))`,
        );
        this.schema.alterTable("order_documents", (table) => {
            table.dropColumn("customer_id");
            table.dropColumn("parent_document_id");
            table.dropColumn("reference");
            table.dropColumn("delivery_channel");
            table.dropColumn("customer_snapshot");
            table.dropColumn("billing_snapshot");
            table.dropColumn("subtotal_minor");
            table.dropColumn("line_discount_minor");
            table.dropColumn("order_discount_minor");
            table.dropColumn("shipping_minor");
            table.dropColumn("tax_minor");
            table.dropColumn("rounding_minor");
            table.dropColumn("round_to_minor");
            table.dropColumn("payable_minor");
            table.dropColumn("tax_percent");
            table.dropColumn("customer_note");
            table.dropColumn("internal_note");
            table.dropColumn("due_at");
            table.dropColumn("expires_at");
            table.dropColumn("sent_at");
            table.dropColumn("viewed_at");
            table.dropColumn("paid_at");
            table.dropColumn("cancelled_at");
            table.dropColumn("version");
            table.dropColumn("created_by_user_id");
        });
        this.schema.raw(`ALTER TABLE "order_documents" ALTER COLUMN "order_id" SET NOT NULL`);
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_type_number_unique" ON "order_documents" (tenant_id, type, number) WHERE number IS NOT NULL`,
        );
        this.schema.raw(`UPDATE "orders" SET created_via = 'admin' WHERE created_via = 'factor'`);
        this.schema.raw(`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_created_via_check"`);
        this.schema.raw(
            `ALTER TABLE "orders" ADD CONSTRAINT "orders_created_via_check" CHECK (created_via IN ('checkout','admin','api','import'))`,
        );
    }
}
