import "server-only";

import type { AdminSchemas } from "@calibra/sdk";

import { apiServer } from "./api";
import type {
    AdminAttribute,
    AdminAttributeTerm,
    AdminBrand,
    AdminCategory,
    AdminCoupon,
    AdminCustomer,
    AdminOrder,
    AdminOrderAddress,
    AdminOrderCouponLine,
    AdminOrderLineItem,
    AdminOrderNote,
    AdminOrderShippingLine,
    AdminOrderStatusHistoryEntry,
    AdminOrderTaxLine,
    AdminPaymentGateway,
    AdminProduct,
    AdminRefund,
    AdminReview,
    AdminSettingsGroup,
    AdminShippingMethod,
    AdminShippingZone,
    AdminShippingZoneMethod,
    AdminTag,
    AdminTaxClass,
    AdminTaxRate,
    LocalizedString,
    MoneyMinor,
    OrderStatus,
    Paginated,
    PaymentGatewayCode,
    ProductStatus,
    ReviewStatus,
    SalesReport,
    SettingsGroupKey,
    TopSellersReport,
} from "./types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminProduct = Schemas["AdminProduct"];
type SdkAdminProductDetail = Schemas["AdminProductDetail"];
type SdkAdminTaxonomy = Schemas["AdminTaxonomy"];
type SdkAdminAttribute = Schemas["AdminAttribute"];
type SdkAdminReview = Schemas["AdminReview"];
type SdkAdminCustomer = Schemas["AdminCustomer"];
type SdkAdminCoupon = Schemas["AdminCoupon"];
type SdkAdminPaymentGateway = Schemas["AdminPaymentGateway"];
type SdkOrderAddress = Schemas["OrderAddress"];
type SdkAdminOrderDetail = Schemas["AdminOrderDetail"];

/** The /admin/orders index endpoint returns this trimmed shape, not OrderDetail. */
interface SdkAdminOrderListRow {
    id?: number;
    order_number?: number;
    status?: string;
    customer_id?: number | null;
    billing_email?: string | null;
    grand_total?: number;
    currency?: string;
    created_at?: string;
}

interface ListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

/**
 * Fans the locale-resolved API string out to both `fa` and `en` keys so the existing
 * `row.name[locale]` access pattern keeps working. The same string fills both slots because the
 * API only ever returns the locale the request asked for via `Accept-Language`.
 */
function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

function emptyPage<T>(perPage = 20): Paginated<T> {
    return { data: [], meta: { page: 1, perPage, total: 0, lastPage: 1 } };
}

const VIEW_PRODUCT_STATUS_MAP: Record<string, ProductStatus> = {
    draft: "draft",
    published: "publish",
    archived: "draft",
};

const SDK_PRODUCT_STATUS_MAP: Record<ProductStatus, "draft" | "published" | "archived" | undefined> = {
    draft: "draft",
    publish: "published",
    pending: undefined,
    private: undefined,
};

/* -------------------------------------------------------------------------- */
/*  Catalog: products                                                          */
/* -------------------------------------------------------------------------- */

interface ProductListParams extends ListParams {
    status?: ProductStatus | "any";
    categoryId?: number;
}

