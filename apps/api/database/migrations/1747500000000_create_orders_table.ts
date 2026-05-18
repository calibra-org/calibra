import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "orders";

    async up() {
        /**
         * Postgres enum for `OrderStatus` (ADR D18). Created BEFORE the table so the column can
         * reference it by name. Mirrors `app/enums/order_status.ts` — keep both in sync; adding a
         * new status is a `CREATE TYPE … ADD VALUE` migration plus an enum-member addition.
         */
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE order_status_enum AS ENUM (
                    'draft', 'pending', 'on_hold', 'processing',
                    'completed', 'cancelled', 'refunded', 'failed'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();

            /**
             * Sequence-allocated, gap-free human-readable reference (ADR D4). Independent of `id`
             * so `id` stays opaque (security) while `order_number` stays compact. Default uses the
             * sequence created in the sibling `order_number_seq` migration.
             */
            table.bigInteger("order_number").notNullable().unique();

            /**
             * Opaque 32-char base32 token. Used in the guest pay-link URL when a failed/on-hold
             * order needs to be paid without an account. Nullable on draft rows (allocated when
             * status transitions out of draft).
             */
            table.specificType("order_key", "char(32)").nullable().unique();

            table.specificType("status", "order_status_enum").notNullable().defaultTo("draft");

            table.bigInteger("customer_id").unsigned().nullable().references("id").inTable("customers").onDelete("RESTRICT");

            table.string("billing_email", 254).nullable();

            /** Canonical money currency (always `IRR` in MVP, locked on creation per ADR D2). */
            table.specificType("currency", "char(3)").notNullable().defaultTo("IRR");
            /** Display currency — `IRT` or `IRR`, locked on creation. */
            table.specificType("currency_display", "char(3)").notNullable().defaultTo("IRT");

            /**
             * Payment-method snapshot. The FK is advisory (`SET NULL`) — historical orders survive
             * gateway deletion; the snapshot strings preserve what was shown to the customer at
             * checkout time.
             */
            table
                .bigInteger("payment_gateway_id_snapshot")
                .unsigned()
                .nullable()
                .references("id")
                .inTable("payment_gateways")
                .onDelete("SET NULL");
            table.string("payment_method_code_snapshot", 64).nullable();
            table.string("payment_method_title_snapshot", 200).nullable();

            /** Set on payment capture (phase 08). Unique across the table so PSP IDs cannot collide. */
            table.string("transaction_id", 200).nullable();

            table.text("customer_note").nullable();

            /** Totals in canonical money minor units (Rial). Every monetary column is BIGINT. */
            table.bigInteger("items_total").notNullable().defaultTo(0);
            table.bigInteger("items_tax_total").notNullable().defaultTo(0);
            table.bigInteger("shipping_total").notNullable().defaultTo(0);
            table.bigInteger("shipping_tax_total").notNullable().defaultTo(0);
            table.bigInteger("fees_total").notNullable().defaultTo(0);
            table.bigInteger("fees_tax_total").notNullable().defaultTo(0);
            table.bigInteger("discount_total").notNullable().defaultTo(0);
            table.bigInteger("discount_tax_total").notNullable().defaultTo(0);
            table.bigInteger("tax_total").notNullable().defaultTo(0);
            table.bigInteger("grand_total").notNullable().defaultTo(0);

            table.boolean("prices_include_tax").notNullable().defaultTo(true);

            table.string("created_via", 20).notNullable().defaultTo("checkout");

            table.specificType("ip_address", "inet").nullable();
            table.text("user_agent").nullable();

            /**
             * Idempotency-Key header value, dedupes `POST /checkout/submit`. Partial unique index
             * (defined below) treats NULL as not-conflicting so drafts and admin-created orders
             * with no key coexist.
             */
            table.string("idempotency_key", 64).nullable();
            /** Snapshot of the source cart's id for forensic linking (cart row is deleted post-submit). */
            table.string("cart_hash", 64).nullable();

            table.timestamp("date_paid_at", { useTz: true }).nullable();
            table.timestamp("date_completed_at", { useTz: true }).nullable();

            table.jsonb("attributes").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            table.timestamp("deleted_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["status"], "orders_status_idx");
            table.index(["customer_id"], "orders_customer_id_idx");
            table.index(["created_at"], "orders_created_at_idx");
            table.index(["created_via"], "orders_created_via_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "orders_created_via_check" CHECK (created_via IN ('checkout','admin','api','import'))`,
        );

        /** Idempotency key uniqueness only constrains real values; NULLs (drafts) are unconstrained. */
        this.schema.raw(
            `CREATE UNIQUE INDEX "orders_idempotency_key_unique" ON "${this.tableName}" (idempotency_key) WHERE idempotency_key IS NOT NULL`,
        );
        /** Live-state listing queries hit `WHERE deleted_at IS NULL` constantly — index the predicate. */
        this.schema.raw(`CREATE INDEX "orders_live_idx" ON "${this.tableName}" (id) WHERE deleted_at IS NULL`);
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "orders_live_idx"`);
        this.schema.raw(`DROP INDEX IF EXISTS "orders_idempotency_key_unique"`);
        this.schema.dropTable(this.tableName);
        this.schema.raw(`DROP TYPE IF EXISTS order_status_enum`);
    }
}
