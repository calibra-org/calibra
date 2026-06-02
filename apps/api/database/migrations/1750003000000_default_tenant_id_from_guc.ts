import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Adds a column DEFAULT to every `tenant_id` column that pulls the value from the
 * `app.current_tenant` GUC. Inserts that omit `tenant_id` while the GUC is set (the per-request
 * transaction, or any connection that issued `set_config('app.current_tenant', …)`) auto-fill it —
 * so raw `db.table().insert(...)` callers and the ORM both satisfy the column without threading
 * `tenant_id` by hand. When the GUC is unset the default resolves to NULL, preserving the
 * fail-closed `NOT NULL` guard (a context-less insert still errors rather than landing tenant-less).
 *
 * Discovered dynamically (every `public` table with a `tenant_id` column) so the default tracks the
 * RLS sweep without a duplicated table list. The model-level stamp hook still sets `tenant_id`
 * explicitly from the AsyncLocalStorage context for model inserts; this default is the safety net
 * for query-builder inserts that ride a GUC-bearing connection.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.raw(`
            DO $$
            DECLARE t text;
            BEGIN
                FOR t IN
                    SELECT table_name FROM information_schema.columns
                    WHERE table_schema = 'public' AND column_name = 'tenant_id'
                LOOP
                    EXECUTE format(
                        'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT nullif(current_setting(%L, true), %L)::bigint',
                        t, 'app.current_tenant', ''
                    );
                END LOOP;
            END $$;
        `);
    }

    async down() {
        this.schema.raw(`
            DO $$
            DECLARE t text;
            BEGIN
                FOR t IN
                    SELECT table_name FROM information_schema.columns
                    WHERE table_schema = 'public' AND column_name = 'tenant_id'
                LOOP
                    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id DROP DEFAULT', t);
                END LOOP;
            END $$;
        `);
    }
}