function toAdminProduct(p: SdkAdminProduct): AdminProduct {
    const status = VIEW_PRODUCT_STATUS_MAP[p.status] ?? "draft";
    const type = (p.type === "virtual" || p.type === "downloadable" ? "simple" : p.type) as AdminProduct["type"];
    return {
        id: p.id,
        sku: p.sku ?? "",
        type,
        status,
        name: dup(p.name),
        slug: dup(p.slug),
        shortDescription: dup(p.short_description),
        regularPrice: Number(p.regular_price ?? 0) as MoneyMinor,
        salePrice: p.sale_price === null || p.sale_price === undefined ? null : (Number(p.sale_price) as MoneyMinor),
        stockQuantity: null,
        stockStatus: "instock",
        manageStock: false,
        featured: Boolean(p.featured),
        categoryIds: [],
        brandId: null,
        tagIds: [],
        imageUrl: p.featured_image_url ?? null,
        weightGrams: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function toAdminProductFromDetail(p: SdkAdminProductDetail): AdminProduct {
    const base = toAdminProduct(p as SdkAdminProduct);
    return {
        ...base,
        categoryIds: (p.categories ?? []).map((c) => c.id),
        brandId: p.brands?.[0]?.id ?? null,
        tagIds: (p.tags ?? []).map((t) => t.id),
        weightGrams: p.weight_grams ?? null,
        createdAt: p.created_at ?? base.createdAt,
        updatedAt: p.updated_at ?? base.updatedAt,
    };
}

export async function listProducts(params: ProductListParams = {}): Promise<Paginated<AdminProduct>> {
    const api = await apiServer();
    const sdkStatus = params.status && params.status !== "any" ? SDK_PRODUCT_STATUS_MAP[params.status] : undefined;
    const { data, error } = await api.admin.GET("/api/v1/admin/products", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(sdkStatus !== undefined ? { status: sdkStatus } : {}),
                ...(params.search ? { search: params.search } : {}),
                ...(params.categoryId !== undefined ? { category: params.categoryId } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminProduct>(params.perPage);
    const rows = (data.data ?? []).map(toAdminProduct);
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

export async function getProduct(id: number): Promise<AdminProduct | null> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/products/{id}", { params: { path: { id } } });
    if (error !== undefined || !data?.data) return null;
    return toAdminProductFromDetail(data.data);
}

/* -------------------------------------------------------------------------- */
/*  Catalog: taxonomy                                                          */
/* -------------------------------------------------------------------------- */

function toAdminCategory(c: SdkAdminTaxonomy): AdminCategory {
    return {
        id: c.id,
        parentId: c.parent_id ?? null,
        name: dup(c.name),
        slug: dup(c.slug),
        productCount: 0,
        imageUrl: c.image_url ?? null,
    };
}

export async function listCategories(params: ListParams = {}): Promise<Paginated<AdminCategory>> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/categories", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(params.search ? { search: params.search } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminCategory>(params.perPage);
    const rows = (data.data ?? []).map(toAdminCategory);
    /**
     * The /admin/categories index doesn't return product counts. Run one parallel
     * `/admin/products?category={id}&perPage=1` per row and read `meta.total` — fine for a
     * page-size list (≤ 20 categories typically), but skip the lookups if there are no rows.
     */
    await Promise.all(
        rows.map(async (row) => {
            const res = await api.admin.GET("/api/v1/admin/products", {
                params: { query: { category: row.id, perPage: 1 } },
            });
            row.productCount = res.data?.meta?.total ?? 0;
        }),
    );
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

function toAdminTag(t: SdkAdminTaxonomy): AdminTag {
    return { id: t.id, name: dup(t.name), slug: dup(t.slug), productCount: 0 };
}

export async function listTags(params: ListParams = {}): Promise<Paginated<AdminTag>> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/tags", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(params.search ? { search: params.search } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminTag>(params.perPage);
    const rows = (data.data ?? []).map(toAdminTag);
    await Promise.all(
        rows.map(async (row) => {
            const res = await api.admin.GET("/api/v1/admin/products", {
                params: { query: { tag: row.id, perPage: 1 } },
            });
            row.productCount = res.data?.meta?.total ?? 0;
        }),
    );
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

function toAdminBrand(b: SdkAdminTaxonomy): AdminBrand {
    return { id: b.id, name: dup(b.name), slug: dup(b.slug), productCount: 0, logoUrl: b.image_url ?? null };
}

export async function listBrands(params: ListParams = {}): Promise<Paginated<AdminBrand>> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/brands", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(params.search ? { search: params.search } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminBrand>(params.perPage);
    const rows = (data.data ?? []).map(toAdminBrand);
    await Promise.all(
        rows.map(async (row) => {
            const res = await api.admin.GET("/api/v1/admin/products", {
                params: { query: { brand: row.id, perPage: 1 } },
            });
            row.productCount = res.data?.meta?.total ?? 0;
        }),
    );
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

/* -------------------------------------------------------------------------- */
/*  Catalog: attributes + terms                                                */
/* -------------------------------------------------------------------------- */

function toAdminAttribute(a: SdkAdminAttribute): AdminAttribute {
    const orderBy = (a.order_by === "menu_order" || a.order_by === "name" || a.order_by === "id" ? a.order_by : "menu_order") as
        | "menu_order"
        | "name"
        | "id";
    return {
        id: a.id,
        code: a.code,
        name: dup(a.name),
        termCount: 0,
        orderBy,
        hasArchives: a.has_archives,
    };
}

export async function listAttributes(): Promise<AdminAttribute[]> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/attributes", {});
    if (error !== undefined || !data) return [];
    return (data.data ?? []).map(toAdminAttribute);
}

export async function getAttribute(id: number): Promise<AdminAttribute | null> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/attributes/{id}", { params: { path: { id } } });
    if (error !== undefined || !data?.data) return null;
    return toAdminAttribute(data.data);
}

export async function listAttributeTerms(attributeId: number): Promise<AdminAttributeTerm[]> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/attributes/{attribute_id}/terms", {
        params: { path: { attribute_id: attributeId } },
    });
    if (error !== undefined || !data) return [];
    return (data.data ?? []).map((t) => ({
        id: t.id,
        attributeId,
        name: dup(t.name),
        slug: t.slug,
    }));
}

