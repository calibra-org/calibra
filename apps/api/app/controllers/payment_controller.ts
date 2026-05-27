import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import Order from "#models/order";
import { paymentService } from "#services/payment_service";
import { paymentInitValidator } from "#validators/payments/init_validator";

/**
 * Storefront-facing payment endpoints. `init` is server-to-server (called by the storefront
 * after the user clicks "pay" on a pending order). `callback` is browser-to-server (the PSP
 * redirects the user here after auth) — it ends in a 302 to the configured success/failed URL,
 * never an API JSON response.
 */
export default class PaymentController {
    /**
     * Boot a payment for an existing order. Idempotent on `Idempotency-Key`: a replayed init
     * with the same key returns the same `redirect_url` without creating a duplicate attempt.
     */
    async init(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(paymentInitValidator);
        const order = await Order.query().where("order_key", payload.order_key).first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_ORDER_NOT_FOUND" });
        }
        if (!order.paymentGatewayIdSnapshot) {
            throw new Exception("Order has no payment method", { status: 422, code: "E_PAYMENT_REQUIRED" });
        }
        const idempotencyKey = ctx.request.header("idempotency-key") ?? ctx.request.header("Idempotency-Key") ?? null;
        const result = await paymentService.init(order, order.paymentGatewayIdSnapshot, idempotencyKey ?? null);
        return {
            data: {
                order_id: Number(order.id),
                order_key: order.orderKey,
                redirect_url: result.redirect_url,
            },
        };
    }

    /**
     * PSP callback — supports both GET (ZarinPal) and POST (other PSPs). Ends in a 302 to the
     * storefront success/failed URL with `?order_key=…` or `?reason=…` appended. Never throws
     * an HTML 500 to the user — every error path produces a clean redirect to the failed URL.
     */
    async callback(ctx: HttpContext) {
        const code = ctx.params.gateway_code;
        try {
            const result = await paymentService.verifyCallback(String(code), ctx.request);
            return ctx.response.redirect(result.redirect);
        } catch (error) {
            /**
             * Stub PSPs intentionally never make it to a real callback. If a stray redirect-hop
             * lands on one, redirect with the canonical `gateway_not_implemented` reason so the
             * storefront's failed-page can render the right user-facing copy instead of leaking
             * an internal error message.
             */
            const reason =
                error instanceof GatewayNotImplementedException
                    ? "gateway_not_implemented"
                    : ((error as Error)?.message ?? "callback_failed").slice(0, 200);
            const fallback = "http://localhost:3000/checkout/failed";
            const u = new URL(fallback);
            u.searchParams.set("reason", reason);
            return ctx.response.redirect(u.toString());
        }
    }
}
