import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Custom-domain verification + edge-TLS state machine. The original `tenant_domains` row recorded
 * intent only (`tls_status` + a single `verified_at`); routing trusted any row. Control Plane v2
 * gates custom domains behind two independent DNS checks before they route or issue a certificate:
 *
 *  - `ownership_token` — the per-domain TXT value the operator publishes at `_calibra-verify.<domain>`.
 *    Regenerated on every (re-)insert so a stale TXT record left on a previously-attached domain can
 *    never be reused to take it over.
 *  - `ownership_verified_at` / `routing_verified_at` — the two gates. A custom domain routes / mints
 *    TLS only when BOTH are set AND `tls_status IN ('verifying','active')` (the R5 predicate enforced
 *    identically in `resolveTenantByHost` and `/api/caddy/ask`).
 *  - `cert_last_error` — the writer for the `failed` state (CAA refusal, ACME/sim failure).
 *
 * The `tls_status` CHECK gains `verifying` (ownership proven, routing/cert pending). Backfill keeps
 * already-`active` rows routing by mirroring `verified_at` into both gates; subdomains
 * (`kind='subdomain'`, implicitly trusted) are forced to both-gates + `active` so the primary
 * subdomain keeps routing under the new uniform predicate.
 */
export default class extends BaseSchema {
    protected tableName = "tenant_domains";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.text("ownership_token").nullable();
            table.timestamp("ownership_verified_at", { useTz: true }).nullable();
            table.timestamp("routing_verified_at", { useTz: true }).nullable();
            table.text("cert_last_error").nullable();
        });

        this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT "tenant_domains_tls_status_check"`);
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenant_domains_tls_status_check" ` +
                `CHECK (tls_status IN ('pending', 'verifying', 'active', 'failed'))`,
        );

        /** Already-active customs: mirror the legacy single timestamp into both gates so they keep routing. */
        this.schema.raw(
            `UPDATE "${this.tableName}" ` +
                `SET "ownership_verified_at" = COALESCE("verified_at", now()), ` +
                `"routing_verified_at" = COALESCE("verified_at", now()) ` +
                `WHERE "tls_status" = 'active'`,
        );

        /** Subdomains are implicitly trusted — ensure both gates + active so the uniform predicate passes. */
        this.schema.raw(
            `UPDATE "${this.tableName}" ` +
                `SET "ownership_verified_at" = COALESCE("ownership_verified_at", now()), ` +
                `"routing_verified_at" = COALESCE("routing_verified_at", now()), ` +
                `"tls_status" = 'active' ` +
                `WHERE "kind" = 'subdomain'`,
        );
    }

    async down() {
        this.schema.raw(`ALTER TABLE "${this.tableName}" DROP CONSTRAINT "tenant_domains_tls_status_check"`);
        this.schema.raw(
            `ALTER TABLE "${this.tableName}" ADD CONSTRAINT "tenant_domains_tls_status_check" ` +
                `CHECK (tls_status IN ('pending', 'active', 'failed'))`,
        );

        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("ownership_token");
            table.dropColumn("ownership_verified_at");
            table.dropColumn("routing_verified_at");
            table.dropColumn("cert_last_error");
        });
    }
}
