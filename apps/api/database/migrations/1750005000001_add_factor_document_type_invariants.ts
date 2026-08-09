import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds enum-dependent factor invariants after the enum values from the preceding migration
 * have committed. PostgreSQL partial-index predicates must use immutable expressions, so the
 * native enum equality operator is used instead of casting the enum column to text.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_one_invoice_per_parent" ON "order_documents" (tenant_id, parent_document_id) ` +
                `WHERE type = 'invoice'::order_document_type_enum AND parent_document_id IS NOT NULL`,
        );
        this.schema.raw(
            `CREATE UNIQUE INDEX "order_documents_one_credit_note_per_parent" ON "order_documents" (tenant_id, parent_document_id) ` +
                `WHERE type = 'credit_note'::order_document_type_enum AND parent_document_id IS NOT NULL`,
        );
        this.schema.raw(
            `ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_credit_note_parent_check" ` +
                `CHECK (type <> 'credit_note'::order_document_type_enum OR parent_document_id IS NOT NULL)`,
        );
    }

    async down() {
        this.schema.raw(`ALTER TABLE "order_documents" DROP CONSTRAINT IF EXISTS "order_documents_credit_note_parent_check"`);
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_one_credit_note_per_parent"`);
        this.schema.raw(`DROP INDEX IF EXISTS "order_documents_one_invoice_per_parent"`);
    }
}
