import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    protected tableName = "payment_attempts";

    async up() {
        /**
         * Postgres enum for `PaymentAttemptStatus`. Created BEFORE the table so the column can
         * reference it by name. Mirrors `app/enums/payment_attempt_status.ts`.
         */
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE payment_attempt_status_enum AS ENUM (
                    'initiated', 'awaiting_callback', 'verified', 'failed', 'cancelled', 'refunded'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);

        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("order_id").unsigned().notNullable().references("id").inTable("orders").onDelete("CASCADE");
            table
                .bigInteger("gateway_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("payment_gateways")
                .onDelete("RESTRICT");
            /** Frozen at init so the audit row survives gateway-row deletion or code rename. */
            table.string("gateway_code_snapshot", 50).notNullable();
            table.specificType("status", "payment_attempt_status_enum").notNullable().defaultTo("initiated");

            /** Money in canonical minor units (Rial). Matches `orders.grand_total`. */
            table.bigInteger("amount_minor").notNullable();
            table.specificType("currency", "char(3)").notNullable();

            /** PSP intermediate token (ZarinPal `Authority`, IDPay `id`, …). NULL until `init` succeeds. */
            table.string("gateway_authority", 100).nullable();
            /** Final PSP transaction id. NULL until `verify` succeeds. */
            table.string("gateway_transaction_id", 100).nullable();

            /** Full PSP request/response payload for forensics. Never queried in hot paths. */
            table.jsonb("gateway_payload").notNullable().defaultTo(this.raw("'{}'::jsonb"));

            /** `Idempotency-Key` header value, dedupes parallel inits for the same order. */
            table.string("idempotency_key", 64).nullable();

            table.string("error_code", 50).nullable();
            table.text("error_message").nullable();

            table.timestamp("initiated_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("verified_at", { useTz: true }).nullable();

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["order_id"], "payment_attempts_order_id_idx");
            table.index(["gateway_id", "status"], "payment_attempts_gateway_status_idx");
            table.index(["initiated_at"], "payment_attempts_initiated_at_idx");
            table.index(["gateway_id", "gateway_authority"], "payment_attempts_gateway_authority_idx");
        });

        /**
         * UNIQUE (gateway_id, gateway_transaction_id) is the anti-double-credit guarantee. Partial
         * index treats NULL as non-conflicting so multiple initiated/failed attempts coexist; only
         * verified rows (with a real transaction_id) cannot collide.
         */
        this.schema.raw(
            `CREATE UNIQUE INDEX "payment_attempts_gateway_tx_unique" ON "${this.tableName}" (gateway_id, gateway_transaction_id) WHERE gateway_transaction_id IS NOT NULL`,
        );

        /** Idempotency key uniqueness only constrains real values. */
        this.schema.raw(
            `CREATE UNIQUE INDEX "payment_attempts_idempotency_key_unique" ON "${this.tableName}" (idempotency_key) WHERE idempotency_key IS NOT NULL`,
        );
    }

    async down() {
        this.schema.raw(`DROP INDEX IF EXISTS "payment_attempts_idempotency_key_unique"`);
        this.schema.raw(`DROP INDEX IF EXISTS "payment_attempts_gateway_tx_unique"`);
        this.schema.dropTable(this.tableName);
        this.schema.raw(`DROP TYPE IF EXISTS payment_attempt_status_enum`);
    }
}
