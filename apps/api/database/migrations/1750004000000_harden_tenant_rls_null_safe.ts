import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Make every `tenant_isolation` RLS policy NULL-safe. The original policy
 * (`1750002000000_add_tenant_id_and_rls`) cast the GUC directly —
 * `current_setting('app.current_tenant', true)::bigint`. On a pooled connection with **no**
 * tenant context the GUC resolves to the empty string `''`, and `''::bigint` raises
 * `22P02 invalid input syntax for type bigint: ""` — so any query that accidentally runs off the
 * per-request transaction (a bare `db.*` call) crashed with a 500 instead of failing closed.
 *
 * Wrapping the cast in `NULLIF(…, '')` turns an unset/empty GUC into `NULL`, so the predicate
 * `tenant_id = NULL` is `NULL` (false) → the connection sees **zero rows**. That matches the
 * documented fail-closed contract and the NULL-safe column default already installed by
 * `1750003000000_default_tenant_id_from_guc`. Discovered dynamically from `pg_policy` so it covers
 * every RLS table — including `users` / `settings` — without a duplicated table list.
 */
const NULL_SAFE = "tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const LEGACY = "tenant_id = current_setting('app.current_tenant', true)::bigint";

function rebuildPolicies(predicate: string): string {
    /** Escape single quotes for embedding the predicate inside the EXECUTE format() string literal. */
    const escaped = predicate.replace(/'/g, "''");
    return `
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN
                SELECT c.relname AS tbl
                FROM pg_policy p
                JOIN pg_class c ON c.oid = p.polrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE p.polname = 'tenant_isolation' AND n.nspname = 'public'
            LOOP
                EXECUTE format('DROP POLICY tenant_isolation ON public.%I', r.tbl);
                EXECUTE format(
                    'CREATE POLICY tenant_isolation ON public.%I USING (${escaped}) WITH CHECK (${escaped})',
                    r.tbl
                );
            END LOOP;
        END $$;
    `;
}

export default class extends BaseSchema {
    async up() {
        this.schema.raw(rebuildPolicies(NULL_SAFE));
    }

    async down() {
        this.schema.raw(rebuildPolicies(LEGACY));
    }
}
