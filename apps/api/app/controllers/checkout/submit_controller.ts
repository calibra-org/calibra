import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { OrderStatus } from "#enums/order_status";
import type Cart from "#models/cart";
import Order from "#models/order";
import { orderFinalizer } from "#services/order_finalizer";
import OrderTransformer from "#transformers/order_transformer";

/**
 * Storefront checkout finalize handler. The {@link IdempotencyMiddleware} runs first and either
 * short-circuits with a previously-stored response or stashes the key on `ctx`. This controller
 * then runs the full draft → pending flow via {@link OrderFinalizer}.
 */
export default class CheckoutSubmitController {
    async submit(ctx: HttpContext) {
        const cart = ctx.cart;
        const draft = await this.findDraft(cart);

        const result = await orderFinalizer.finalize(cart, draft, {
            idempotencyKey: ctx.idempotencyKey ?? null,
            actor: ctx.auth?.user ?? null,
            locale: ctx.i18n.locale,
            ipAddress: ctx.request.ip(),
            userAgent: ctx.request.header("user-agent") ?? null,
        });

        await this.loadForResponse(result.order);
        return {
            data: new OrderTransformer(result.order).forDetail(),
            payment: {
                gateway_id: result.payment.gateway.id,
                method_code: result.payment.gateway.code,
                redirect_url: result.payment.redirectUrl,
            },
        };
    }

    private async findDraft(cart: Cart): Promise<Order> {
        if (cart.customerId !== null) {
            const own = await Order.query()
                .where("customer_id", Number(cart.customerId))
                .where("status", OrderStatus.Draft)
                .orderBy("id", "desc")
                .first();
            if (own) return own;
        }
        const byCart = await Order.query()
            .where("cart_hash", String(cart.id))
            .where("status", OrderStatus.Draft)
            .orderBy("id", "desc")
            .first();
        if (!byCart) {
            throw new Exception("No draft order to submit. Call GET /api/v1/checkout first.", {
                status: 422,
                code: "E_DRAFT_MISSING",
            });
        }
        return byCart;
    }

    private async loadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("taxLines");
        await order.load("statusHistory");
    }
}
