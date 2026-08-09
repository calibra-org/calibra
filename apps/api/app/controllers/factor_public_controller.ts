import type { HttpContext } from "@adonisjs/core/http";

import { factorDocumentService } from "#services/factor/document_service";
import { factorPublicPaymentInitValidator } from "#validators/factor_public_validator";

export default class FactorPublicController {
    async show(ctx: HttpContext) {
        ctx.response.header("cache-control", "private, no-store, max-age=0");
        ctx.response.header("pragma", "no-cache");
        ctx.response.header("referrer-policy", "no-referrer");
        ctx.response.header("x-robots-tag", "noindex, nofollow, noarchive");
        ctx.response.header("x-content-type-options", "nosniff");
        return factorDocumentService.publicByCode(String(ctx.params.code));
    }

    async init(ctx: HttpContext) {
        ctx.response.header("cache-control", "no-store");
        ctx.response.header("referrer-policy", "no-referrer");
        const payload = await ctx.request.validateUsing(factorPublicPaymentInitValidator);
        const idempotencyKey = ctx.request.header("idempotency-key") ?? null;
        return factorDocumentService.initPublicPayment(String(ctx.params.code), payload.gateway_id, idempotencyKey);
    }
}
