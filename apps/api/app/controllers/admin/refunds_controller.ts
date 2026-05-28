import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import Order from "#models/order";
import OrderRefund from "#models/order_refund";
import { refundService } from "#services/refund_service";
import { adminRefundsView } from "#table_views/admin/refunds";
import OrderRefundTransformer from "#transformers/order_refund_transformer";
import { adminRefundCreateValidator, adminRefundListValidator } from "#validators/admin/refund_validator";

/**
 * Admin refund surface. `POST` runs the full {@link refundService} transaction (FOR UPDATE lock →
 * validate → allocate → restock → audit note → optional state transition). `DELETE` returns 405
 * unconditionally — refunds are immutable audit records; voiding is a future `credit_note`
 * document.
 */
export default class AdminRefundsController {
    async index(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const parsed = await ctx.request.validateUsing(adminRefundListValidator);

        const builder = OrderRefund.query().where("order_id", Number(order.id)).preload("lineItems");
        const { data, meta } = await adminRefundsView.run<OrderRefund>(builder, parsed);

        return {
            data: data.map((refund) => new OrderRefundTransformer(refund).toObject()),
            meta,
        };
    }

    async show(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const refund = await OrderRefund.query()
            .where("id", Number(ctx.params.id))
            .where("order_id", Number(order.id))
            .preload("lineItems")
            .first();
        if (!refund) {
            throw new Exception("Refund not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return { data: new OrderRefundTransformer(refund).toObject() };
    }

    async store(ctx: HttpContext) {
        const order = await this.findOrderOrFail(ctx.params.order_id);
        const payload = await ctx.request.validateUsing(adminRefundCreateValidator);
        const idempotencyKey =
            ctx.idempotencyKey ?? ctx.request.header("idempotency-key") ?? ctx.request.header("Idempotency-Key") ?? null;

        const refund = await refundService.create(
            order.id,
            {
                amountMinor: payload.amount_minor ?? null,
                lineItems: payload.line_items?.map((l) => ({
                    orderLineItemId: l.order_line_item_id,
                    quantity: l.quantity,
                    refundAmountMinor: l.refund_amount_minor ?? null,
                    refundTaxMinor: l.refund_tax_minor ?? null,
                })),
                reason: payload.reason ?? null,
                restockRequested: payload.restock_requested ?? false,
            },
            {
                actor: ctx.auth.user ?? null,
                idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey.trim() || null : null,
            },
        );

        await refund.load("lineItems");
        ctx.response.status(201);
        return { data: new OrderRefundTransformer(refund).toObject() };
    }

    async destroy(ctx: HttpContext) {
        ctx.response.status(405);
        return {
            errors: [
                {
                    code: "E_METHOD_NOT_ALLOWED",
                    message: ctx.i18n.t("errors.refunds.deletion_forbidden", {}, "Refunds cannot be deleted."),
                },
            ],
        };
    }

    private async findOrderOrFail(rawId: unknown): Promise<Order> {
        const numericId = Number(rawId);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const order = await Order.query().where("id", numericId).whereNull("deleted_at").first();
        if (!order) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return order;
    }
}