/* -------------------------------------------------------------------------- */
/*  Catalog: reviews                                                           */
/* -------------------------------------------------------------------------- */

interface ReviewListParams extends ListParams {
    status?: ReviewStatus | "any";
}

function toAdminReview(r: SdkAdminReview): AdminReview {
    const status: ReviewStatus = r.status === "rejected" ? "spam" : r.status === "approved" ? "approved" : "pending";
    return {
        id: r.id,
        productId: r.product_id,
        productName: dup(""),
        reviewerName: r.reviewer_name,
        reviewerEmail: r.reviewer_email ?? "",
        rating: clampRating(r.rating),
        body: r.body,
        status,
        verified: Boolean(r.verified),
        createdAt: r.created_at ?? new Date().toISOString(),
    };
}

function clampRating(n: number): 1 | 2 | 3 | 4 | 5 {
    return Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

export async function listReviews(params: ReviewListParams = {}): Promise<Paginated<AdminReview>> {
    const api = await apiServer();
    let sdkStatus: "pending" | "approved" | "rejected" | undefined;
    if (params.status === "approved") sdkStatus = "approved";
    else if (params.status === "pending") sdkStatus = "pending";
    else if (params.status === "spam" || params.status === "trash") sdkStatus = "rejected";

    const { data, error } = await api.admin.GET("/api/v1/admin/reviews", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(sdkStatus !== undefined ? { status: sdkStatus } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminReview>(params.perPage);
    const rows = (data.data ?? []).map(toAdminReview);
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

/* -------------------------------------------------------------------------- */
/*  Customers                                                                  */
/* -------------------------------------------------------------------------- */

function toAdminCustomer(c: SdkAdminCustomer): AdminCustomer {
    const iran = c.profile_extensions?.iran;
    return {
        id: Number(c.id),
        userId: c.user?.id !== undefined ? Number(c.user.id) : null,
        firstName: c.first_name ?? "",
        lastName: c.last_name ?? "",
        email: c.user?.email ?? "",
        phone: c.phone ?? "",
        nationalId: iran?.national_id ?? null,
        companyName: iran?.legal_company_name_fa ?? null,
        isPayingCustomer: Boolean(c.is_paying_customer),
        ordersCount: 0,
        totalSpent: 0 as MoneyMinor,
        lastOrderAt: null,
        createdAt: c.created_at ?? new Date().toISOString(),
        addresses: [],
        downloads: [],
    };
}

export async function listCustomers(params: ListParams = {}): Promise<Paginated<AdminCustomer>> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/customers", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(params.search ? { search: params.search } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminCustomer>(params.perPage);
    const rows = (data.data ?? []).map(toAdminCustomer);
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

export async function getCustomer(id: number): Promise<AdminCustomer | null> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/customers/{id}", { params: { path: { id } } });
    if (error !== undefined || !data?.data) return null;
    return toAdminCustomer(data.data);
}

/* -------------------------------------------------------------------------- */
/*  Orders                                                                     */
/* -------------------------------------------------------------------------- */

interface OrderListParams extends ListParams {
    status?: OrderStatus | "any";
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

function normaliseStatus(raw: string | null | undefined): OrderStatus {
    return ORDER_STATUS_MAP[String(raw ?? "pending")] ?? "pending";
}

function toAdminOrderAddress(a: SdkOrderAddress | null | undefined): AdminOrderAddress {
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

function toAdminOrderListRow(o: SdkAdminOrderListRow): AdminOrder {
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

function toAdminOrderDetail(o: SdkAdminOrderDetail): AdminOrder {
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

export async function listOrders(params: OrderListParams = {}): Promise<Paginated<AdminOrder>> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/orders", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(params.status && params.status !== "any" ? { status: params.status } : {}),
                ...(params.search ? { search: params.search } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminOrder>(params.perPage);
    const rows = ((data.data ?? []) as SdkAdminOrderListRow[]).map(toAdminOrderListRow);
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

export async function getOrder(id: number): Promise<AdminOrder | null> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/orders/{id}", { params: { path: { id } } });
    if (error !== undefined || !data?.data) return null;
    return toAdminOrderDetail(data.data);
}

/* -------------------------------------------------------------------------- */
/*  Refunds                                                                    */
/*                                                                             */
/*  TODO(spec): no /api/v1/admin/refunds list operation exists yet — refunds   */
/*  are only nested under /admin/orders/{order_id}/refunds. Until the standalone */
/*  list endpoint ships, the refunds page renders an empty result. Tracking    */
/*  under the missing-operationIds follow-up in the PR description.            */
/* -------------------------------------------------------------------------- */

export async function listRefunds(params: ListParams = {}): Promise<Paginated<AdminRefund>> {
    return emptyPage<AdminRefund>(params.perPage);
}

/* -------------------------------------------------------------------------- */
/*  Coupons                                                                    */
/* -------------------------------------------------------------------------- */

interface CouponListParams extends ListParams {
    status?: AdminCoupon["status"] | "any";
}

function toAdminCoupon(c: SdkAdminCoupon): AdminCoupon {
    const description = (c.translations ?? []).reduce<{ fa?: string; en?: string }>((acc, t) => {
        if (t.locale === "fa") acc.fa = t.description ?? "";
        if (t.locale === "en") acc.en = t.description ?? "";
        return acc;
    }, {});
    return {
        id: c.id,
        code: c.code,
        discountType: c.discount_type,
        amountMinor: c.amount_minor === null || c.amount_minor === undefined ? null : (Number(c.amount_minor) as MoneyMinor),
        amountPercent: c.amount_percent ?? null,
        description: { fa: description.fa ?? "", en: description.en ?? description.fa ?? "" },
        expiresAt: c.expires_at ?? null,
        individualUse: Boolean(c.individual_use),
        excludeSaleItems: Boolean(c.exclude_sale_items),
        minimumAmount:
            c.minimum_amount === null || c.minimum_amount === undefined ? null : (Number(c.minimum_amount) as MoneyMinor),
        maximumAmount:
            c.maximum_amount === null || c.maximum_amount === undefined ? null : (Number(c.maximum_amount) as MoneyMinor),
        usageLimitGlobal: c.usage_limit_global ?? null,
        usageLimitPerUser: c.usage_limit_per_user ?? null,
        freeShipping: Boolean(c.free_shipping),
        status: c.status === "active" ? "active" : "disabled",
        usageCount: 0,
    };
}

export async function listCoupons(params: CouponListParams = {}): Promise<Paginated<AdminCoupon>> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/coupons", {
        params: {
            query: {
                ...(params.page !== undefined ? { page: params.page } : {}),
                ...(params.perPage !== undefined ? { perPage: params.perPage } : {}),
                ...(params.search ? { search: params.search } : {}),
            },
        },
    });
    if (error !== undefined || !data) return emptyPage<AdminCoupon>(params.perPage);
    const rows = (data.data ?? []).map(toAdminCoupon);
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

export async function getCoupon(id: number): Promise<AdminCoupon | null> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/coupons/{id}", { params: { path: { id } } });
    if (error !== undefined || !data?.data) return null;
    return toAdminCoupon(data.data);
}

/* -------------------------------------------------------------------------- */
/*  Payment gateways                                                            */
/* -------------------------------------------------------------------------- */

const KNOWN_GATEWAY_TITLES: Record<string, LocalizedString> = {
    zarinpal: { fa: "زرین‌پال", en: "Zarinpal" },
    idpay: { fa: "آی‌دی پی", en: "IDPay" },
    nextpay: { fa: "نکست‌پی", en: "NextPay" },
    payir: { fa: "پی پینگ", en: "Pay.ir" },
    zibal: { fa: "زیبال", en: "Zibal" },
    cod: { fa: "پرداخت در محل", en: "Cash on Delivery" },
    bank_transfer: { fa: "انتقال بانکی", en: "Bank Transfer" },
};

function toAdminPaymentGateway(g: SdkAdminPaymentGateway): AdminPaymentGateway {
    const titles = KNOWN_GATEWAY_TITLES[g.code] ?? { fa: g.code, en: g.code };
    const settings: Record<string, string> = {};
    for (const [k, v] of Object.entries(g.settings ?? {})) settings[k] = v === null || v === undefined ? "" : String(v);
    return {
        id: g.id,
        code: g.code as PaymentGatewayCode,
        title: titles,
        description: dup(""),
        customerInstructions: dup(""),
        enabled: Boolean(g.enabled),
        ordering: g.ordering ?? 0,
        supportsRefunds: Boolean((g.supports as Record<string, unknown>)?.refunds ?? false),
        settings,
    };
}

export async function listPaymentGateways(): Promise<AdminPaymentGateway[]> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/payment-gateways", {});
    if (error !== undefined || !data) return [];
    return (data.data ?? []).map(toAdminPaymentGateway);
}

export async function getPaymentGateway(code: string): Promise<AdminPaymentGateway | null> {
    const all = await listPaymentGateways();
    return all.find((g) => g.code === code) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  No-spec resources: tax, shipping, settings, refunds list, reports          */
/*                                                                             */
/*  TODO(spec): /api/v1/admin/{tax-classes,tax-rates,shipping-zones,           */
/*  shipping-methods,settings,reports,dashboard} are not yet in the OpenAPI    */
/*  spec. Until they land, these helpers serve static fixtures so the pages    */
/*  keep rendering. Each gap is reported in the PR description.                */
/* -------------------------------------------------------------------------- */

export async function listTaxClasses(): Promise<AdminTaxClass[]> {
    return [
        { id: 1, slug: "standard", name: { fa: "استاندارد", en: "Standard" }, rateCount: 1 },
        { id: 2, slug: "zero", name: { fa: "بدون مالیات", en: "Zero" }, rateCount: 0 },
    ];
}

export async function listTaxRates(): Promise<AdminTaxRate[]> {
    return [
        {
            id: 1,
            taxClassId: 1,
            country: "IR",
            provinceCode: null,
            cities: null,
            ratePercent: 9,
            label: { fa: "مالیات بر ارزش افزوده", en: "VAT" },
            priority: 1,
            compound: false,
            appliesToShipping: false,
        },
    ];
}

export async function listShippingZones(): Promise<AdminShippingZone[]> {
    return [
        { id: 1, name: { fa: "ایران", en: "Iran" }, isFallback: false, countries: ["IR"], methodCount: 2 },
        { id: 2, name: { fa: "سایر کشورها", en: "Rest of World" }, isFallback: true, countries: [], methodCount: 1 },
    ];
}

export async function listShippingMethods(): Promise<AdminShippingMethod[]> {
    return [
        {
            id: 1,
            code: "post",
            titleDefault: { fa: "پست عادی", en: "Standard Post" },
            descriptionDefault: dup(""),
        },
        {
            id: 2,
            code: "tipax",
            titleDefault: { fa: "تیپاکس", en: "Tipax" },
            descriptionDefault: dup(""),
        },
    ];
}

export async function listShippingZoneMethods(zoneId: number): Promise<AdminShippingZoneMethod[]> {
    if (zoneId !== 1) return [];
    return [
        {
            id: 1,
            zoneId,
            methodCode: "post",
            title: { fa: "پست عادی", en: "Standard Post" },
            cost: 500_000 as MoneyMinor,
            enabled: true,
            ordering: 1,
        },
    ];
}

const SETTINGS_GROUPS: AdminSettingsGroup[] = [
    {
        key: "general",
        title: { fa: "تنظیمات عمومی", en: "General" },
        subtitle: { fa: "نام فروشگاه، آدرس و واحد پول.", en: "Store name, address, and currency." },
        fields: [
            {
                key: "store_name",
                label: { fa: "نام فروشگاه", en: "Store name" },
                description: dup(""),
                type: "text",
                value: "Calibra",
            },
        ],
    },
];

export async function listSettingsGroups(): Promise<AdminSettingsGroup[]> {
    return SETTINGS_GROUPS;
}

export async function getSettingsGroup(key: SettingsGroupKey): Promise<AdminSettingsGroup | null> {
    return SETTINGS_GROUPS.find((g) => g.key === key) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Reports — composed from existing admin endpoints                           */
/*                                                                             */
/*  TODO(spec): no first-party reports operation; this composes a sales report */
/*  from /api/v1/admin/orders. When a real report endpoint lands, swap this    */
/*  implementation for a single SDK call.                                      */
/*                                                                             */
/*  Dashboard aggregation lives in `lib/queries/dashboard.ts` — the dashboard  */
/*  fetches client-side through the same-origin proxy so widgets can stream    */
/*  independently. Add helpers there for new dashboard widgets, not here.      */
/* -------------------------------------------------------------------------- */

function buildSalesSeries(orders: AdminOrder[]): { date: string; revenue: MoneyMinor; orders: number }[] {
    const buckets = new Map<string, { revenue: number; orders: number }>();
    const today = new Date();
    for (let i = 13; i >= 0; i -= 1) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { revenue: 0, orders: 0 });
    }
    for (const o of orders) {
        const key = new Date(o.createdAt).toISOString().slice(0, 10);
        const bucket = buckets.get(key);
        if (bucket === undefined) continue;
        bucket.revenue += Number(o.grandTotal);
        bucket.orders += 1;
    }
    return [...buckets.entries()].map(([date, v]) => ({ date, revenue: v.revenue as MoneyMinor, orders: v.orders }));
}

export async function getSalesReport(): Promise<SalesReport> {
    const api = await apiServer();
    const { data } = await api.admin.GET("/api/v1/admin/orders", { params: { query: { perPage: 100 } } });
    const orders = ((data?.data ?? []) as SdkAdminOrderListRow[]).map(toAdminOrderListRow);
    const totalRevenue = orders.reduce((s, o) => s + Number(o.grandTotal), 0) as MoneyMinor;
    const orderCount = orders.length;
    const avg = orderCount === 0 ? 0 : Math.floor(totalRevenue / orderCount);
    return {
        totalRevenue,
        netRevenue: totalRevenue,
        refundedAmount: 0 as MoneyMinor,
        averageOrderValue: avg as MoneyMinor,
        orderCount,
        series: buildSalesSeries(orders).map((p) => ({ ...p, refunded: 0 as MoneyMinor })),
    };
}

export async function getTopSellersReport(): Promise<TopSellersReport> {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
        range: { startDate: thirtyDaysAgo, endDate: today },
        rows: [],
    };
}
