import type { AdminSchemas } from "@calibra/sdk";

import type {
    AdminOrder,
    AdminOrderAddress,
    AdminOrderCouponLine,
    AdminOrderLineItem,
    AdminOrderNote,
    AdminOrderShippingLine,
    AdminOrderStatusHistoryEntry,
    AdminOrderTaxLine,
    LocalizedString,
    MoneyMinor,
    OrderStatus,
} from "#/lib/types";

/**
 * Order-shaped adapters from the SDK / raw API responses into the admin view types. Used by
 * `lib/server-repos.ts` (server-rendered pages) AND `lib/queries/orders.ts` (client hooks via the
 * same-origin proxy). Pure functions — no `server-only` import — so they're safe in both contexts.
 */

type Schemas = AdminSchemas["schemas"];
type SdkOrderAddress = Schemas["OrderAddress"];
type SdkAdminOrderDetail = Schemas["AdminOrderDetail"];

/** The `/admin/orders` index endpoint returns this trimmed shape, not the full OrderDetail. */
export interface SdkAdminOrderListRow {
    id?: number;
    order_number?: number;
    status?: string;
    customer_id?: number | null;
    billing_email?: string | null;
    grand_total?: number;
    currency?: string;
    created_at?: string;
}

const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
    draft: "draft",
    pending: "pending",
    on_hold: "on_hold",
    processing: "processing",
    completed: "completed",
    cancelled: "cancelled",
    refunded: "refunded",
    failed: "failed",
};

export function normaliseStatus(raw: string | null | undefined): OrderStatus {
    return ORDER_STATUS_MAP[String(raw ?? "pending")] ?? "pending";
}

/** Fans the locale-resolved API string out to both `fa` and `en` keys (the existing access pattern). */
function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

export function toAdminOrderAddress(a: SdkOrderAddress | null | undefined): AdminOrderAddress {
    if (!a) {
        return {
            firstName: "",
            lastName: "",
            company: null,
            addressLine1: "",
            addressLine2: null,
            city: "",
            provinceCode: "",
            postcode: "",
            country: "",
            phone: "",
            nationalId: null,
        };
    }
    return {
        firstName: a.first_name ?? "",
        lastName: a.last_name ?? "",
        company: a.company ?? null,
        addressLine1: a.address_line_1 ?? "",
        addressLine2: a.address_line_2 ?? null,
        city: a.city ?? "",
        provinceCode: a.region_id !== null && a.region_id !== undefined ? String(a.region_id) : "",
        postcode: a.postcode ?? "",
        country: a.country ?? "",
        phone: a.phone ?? "",
        nationalId: null,
    };
}

export function toAdminOrderListRow(o: SdkAdminOrderListRow): AdminOrder {
    return {
        id: o.id ?? 0,
        orderNumber: Number(o.order_number ?? o.id ?? 0),
        orderKey: "",
        status: normaliseStatus(o.status),
        customerId: o.customer_id !== null && o.customer_id !== undefined ? Number(o.customer_id) : null,
        customerName: o.billing_email ?? "",
        billingEmail: o.billing_email ?? "",
        currency: "IRR",
        currencyDisplay: "IRR",
        grandTotal: Number(o.grand_total ?? 0) as MoneyMinor,
        itemsTotal: 0 as MoneyMinor,
        shippingTotal: 0 as MoneyMinor,
        discountTotal: 0 as MoneyMinor,
        taxTotal: 0 as MoneyMinor,
        paymentMethodTitle: dup(""),
        createdAt: o.created_at ?? new Date().toISOString(),
        paidAt: null,
        completedAt: null,
        billingAddress: toAdminOrderAddress(undefined),
        shippingAddress: toAdminOrderAddress(undefined),
        lineItems: [],
        shippingLines: [],
        couponLines: [],
        taxLines: [],
        history: [],
        notes: [],
    };
}

export function toAdminOrderDetail(o: SdkAdminOrderDetail): AdminOrder {
    const totals = o.totals ?? {
        items_total: 0,
        items_tax_total: 0,
        shipping_total: 0,
        shipping_tax_total: 0,
        fees_total: 0,
        fees_tax_total: 0,
        discount_total: 0,
        discount_tax_total: 0,
        tax_total: 0,
        grand_total: 0,
    };
    const lineItems: AdminOrderLineItem[] = (o.line_items ?? []).map((li) => ({
        id: li.id,
        productId: li.product_id ?? 0,
        name: dup(li.name),
        sku: li.sku ?? "",
        quantity: li.quantity,
        unitPrice: Number(li.price) as MoneyMinor,
        subtotal: Number(li.subtotal) as MoneyMinor,
        taxTotal: Number(li.subtotal_tax ?? 0) as MoneyMinor,
        total: Number(li.total) as MoneyMinor,
        imageUrl: null,
    }));
    const shippingLines: AdminOrderShippingLine[] = (o.shipping_lines ?? []).map((s) => ({
        id: s.id,
        methodTitle: dup(s.title),
        total: Number(s.total) as MoneyMinor,
    }));
    const taxLines: AdminOrderTaxLine[] = (o.tax_lines ?? []).map((t) => ({
        id: t.id,
        label: dup(t.label),
        rate: Number(t.rate_percent ?? 0),
        total: Number(t.tax_total) as MoneyMinor,
    }));
    const history: AdminOrderStatusHistoryEntry[] = (o.status_history ?? []).map((h) => ({
        id: h.id,
        fromStatus: h.from_status ? normaliseStatus(h.from_status) : null,
        toStatus: normaliseStatus(h.to_status),
        occurredAt: h.occurred_at ?? new Date().toISOString(),
        changedBy: h.changed_by_user_id !== null && h.changed_by_user_id !== undefined ? String(h.changed_by_user_id) : null,
        reason: h.reason ?? null,
    }));
    const payment = o.payment ?? { gateway_id: null, method_code: null, method_title: null, transaction_id: null };
    return {
        id: o.id,
        orderNumber: Number(o.order_number ?? o.id),
        orderKey: o.order_key ?? "",
        status: normaliseStatus(o.status),
        customerId: o.customer_id !== null && o.customer_id !== undefined ? Number(o.customer_id) : null,
        customerName:
            `${o.billing_address?.first_name ?? ""} ${o.billing_address?.last_name ?? ""}`.trim() || (o.billing_email ?? ""),
        billingEmail: o.billing_email ?? "",
        currency: "IRR",
        currencyDisplay: "IRR",
        grandTotal: Number(totals.grand_total) as MoneyMinor,
        itemsTotal: Number(totals.items_total) as MoneyMinor,
        shippingTotal: Number(totals.shipping_total) as MoneyMinor,
        discountTotal: Number(totals.discount_total) as MoneyMinor,
        taxTotal: Number(totals.tax_total) as MoneyMinor,
        paymentMethodTitle: dup(payment.method_title ?? ""),
        createdAt: o.created_at ?? new Date().toISOString(),
        paidAt: null,
        completedAt: null,
        billingAddress: toAdminOrderAddress(o.billing_address),
        shippingAddress: toAdminOrderAddress(o.shipping_address ?? o.billing_address),
        lineItems,
        shippingLines,
        couponLines: [] as AdminOrderCouponLine[],
        taxLines,
        history,
        notes: [] as AdminOrderNote[],
    };
}
