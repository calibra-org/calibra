import { createHmac, timingSafeEqual } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import PaymentGateway from "#models/payment_gateway";
import env from "#start/env";

/**
 * Gateway-aware HMAC signature verification for inbound PSP callbacks.
 *
 * Mount on routes that receive a `:gateway_code` route param (e.g. `/api/v1/payment/callback/:gateway_code`).
 * The middleware reads the gateway row, checks `signed_callback`, and applies HMAC verification
 * only when the gateway opted in. Most Iranian PSPs (ZarinPal, IDPay, …) do not sign their
 * callbacks today; for those the middleware no-ops and defence-in-depth comes from the
 * `processed_webhook_events` idempotency ledger, the amount guard inside `verifyCallback`,
 * the `@adonisjs/lock` keyed by `order:<id>`, and the opaque PSP-issued `gateway_authority`.
 *
 * Posture rule: a gateway with `signed_callback = true` MUST also have
 * `webhook_secret_env_key` + `webhook_signature_header` populated; the middleware refuses with
 * 401 + `E_SIGNATURE_CONFIG_MISSING` otherwise so a misconfiguration surfaces immediately
 * instead of silently downgrading to unsigned mode.
 */
export default class WebhookSignatureMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const code = ctx.params.gateway_code as string | undefined;
        if (!code) {
            ctx.logger.warn("webhook_signature_no_gateway_param");
            return next();
        }

        const gateway = await PaymentGateway.findBy("code", code);
        if (!gateway) {
            return next();
        }

        if (!gateway.signedCallback) {
            return next();
        }

        const header = gateway.webhookSignatureHeader;
        const envKey = gateway.webhookSecretEnvKey;
        if (!header || !envKey) {
            ctx.logger.error({ gateway: code }, "webhook_signature_config_missing");
            return ctx.response.status(401).json({
                errors: [{ message: "signature configuration missing for gateway", code: "E_SIGNATURE_CONFIG_MISSING" }],
            });
        }

        const signature = ctx.request.header(header);
        const secret = env.get(envKey as never) as string | undefined;

        if (signature === undefined || secret === undefined) {
            ctx.logger.warn(
                { gateway: code, header, hasSecret: secret !== undefined },
                "webhook_signature_missing",
            );
            return ctx.response.status(401).json({
                errors: [{ message: "missing signature", code: "E_UNSIGNED" }],
            });
        }

        const expected = createHmac("sha256", secret)
            .update(ctx.request.raw() ?? "")
            .digest("hex");
        if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
            ctx.logger.warn({ gateway: code, header }, "webhook_signature_mismatch");
            return ctx.response.status(401).json({
                errors: [{ message: "bad signature", code: "E_BAD_SIGNATURE" }],
            });
        }
        return next();
    }
}
