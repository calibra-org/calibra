import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import PaymentAttempt from "#models/payment_attempt";
import PaymentAttemptTransformer from "#transformers/payment_attempt_transformer";
import { adminPaymentAttemptListValidator } from "#validators/admin/payment_gateway_validator";

const DEFAULT_PER_PAGE = 20;

/**
 * Read-only admin view onto `payment_attempts`. Useful for incident response — "what did
 * ZarinPal tell us about order #1234" — without spelunking the production DB. `gateway_payload`
 * is included only on the single-row show endpoint.
 */
export default class AdminPaymentAttemptsController {
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminPaymentAttemptListValidator);
        const page = payload.page ?? 1;
        const perPage = payload.perPage ?? DEFAULT_PER_PAGE;

        const query = PaymentAttempt.query().orderBy("id", "desc");
        if (payload.gateway_code) query.where("gateway_code_snapshot", payload.gateway_code);
        if (payload.status) query.where("status", payload.status);
        if (payload.order_id !== undefined) query.where("order_id", payload.order_id);

        const paginator = await query.paginate(page, perPage);
        const meta = paginator.getMeta();

        return {
            data: paginator.all().map((row) => new PaymentAttemptTransformer(row).forList()),
            meta: {
                page: meta.currentPage,
                perPage: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
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
