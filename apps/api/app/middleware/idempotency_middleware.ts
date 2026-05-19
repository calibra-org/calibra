import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import Order from "#models/order";

/**
 * Lifts the `Idempotency-Key` header off the request and replays a previously-stored response when
 * the same key arrives twice on `POST /checkout/submit`.
 *
 * Strategy:
 *   1. No header → just proceed (the controller still runs normally).
 *   2. Header present but no existing order — stash the key on `ctx` and proceed; the finalizer
 *      writes it to `orders.idempotency_key`. The UNIQUE constraint on that column is the actual
 *      anti-replay guarantee — concurrent requests with the same key serialize at the database
 *      insertion layer.
 *   3. Header present AND an existing order matches — short-circuit with the order's current
 *      state, so the second request observes whatever progress the first one's downstream payment
 *      flow has made (per `docs/phases/05-orders.md` checkout_idempotency.spec.ts case (c)).
 */
export default class IdempotencyMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        const raw = ctx.request.header("idempotency-key") ?? ctx.request.header("Idempotency-Key");
        const key = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
        if (!key) {
            return next();
        }

        const existing = await Order.query().where("idempotency_key", key).first();
        if (existing) {
            const { default: OrderTransformer } = await import("#transformers/order_transformer");
            await this.preloadForResponse(existing);
            ctx.response.header("Idempotency-Replay", "true");
            return ctx.response.ok({
                data: new OrderTransformer(existing).forDetail(),
                payment: {
                    gateway_id: existing.paymentGatewayIdSnapshot === null ? null : Number(existing.paymentGatewayIdSnapshot),
                    method_code: existing.paymentMethodCodeSnapshot ?? null,
                    redirect_url: null,
                },
            });
        }

        ctx.idempotencyKey = key;
        return next();
    }

    private async preloadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");
    }
}

declare module "@adonisjs/core/http" {
    interface HttpContext {
        idempotencyKey?: string | null;
    }
}
