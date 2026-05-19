import { BaseTransformer } from "@adonisjs/core/transformers";

import type OrderRefund from "#models/order_refund";
import type OrderRefundLineItem from "#models/order_refund_line_item";

/**
 * Owns the `/api/v1/.../refunds/*` response shape — admin and customer paths share the same
 * fields, since the column set is non-sensitive. `gateway_refund_id` echoes the PSP-side
 * identifier when `paymentService.refund()` returns one; bank-transfer and other non-PSP refunds
 * leave it `null`.
 */
export default class OrderRefundTransformer extends BaseTransformer<OrderRefund> {
    toObject() {
        const refund = this.resource;
        const lineItems = (refund as OrderRefund & { lineItems?: OrderRefundLineItem[] }).lineItems ?? [];
        return {
            id: Number(refund.id),
            order_id: Number(refund.orderId),
            refund_number: Number(refund.refundNumber),
            amount_minor: Number(refund.amountMinor),
            tax_amount_minor: Number(refund.taxAmountMinor),
            reason: refund.reason,
            refunded_by_user_id: refund.refundedByUserId === null ? null : Number(refund.refundedByUserId),
            restock_requested: refund.restockRequested,
            gateway_refund_id: refund.gatewayRefundId,
            processed_at: refund.processedAt?.toISO() ?? null,
            line_items: lineItems.map((line) => this.serializeLine(line)),
            created_at: refund.createdAt?.toISO() ?? null,
        };
    }

    private serializeLine(line: OrderRefundLineItem) {
        return {
            id: Number(line.id),
            order_line_item_id: Number(line.orderLineItemId),
            quantity: line.quantity,
            refund_amount_minor: Number(line.refundAmountMinor),
            refund_tax_minor: Number(line.refundTaxMinor),
        };
    }
}
