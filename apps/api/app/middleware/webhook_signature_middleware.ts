import { createHmac, timingSafeEqual } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import env from "#start/env";

/**
 * Verify an HMAC signature on inbound PSP callbacks. The middleware reads the gateway's
 * signature header, recomputes the HMAC of the raw body using a shared secret, and
 * compares them in constant time. A mismatch (or missing header / secret) is a 401.
 *
 * Defaults to opt-in per gateway via the `signatureHeader` option — Zarinpal today
 * doesn't sign callbacks, so we keep the middleware off that route and lean on
 * idempotency + atomic locks (Phase 4 / Phase 16) for replay safety.
 *
 * Apply with `.use(webhookSignatureMiddleware(({ signatureHeader, secret }))` from the
 * route file. The secret is read from `env` so production rotations don't redeploy.
 */
export default class WebhookSignatureMiddleware {
    async handle(
        ctx: HttpContext,
        next: NextFn,
        options: { signatureHeader: string; secretEnvKey: string },
    ) {
        const signature = ctx.request.header(options.signatureHeader);
        const secret = env.get(options.secretEnvKey as never) as string | undefined;
        if (signature === undefined || secret === undefined) {
            ctx.logger.warn(
                { signatureHeader: options.signatureHeader, hasSecret: secret !== undefined },
                "webhook_signature_missing",
            );
            return ctx.response.status(401).json({ errors: [{ message: "missing signature", code: "E_UNSIGNED" }] });
        }
        const expected = createHmac("sha256", secret).update(ctx.request.raw() ?? "").digest("hex");
        if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
            ctx.logger.warn({ signatureHeader: options.signatureHeader }, "webhook_signature_mismatch");
            return ctx.response.status(401).json({ errors: [{ message: "bad signature", code: "E_BAD_SIGNATURE" }] });
        }
        return next();
    }
}
