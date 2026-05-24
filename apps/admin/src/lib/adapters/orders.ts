import type { AdminSchemas } from "@calibra/sdk";

import type {
    AdminOrder,
    AdminOrderAddress,
    AdminOrderCouponLine,
    AdminOrderFeeLine,
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
    customer_name?: string | null;
    billing_email?: string | null;
    grand_total?: number;
    items_total?: number;
    shipping_total?: number;
    tax_total?: number;
    discount_total?: number;
    currency?: string;
    currency_display?: string;
    created_at?: string;
    updated_at?: string | null;
    created_via?: string | null;
    date_paid_at?: string | null;
    date_completed_at?: string | null;
    payment_method_title?: string | null;
    item_count?: number;
    coupon_codes?: string[];
    risk_flags?: string[];
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
    const customerName = (o.customer_name && o.customer_name.trim().length > 0 ? o.customer_name : o.billing_email) ?? "";
    return {
        id: o.id ?? 0,
        orderNumber: Number(o.order_number ?? o.id ?? 0),
        orderKey: "",
        status: normaliseStatus(o.status),
        customerId: o.customer_id !== null && o.customer_id !== undefined ? Number(o.customer_id) : null,
        customerName,
        billingEmail: o.billing_email ?? "",
        currency: "IRR",
        currencyDisplay: (o.currency_display as AdminOrder["currencyDisplay"]) ?? "IRT",
        grandTotal: Number(o.grand_total ?? 0) as MoneyMinor,
        itemsTotal: Number(o.items_total ?? 0) as MoneyMinor,
        shippingTotal: Number(o.shipping_total ?? 0) as MoneyMinor,
        discountTotal: Number(o.discount_total ?? 0) as MoneyMinor,
        taxTotal: Number(o.tax_total ?? 0) as MoneyMinor,
        paymentMethodTitle: dup(o.payment_method_title ?? ""),
        createdAt: o.created_at ?? new Date().toISOString(),
        updatedAt: o.updated_at ?? null,
        paidAt: o.date_paid_at ?? null,
        completedAt: o.date_completed_at ?? null,
        createdVia: (o.created_via ?? "checkout") as AdminOrder["createdVia"],
        itemCount: Number(o.item_count ?? 0),
        couponCodes: o.coupon_codes ?? [],
        riskFlags: (o.risk_flags ?? []) as AdminOrder["riskFlags"],
        billingAddress: toAdminOrderAddress(undefined),
        shippingAddress: toAdminOrderAddress(undefined),
        lineItems: [],
        shippingLines: [],
        feeLines: [],
        couponLines: [],
        taxLines: [],
        history: [],
        notes: [],
        shippingInfo: null,
        source: null,
        ipAddress: null,
        userAgent: null,
        referrer: null,
        isLocked: false,
        unlockOverride: false,
        meta: {},
        metaVisible: {},
        metaHidden: {},
        feesTotal: 0 as MoneyMinor,
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
    const couponSource = (o as { coupon_lines?: { id: number; code: string; discount: number }[] }).coupon_lines ?? [];
    const feeSource =
        (
            o as {
                fee_lines?: {
                    id: number;
                    name: string;
                    total: number;
                    total_tax: number;
                    taxable?: boolean;
                    tax_class_id?: number | null;
                }[];
            }
        ).fee_lines ?? [];
    const shippingSource = (
        o as {
            shipping_info?: {
                tracking_number: string | null;
                tracking_url: string | null;
                carrier: string | null;
                shipped_at: string | null;
            } | null;
        }
    ).shipping_info;
    const couponLines: AdminOrderCouponLine[] = couponSource.map((row) => ({
        id: row.id,
        code: row.code,
        discount: Number(row.discount) as MoneyMinor,
    }));
    const feeLines: AdminOrderFeeLine[] = feeSource.map((row) => ({
        id: row.id,
        name: row.name,
        total: Number(row.total) as MoneyMinor,
        totalTax: Number(row.total_tax) as MoneyMinor,
        taxable: row.taxable === true,
        taxClassId: row.tax_class_id === null || row.tax_class_id === undefined ? null : Number(row.tax_class_id),
    }));
    const extra = o as {
        source?: string | null;
        is_locked?: boolean;
        unlock_override?: boolean;
        ip_address?: string | null;
        user_agent?: string | null;
        referrer?: string | null;
        meta?: Record<string, string>;
        meta_visible?: Record<string, string>;
        meta_hidden?: Record<string, string>;
    };
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
        updatedAt: o.updated_at ?? null,
        paidAt: (o as { date_paid_at?: string | null }).date_paid_at ?? null,
        completedAt: (o as { date_completed_at?: string | null }).date_completed_at ?? null,
        createdVia: ((o as { created_via?: string }).created_via ?? "checkout") as AdminOrder["createdVia"],
        itemCount: lineItems.reduce((sum, line) => sum + line.quantity, 0),
        couponCodes: couponLines.map((line) => line.code).filter((code) => code.length > 0),
        riskFlags: ((o as { risk_flags?: string[] }).risk_flags ?? []) as AdminOrder["riskFlags"],
        billingAddress: toAdminOrderAddress(o.billing_address),
        shippingAddress: toAdminOrderAddress(o.shipping_address ?? o.billing_address),
        lineItems,
        shippingLines,
        feeLines,
        couponLines,
        taxLines,
        history,
        notes: [] as AdminOrderNote[],
        shippingInfo: shippingSource
            ? {
                  trackingNumber: shippingSource.tracking_number ?? null,
                  trackingUrl: shippingSource.tracking_url ?? null,
                  carrier: shippingSource.carrier ?? null,
                  shippedAt: shippingSource.shipped_at ?? null,
              }
            : null,
        source: (extra.source ?? null) as AdminOrder["source"],
        ipAddress: extra.ip_address ?? null,
        userAgent: extra.user_agent ?? null,
        referrer: extra.referrer ?? null,
        isLocked: extra.is_locked === true,
        unlockOverride: extra.unlock_override === true,
        meta: extra.meta ?? {},
        metaVisible: extra.meta_visible ?? {},
        metaHidden: extra.meta_hidden ?? {},
        feesTotal: Number(totals.fees_total ?? 0) as MoneyMinor,
    };
}
