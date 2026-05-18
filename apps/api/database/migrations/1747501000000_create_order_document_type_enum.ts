import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    /**
     * Pattern 5: empty enum at MVP. Future per-feature migrations add values via
     * `ALTER TYPE order_document_type_enum ADD VALUE 'proforma'` etc., so the proforma / invoice /
     * packing-slip features ship as purely additive changes. Creating the type now means the
     * `order_documents.type` column has a stable target even though no values exist yet.
     *
     * Postgres rejects truly-empty ENUM bodies, so we seed a single sentinel value
     * (`__placeholder__`) that is never used at runtime — every concrete value lands via a later
     * `ALTER TYPE … ADD VALUE` migration and the renderer registry filters the sentinel out.
     */
    async up() {
        this.schema.raw(`
            DO $$ BEGIN
                CREATE TYPE order_document_type_enum AS ENUM ('__placeholder__');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        `);
    }

    async down() {
        this.schema.raw(`DROP TYPE IF EXISTS order_document_type_enum`);
    }
}
