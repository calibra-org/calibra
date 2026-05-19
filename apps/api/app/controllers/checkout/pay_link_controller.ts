import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import PaymentGateway from "#models/payment_gateway";
import { orderStateMachine } from "#services/order_state_machine";
import { paymentService } from "#services/payment_service";
import OrderTransformer from "#transformers/order_transformer";
import { payLinkValidator } from "#validators/checkout/draft_validator";

/**
 * Guest pay-link retry. Locates the order by `order_key` (opaque token written at finalize). The
 * only orders eligible for the retry flow are `failed` (gateway declined) and `on_hold` (async
 * pending) — completed orders return 409 and unknown keys return 404.
 *
 * Phase 08 will wire the actual gateway-redirect step here; this phase only handles the
 * state-machine bookkeeping and re-reservation when an earlier `failed` released stock.
 */
export default class PayLinkController {
    async pay(ctx: HttpContext) {
        const orderKey = String(ctx.params.order_key ?? "").trim();
        if (!orderKey) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query().where("order_key", orderKey).first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }

        if (order.status === OrderStatus.Completed || order.status === OrderStatus.Refunded) {
            throw new Exception("Order is no longer payable", { status: 409, code: "E_ORDER_NOT_PAYABLE" });
        }

        const payload = await ctx.request.validateUsing(payLinkValidator);
        const gateway = await PaymentGateway.find(payload.payment_gateway_id);
        if (!gateway || !gateway.enabled) {
            throw new Exception("Payment method is unavailable", {
                status: 422,
                code: "E_PAYMENT_GATEWAY_INVALID",
            });
        }

        order.paymentGatewayIdSnapshot = gateway.id;
        order.paymentMethodCodeSnapshot = gateway.code;
        order.paymentMethodTitleSnapshot = gateway.code;
        await order.save();

        /**
         * Failed orders need stock re-reserved; `on_hold` ones already hold it. Both reach the
         * same "ready to attempt payment" state by transitioning to `pending` (the state machine
         * runs reserve_stock only for the failed → pending edge).
         */
        if (order.status === OrderStatus.Failed) {
            await orderStateMachine.transition(order, OrderStatus.Pending, {
                actor: null,
                reason: "pay_link.retry",
            });
        }

        const idempotencyKey = ctx.request.header("idempotency-key") ?? ctx.request.header("Idempotency-Key") ?? null;
        const initResult = await paymentService.init(order, gateway.id, idempotencyKey ?? null);
        await order.refresh();

        await this.loadForResponse(order);
        return {
            data: new OrderTransformer(order).forDetail(),
            payment: {
                gateway_id: Number(gateway.id),
                method_code: gateway.code,
                redirect_url: initResult.redirect_url,
            },
        };
    }

    private async loadForResponse(order: Order): Promise<void> {
        await order.load("lineItems");
        await order.load("billingAddress");
        await order.load("shippingAddress");
        await order.load("shippingLines");
        await order.load("statusHistory");
    }
}
