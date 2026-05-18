import { BaseTransformer } from "@adonisjs/core/transformers";

import type Order from "#models/order";
import type OrderAddress from "#models/order_address";
import type OrderLineItem from "#models/order_line_item";
import type OrderShippingLine from "#models/order_shipping_line";
import type OrderStatusHistory from "#models/order_status_history";
import type OrderTaxLine from "#models/order_tax_line";

/**
 * Owns the `/api/v1/.../orders/*` response shape. Sensitive columns (`idempotency_key`,
 * `cart_hash`) are simply not picked, so they cannot leak even if a controller accidentally hands
 * over the full Lucid model. `forList` strips the line-level detail; `forDetail` (default) renders
 * the full envelope; `forAdmin` adds the audit + customer ip/ua.
 */
export default class OrderTransformer extends BaseTransformer<Order> {
    toObject() {
        return this.forDetail();
    }

    forList() {
        const order = this.resource;
        return {
            id: Number(order.id),
            order_number: Number(order.orderNumber),
            status: order.status,
            currency: order.currency,
            currency_display: order.currencyDisplay,
            grand_total: Number(order.grandTotal),
            items_total: Number(order.itemsTotal),
            shipping_total: Number(order.shippingTotal),
            tax_total: Number(order.taxTotal),
            discount_total: Number(order.discountTotal),
            created_via: order.createdVia,
            date_paid_at: order.datePaidAt?.toISO() ?? null,
            date_completed_at: order.dateCompletedAt?.toISO() ?? null,
            created_at: order.createdAt?.toISO() ?? null,
            updated_at: order.updatedAt?.toISO() ?? null,
        };
    }

    forDetail() {
        const order = this.resource;
        const billing = (order as Order & { billingAddress?: OrderAddress | null }).billingAddress ?? null;
        const shipping = (order as Order & { shippingAddress?: OrderAddress | null }).shippingAddress ?? null;
        const lineItems = (order as Order & { lineItems?: OrderLineItem[] }).lineItems ?? [];
        const shippingLines = (order as Order & { shippingLines?: OrderShippingLine[] }).shippingLines ?? [];
        const taxLines = (order as Order & { taxLines?: OrderTaxLine[] }).taxLines ?? [];
        const history = (order as Order & { statusHistory?: OrderStatusHistory[] }).statusHistory ?? [];

        return {
            ...this.forList(),
            order_key: order.orderKey,
            customer_id: order.customerId === null ? null : Number(order.customerId),
            billing_email: order.billingEmail,
            customer_note: order.customerNote,
            payment: {
                gateway_id: order.paymentGatewayIdSnapshot === null ? null : Number(order.paymentGatewayIdSnapshot),
                method_code: order.paymentMethodCodeSnapshot ?? null,
                method_title: order.paymentMethodTitleSnapshot ?? null,
                transaction_id: order.transactionId ?? null,
            },
            totals: {
                items_total: Number(order.itemsTotal),
                items_tax_total: Number(order.itemsTaxTotal),
                shipping_total: Number(order.shippingTotal),
                shipping_tax_total: Number(order.shippingTaxTotal),
                fees_total: Number(order.feesTotal),
                fees_tax_total: Number(order.feesTaxTotal),
                discount_total: Number(order.discountTotal),
                discount_tax_total: Number(order.discountTaxTotal),
                tax_total: Number(order.taxTotal),
                grand_total: Number(order.grandTotal),
            },
            prices_include_tax: order.pricesIncludeTax,
            line_items: lineItems.map((line) => this.serializeLine(line)),
            shipping_lines: shippingLines.map((line) => this.serializeShipping(line)),
            tax_lines: taxLines.map((line) => this.serializeTaxLine(line)),
            billing_address: billing ? this.serializeAddress(billing) : null,
            shipping_address: shipping ? this.serializeAddress(shipping) : null,
            status_history: history.map((row) => this.serializeHistory(row)),
        };
    }

    forAdmin() {
        const order = this.resource;
        return {
            ...this.forDetail(),
            ip_address: order.ipAddress,
            user_agent: order.userAgent,
            cart_hash: null,
        };
    }

    private serializeLine(line: OrderLineItem) {
        return {
            id: Number(line.id),
            product_id: line.productId === null ? null : Number(line.productId),
            variation_id: line.variationId === null ? null : Number(line.variationId),
            name: line.nameSnapshot,
            sku: line.skuSnapshot,
            quantity: line.quantity,
            price: Number(line.priceSnapshot),
            subtotal: Number(line.subtotal),
            subtotal_tax: Number(line.subtotalTax),
            total: Number(line.total),
            total_tax: Number(line.totalTax),
            tax_class_id: line.taxClassIdSnapshot === null ? null : Number(line.taxClassIdSnapshot),
            attributes_snapshot: (line.attributesSnapshot as Record<string, unknown>) ?? {},
        };
    }

    private serializeShipping(line: OrderShippingLine) {
        return {
            id: Number(line.id),
            method_code: line.methodCodeSnapshot,
            title: line.titleSnapshot,
            total: Number(line.total),
            total_tax: Number(line.totalTax),
        };
    }

    private serializeTaxLine(line: OrderTaxLine) {
        return {
            id: Number(line.id),
            rate_code: line.rateCodeSnapshot,
            label: line.labelSnapshot,
            rate_percent: Number(line.ratePercentSnapshot),
            compound: line.compoundSnapshot,
            tax_total: Number(line.taxTotal),
            shipping_tax_total: Number(line.shippingTaxTotal),
        };
    }

    private serializeAddress(address: OrderAddress) {
        return {
            kind: address.kind,
            first_name: address.firstName,
            last_name: address.lastName,
            company: address.company,
            address_line_1: address.addressLine1,
            address_line_2: address.addressLine2,
            city: address.city,
            region_id: address.regionId === null ? null : Number(address.regionId),
            region_text: address.regionText,
            postcode: address.postcode,
            country: address.country,
            phone: address.phone,
            email: address.email,
        };
    }

    private serializeHistory(row: OrderStatusHistory) {
        return {
            id: Number(row.id),
            from_status: row.fromStatus,
            to_status: row.toStatus,
            changed_by_user_id: row.changedByUserId === null ? null : Number(row.changedByUserId),
            reason: row.reason,
            occurred_at: row.occurredAt?.toISO() ?? null,
        };
    }
}
