import { BaseTransformer } from "@adonisjs/core/transformers";

import { DateTime } from "luxon";

import type Order from "#models/order";
import type OrderAddress from "#models/order_address";
import type OrderCouponLine from "#models/order_coupon_line";
import type OrderFeeLine from "#models/order_fee_line";
import type OrderLineItem from "#models/order_line_item";
import type OrderMeta from "#models/order_meta";
import type OrderShippingLine from "#models/order_shipping_line";
import type OrderStatusHistory from "#models/order_status_history";
import type OrderTaxLine from "#models/order_tax_line";

/**
 * Window after which a terminal order (refunded/cancelled/failed/completed) automatically locks
 * for accidental edits. Operators can still unlock via the explicit "Edit anyway" affordance.
 */
const AUTO_LOCK_DAYS = 30;
const AUTO_LOCK_TERMINAL_STATUSES = new Set(["refunded", "cancelled", "failed"]);

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
        const lineItems = (order as Order & { lineItems?: OrderLineItem[] }).lineItems ?? [];
        const couponLines = (order as Order & { couponLines?: OrderCouponLine[] }).couponLines ?? [];
        const billing = (order as Order & { billingAddress?: OrderAddress | null }).billingAddress ?? null;
        const customerName = billing ? `${billing.firstName ?? ""} ${billing.lastName ?? ""}`.trim() : "";
        const itemCount = lineItems.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
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
            customer_id: order.customerId === null ? null : Number(order.customerId),
            customer_name: customerName,
            billing_email: order.billingEmail,
            payment_method_title: order.paymentMethodTitleSnapshot ?? null,
            item_count: itemCount,
            coupon_codes: couponLines.map((row) => row.codeSnapshot ?? "").filter((code) => code.length > 0),
            risk_flags: this.computeRiskFlags(order),
        };
    }

    /**
     * Cheap heuristic risk badges surfaced in the admin row. Intentionally conservative — anything
     * needing per-customer history or cross-order aggregation should move to a `RiskService` once
     * the surface grows. Today: "high_value" for orders in the top spend band; "shipping_mismatch"
     * when billing + shipping countries diverge; "failed_payment" when the status itself is failed.
     */
    private computeRiskFlags(order: Order): string[] {
        const flags: string[] = [];
        if (order.status === "failed") flags.push("failed_payment");
        const billing = (order as Order & { billingAddress?: OrderAddress | null }).billingAddress ?? null;
        const shipping = (order as Order & { shippingAddress?: OrderAddress | null }).shippingAddress ?? null;
        if (
            billing !== null &&
            shipping !== null &&
            typeof billing.country === "string" &&
            typeof shipping.country === "string" &&
            billing.country.toUpperCase() !== shipping.country.toUpperCase()
        ) {
            flags.push("shipping_mismatch");
        }
        if (Number(order.grandTotal) >= 100_000_000) flags.push("high_value");
        return flags;
    }

    forDetail() {
        const order = this.resource;
        const billing = (order as Order & { billingAddress?: OrderAddress | null }).billingAddress ?? null;
        const shipping = (order as Order & { shippingAddress?: OrderAddress | null }).shippingAddress ?? null;
        const lineItems = (order as Order & { lineItems?: OrderLineItem[] }).lineItems ?? [];
        const shippingLines = (order as Order & { shippingLines?: OrderShippingLine[] }).shippingLines ?? [];
        const taxLines = (order as Order & { taxLines?: OrderTaxLine[] }).taxLines ?? [];
        const history = (order as Order & { statusHistory?: OrderStatusHistory[] }).statusHistory ?? [];
        const couponLines = (order as Order & { couponLines?: OrderCouponLine[] }).couponLines ?? [];
        const feeLines = (order as Order & { feeLines?: OrderFeeLine[] }).feeLines ?? [];
        const shippingAttr = ((order.attributes as Record<string, unknown>) ?? {}).shipping as
            | {
                  tracking_number?: string | null;
                  tracking_url?: string | null;
                  carrier?: string | null;
                  shipped_at?: string | null;
              }
            | undefined;

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
            fee_lines: feeLines.map((fee) => this.serializeFee(fee)),
            coupon_lines: couponLines.map((line) => ({
                id: Number(line.id),
                code: line.codeSnapshot ?? "",
                discount: Number(line.discount ?? 0),
            })),
            tax_lines: taxLines.map((line) => this.serializeTaxLine(line)),
            billing_address: billing ? this.serializeAddress(billing) : null,
            shipping_address: shipping ? this.serializeAddress(shipping) : null,
            status_history: history.map((row) => this.serializeHistory(row)),
            shipping_info: shippingAttr
                ? {
                      tracking_number: shippingAttr.tracking_number ?? null,
                      tracking_url: shippingAttr.tracking_url ?? null,
                      carrier: shippingAttr.carrier ?? null,
                      shipped_at: shippingAttr.shipped_at ?? null,
                  }
                : null,
        };
    }

    forAdmin() {
        const order = this.resource;
        const metaRows = (order as Order & { meta?: OrderMeta[] }).meta ?? [];
        const metaVisible: Record<string, string> = {};
        const metaHidden: Record<string, string> = {};
        const meta: Record<string, string> = {};
        for (const row of metaRows) {
            const key = row.key;
            const value = row.value ?? "";
            meta[key] = value;
            if (key.startsWith("_")) metaHidden[key] = value;
            else metaVisible[key] = value;
        }
        return {
            ...this.forDetail(),
            ip_address: order.ipAddress,
            user_agent: order.userAgent,
            cart_hash: null,
            source: this.resolveSource(order.createdVia),
            referrer: ((order.attributes as Record<string, unknown>) ?? {}).referrer ?? null,
            is_locked: this.computeLocked(order),
            unlock_override: Boolean(((order.attributes as Record<string, unknown>) ?? {}).unlock_override),
            meta,
            meta_visible: metaVisible,
            meta_hidden: metaHidden,
        };
    }

    /**
     * Maps the raw `created_via` column to the narrower enum the admin sidebar Source card
     * understands. Unknown values fall through to `null` so the UI can render its "unknown" state
     * rather than echo a junk value.
     */
    private resolveSource(createdVia: string | null | undefined): string | null {
        if (typeof createdVia !== "string" || createdVia.length === 0) return null;
        const KNOWN = ["web", "admin", "api", "import", "checkout-block", "checkout"];
        return KNOWN.includes(createdVia) ? createdVia : null;
    }

    /**
     * Compute the lock flag. An explicit admin override on `attributes.unlock_override` wins; the
     * automatic rule otherwise kicks in for terminal statuses past the {@link AUTO_LOCK_DAYS}
     * grace window. The frontend uses this flag to decide whether to render the warning banner +
     * the "Edit anyway" affordance.
     */
    private computeLocked(order: Order): boolean {
        const attrs = (order.attributes as Record<string, unknown>) ?? {};
        if (attrs.unlock_override === true) return false;
        if (!AUTO_LOCK_TERMINAL_STATUSES.has(order.status)) return false;
        const anchor = order.dateCompletedAt ?? order.updatedAt ?? null;
        if (!anchor) return false;
        const diffDays = DateTime.utc().diff(anchor, "days").days;
        return diffDays >= AUTO_LOCK_DAYS;
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

    private serializeFee(line: OrderFeeLine) {
        return {
            id: Number(line.id),
            name: line.nameSnapshot,
            total: Number(line.total),
            total_tax: Number(line.totalTax),
            taxable: Boolean(line.taxable),
            tax_class_id: line.taxClassIdSnapshot === null ? null : Number(line.taxClassIdSnapshot),
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
