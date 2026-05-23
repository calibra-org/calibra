import "server-only";

import type { AdminSchemas } from "@calibra/sdk";

import { toAdminCoupon } from "./adapters/coupons";
import { toAdminCustomer } from "./adapters/customers";
import { type SdkAdminOrderListRow, toAdminOrderDetail, toAdminOrderListRow } from "./adapters/orders";
import { toAdminProduct } from "./adapters/products";
import { toAdminReview } from "./adapters/reviews";
import { apiServer } from "./api";
import type {
    AdminAttribute,
    AdminAttributeTerm,
    AdminBrand,
    AdminCategory,
    AdminCoupon,
    AdminCustomer,
    AdminOrder,
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
type SdkAdminPaymentGateway = Schemas["AdminPaymentGateway"];

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

const _VIEW_PRODUCT_STATUS_MAP: Record<string, ProductStatus> = {
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

/**
 * Listing payload for the attributes workbench. The base list endpoint doesn't return term
 * counts or term-name previews, so we fan out one terms listing per attribute (capped) and
 * surface both back. Cost scales O(attributes); fine for the typical store with ≤ 20
 * attributes, but document the fan-out so future callers know to swap for a single endpoint
 * when one ships.
 */
export interface AdminAttributesIndex {
    attributes: AdminAttribute[];
    termCounts: Record<number, number>;
    termPreviews: Record<number, string[]>;
}

/** Hard cap on the term names embedded in the list-row preview. Avoid unbounded fan-out cost. */
const ATTRIBUTE_TERMS_PREVIEW_LIMIT = 8;

/**
 * Returns the attributes list along with each row's term count and a short list of term names
 * for the row preview. Used by `apps/admin/.../products/attributes/page.tsx`. Fans out one
 * `GET /api/v1/admin/attributes/{id}/terms` per attribute — acceptable for the small
 * attributes table this surface manages.
 *
 * TODO(api): expose `term_count` + a small `term_preview` field on `GET /admin/attributes` so
 * this fan-out can be dropped.
 */
export async function listAttributesWithTerms(): Promise<AdminAttributesIndex> {
    const api = await apiServer();
    const { data, error } = await api.admin.GET("/api/v1/admin/attributes", {});
    if (error !== undefined || !data) return { attributes: [], termCounts: {}, termPreviews: {} };
    const attributes = (data.data ?? []).map(toAdminAttribute);
    const termCounts: Record<number, number> = {};
    const termPreviews: Record<number, string[]> = {};
    await Promise.all(
        attributes.map(async (attribute) => {
            const res = await api.admin.GET("/api/v1/admin/attributes/{attribute_id}/terms", {
                params: {
                    path: { attribute_id: attribute.id },
                    query: { perPage: ATTRIBUTE_TERMS_PREVIEW_LIMIT },
                },
            });
            termCounts[attribute.id] = res.data?.meta?.total ?? res.data?.data?.length ?? 0;
            termPreviews[attribute.id] = (res.data?.data ?? []).map((term) => term.name);
            attribute.termCount = termCounts[attribute.id];
        }),
    );
    return { attributes, termCounts, termPreviews };
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
    const rows = (data.data ?? []).map((row) => toAdminReview(row));
    const meta = data.meta ?? { page: 1, perPage: params.perPage ?? rows.length, total: rows.length, lastPage: 1 };
    return { data: rows, meta };
}

/* -------------------------------------------------------------------------- */
/*  Customers                                                                  */
/* -------------------------------------------------------------------------- */

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
    status?: AdminOrder["status"] | "any";
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
