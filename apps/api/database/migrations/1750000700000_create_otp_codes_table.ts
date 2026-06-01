import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * One-time codes for phone/email OTP login + verification. This is per-tenant data (a shopper's
 * phone is siloed per shop) so it carries `tenant_id` and is guarded by RLS here at creation —
 * deliberately excluded from the bulk RLS sweep migration to keep its definition self-contained.
 * Only the `code_hash` is stored; the plaintext code lives only in the dispatched SMS/email.
 */
export default class extends BaseSchema {
    protected tableName = "otp_codes";

    async up() {
        this.schema.createTable(this.tableName, (table) => {
            table.bigIncrements("id").notNullable();
            table
                .bigInteger("tenant_id")
                .unsigned()
                .notNullable()
                .references("id")
                .inTable("tenants")
                .onDelete("CASCADE");
            table.specificType("identifier", "citext").notNullable();
            table.string("channel", 8).notNullable();
            table.string("purpose", 8).notNullable();
            table.string("code_hash", 255).notNullable();
            table.timestamp("expires_at", { useTz: true }).notNullable();
            table.timestamp("consumed_at", { useTz: true }).nullable();
            table.integer("attempts").notNullable().defaultTo(0);

            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());

            table.index(["tenant_id", "identifier", "purpose"], "otp_codes_tenant_identifier_purpose_idx");
        });

        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "otp_codes_channel_check" CHECK (channel IN ('sms', 'email'))`,
        );
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "otp_codes_purpose_check" CHECK (purpose IN ('login', 'verify'))`,
        );

        this.schema.raw(`ALTER TABLE "${this.tableName}" ENABLE ROW LEVEL SECURITY`);
        this.schema.raw(`ALTER TABLE "${this.tableName}" FORCE ROW LEVEL SECURITY`);
        this.schema.raw(
            `CREATE POLICY "tenant_isolation" ON "${this.tableName}" ` +
                `USING (tenant_id = current_setting('app.current_tenant', true)::bigint) ` +
                `WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::bigint)`,
        );
    }

    async down() {
        this.schema.dropTable(this.tableName);
    }
}
