import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Per-gateway HMAC posture. Some Iranian PSPs (ZarinPal, IDPay) do not sign their callbacks,
 * so the storefront cannot verify the redirect-hop integrity at the transport layer. The
 * `webhook_gateway_signature_middleware` reads `signed_callback` per gateway and applies HMAC
 * verification only when `true`. Unsigned gateways still get defence-in-depth via the
 * idempotency ledger (`processed_webhook_events`), the amount guard inside `verifyCallback`,
 * the `@adonisjs/lock` keyed by `order:<id>`, and the opaque PSP-issued `gateway_authority`.
 *
 * `webhook_secret_env_key` is the name of the env var that holds the HMAC secret — kept on
 * the row (not hard-coded) so production secret rotations only touch env + redeploy, and
 * staging/dev can use a per-gateway test secret without code changes.
 */
export default class extends BaseSchema {
    protected tableName = "payment_gateways";

    async up() {
        this.schema.alterTable(this.tableName, (table) => {
            table.boolean("signed_callback").notNullable().defaultTo(false);
            table.string("webhook_secret_env_key", 128).nullable();
            table.string("webhook_signature_header", 128).nullable();
        });
    }

    async down() {
        this.schema.alterTable(this.tableName, (table) => {
            table.dropColumn("signed_callback");
            table.dropColumn("webhook_secret_env_key");
            table.dropColumn("webhook_signature_header");
        });
    }
}
