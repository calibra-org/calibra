import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import PaymentAttempt from "#models/payment_attempt";
import { adminPaymentAttemptsView } from "#table_views/admin/payment_attempts";
import PaymentAttemptTransformer from "#transformers/payment_attempt_transformer";
import { adminPaymentAttemptListValidator } from "#validators/admin/payment_gateway_validator";

/**
 * Read-only admin view onto `payment_attempts`. Useful for incident response — "what did
 * ZarinPal tell us about order #1234" — without spelunking the production DB. `gateway_payload`
 * is included only on the single-row show endpoint.
 */
export default class AdminPaymentAttemptsController {
    async index(ctx: HttpContext) {
        const parsed = await ctx.request.validateUsing(adminPaymentAttemptListValidator);
        const { data, meta } = await adminPaymentAttemptsView.run<PaymentAttempt>(PaymentAttempt.query(), parsed);
        return {
            data: data.map((row) => new PaymentAttemptTransformer(row).forList()),
            meta,
        };
    }

    async show(ctx: HttpContext) {
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id)) {
            throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const attempt = await PaymentAttempt.find(id);
        if (!attempt) {
            throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return { data: new PaymentAttemptTransformer(attempt).forDetail() };
    }
}
