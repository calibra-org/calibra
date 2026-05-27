/**
 * Admin-side view types. The shapes mirror the ADR schema; `./server-repos.ts` adapts every SDK
 * response into one of these so page templates stay untouched whether they're rendering against
 * fixture data or the live AdonisJS API.
 *
 * `LocalizedString` stays as `Record<Locale, string>` deliberately. The API resolves one locale
 * per request (via `Accept-Language`) and returns plain strings; the adapter fans the resolved
 * string out to both `fa` and `en` keys so the existing `row.name[locale]` access pattern keeps
 * working. The wire types in `@calibra/sdk` stay narrow.
 *
 * @see /docs/adr/0001-commerce-domain-model.md
 */

import type { Locale } from "@calibra/shared/i18n";

/** Money amount in minor units (Rial). 1 Toman = 10 Rial. */
export type MoneyMinor = number;

export type LocalizedString = Record<Locale, string>;

export type ProductStatus = "draft" | "publish" | "private" | "pending";
export type ProductType = "simple" | "variable" | "grouped" | "external";
export type StockStatus = "instock" | "outofstock" | "onbackorder";

export type CatalogVisibility = "visible" | "catalog" | "search" | "hidden";

export interface AdminProduct {
    id: number;
    sku: string;
    gtin: string | null;
    type: ProductType;
    status: ProductStatus;
    catalogVisibility: CatalogVisibility;
    name: LocalizedString;
    slug: LocalizedString;
    shortDescription: LocalizedString;
    regularPrice: MoneyMinor;
    salePrice: MoneyMinor | null;
    saleStartsAt: string | null;
    saleEndsAt: string | null;
    stockQuantity: number | null;
    stockStatus: StockStatus;
    manageStock: boolean;
    lowStock: boolean;
    featured: boolean;
    categoryIds: number[];
    brandId: number | null;
    tagIds: number[];
    imageUrl: string | null;
    galleryImageUrls: string[];
    weightGrams: number | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

export interface AdminCategory {
    id: number;
    parentId: number | null;
    name: LocalizedString;
    slug: LocalizedString;
    productCount: number;
    imageMediaId: number | null;
    imageUrl: string | null;
}

export interface AdminTag {
    id: number;
    name: LocalizedString;
    slug: LocalizedString;
    productCount: number;
}

export interface AdminBrand {
    id: number;
    name: LocalizedString;
    slug: LocalizedString;
    productCount: number;
    imageMediaId: number | null;
    logoUrl: string | null;
}

export interface AdminAttribute {
    id: number;
    code: string;
    name: LocalizedString;
    termCount: number;
    orderBy: "menu_order" | "name" | "id";
    hasArchives: boolean;
}

export interface AdminAttributeTerm {
    id: number;
    attributeId: number;
    name: LocalizedString;
    slug: string;
}

export type ReviewStatus = "pending" | "approved" | "spam" | "trash";

export interface AdminReview {
    id: number;
    productId: number;
    productName: LocalizedString;
    productSlug: LocalizedString;
    reviewerName: string;
    reviewerEmail: string;
    rating: 1 | 2 | 3 | 4 | 5;
    body: string;
    status: ReviewStatus;
    verified: boolean;
    createdAt: string;
    /**
     * Optional admin reply persisted client-side. The API does not yet expose a reply field on
     * the review row; once it does, this becomes the canonical source.
     */
    reply: string | null;
    /** ISO timestamp of the reply edit, when {@link reply} is non-null. Client-side only for now. */
    repliedAt: string | null;
}

export type OrderStatus = "draft" | "pending" | "on_hold" | "processing" | "completed" | "cancelled" | "refunded" | "failed";

export interface AdminOrderAddress {
    firstName: string;
    lastName: string;
    company: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    provinceCode: string;
    postcode: string;
    country: string;
    phone: string;
    nationalId: string | null;
}

export interface AdminOrderLineItem {
    id: number;
    productId: number;
    name: LocalizedString;
    sku: string;
    quantity: number;
    unitPrice: MoneyMinor;
    subtotal: MoneyMinor;
    taxTotal: MoneyMinor;
    total: MoneyMinor;
    imageUrl: string | null;
}

export interface AdminOrderStatusHistoryEntry {
    id: number;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    occurredAt: string;
    changedBy: string | null;
    reason: string | null;
}

export interface AdminOrderNote {
    id: number;
    body: string;
    visibility: "internal" | "customer";
    authorName: string;
    createdAt: string;
}

export interface AdminOrderShippingLine {
    id: number;
    methodTitle: LocalizedString;
    total: MoneyMinor;
}

export interface AdminOrderCouponLine {
    id: number;
    code: string;
    discount: MoneyMinor;
}

export interface AdminOrderTaxLine {
    id: number;
    label: LocalizedString;
    rate: number;
    total: MoneyMinor;
}

export interface AdminOrderFeeLine {
    id: number;
    name: string;
    total: MoneyMinor;
    totalTax: MoneyMinor;
    taxable: boolean;
    taxClassId: number | null;
}

export type AdminOrderSource = "web" | "admin" | "api" | "import" | "checkout-block" | "checkout" | null;

export type OrderRiskFlag = "high_value" | "shipping_mismatch" | "failed_payment" | (string & {});

export type OrderCreatedVia = "checkout" | "admin" | "api" | "import" | (string & {});

export interface AdminOrderShippingInfo {
    trackingNumber: string | null;
    trackingUrl: string | null;
    carrier: string | null;
    shippedAt: string | null;
}

export interface AdminOrder {
    id: number;
    orderNumber: number;
    orderKey: string;
    status: OrderStatus;
    customerId: number | null;
    customerName: string;
    billingEmail: string;
    currency: "IRR";
    currencyDisplay: "IRR" | "IRT";
    grandTotal: MoneyMinor;
    itemsTotal: MoneyMinor;
    shippingTotal: MoneyMinor;
    discountTotal: MoneyMinor;
    taxTotal: MoneyMinor;
    feesTotal: MoneyMinor;
    paymentMethodTitle: LocalizedString;
    createdAt: string;
    updatedAt: string | null;
    paidAt: string | null;
    completedAt: string | null;
    createdVia: OrderCreatedVia;
    source: AdminOrderSource;
    ipAddress: string | null;
    userAgent: string | null;
    referrer: string | null;
    isLocked: boolean;
    unlockOverride: boolean;
    meta: Record<string, string>;
    metaVisible: Record<string, string>;
    metaHidden: Record<string, string>;
    itemCount: number;
    couponCodes: string[];
    riskFlags: OrderRiskFlag[];
    billingAddress: AdminOrderAddress;
    shippingAddress: AdminOrderAddress;
    lineItems: AdminOrderLineItem[];
    shippingLines: AdminOrderShippingLine[];
    feeLines: AdminOrderFeeLine[];
    couponLines: AdminOrderCouponLine[];
    taxLines: AdminOrderTaxLine[];
    history: AdminOrderStatusHistoryEntry[];
    notes: AdminOrderNote[];
    shippingInfo: AdminOrderShippingInfo | null;
}

export interface AdminRefund {
    id: number;
    refundNumber: number;
    orderId: number;
    orderNumber: number;
    amount: MoneyMinor;
    reason: string | null;
    refundedByName: string;
    processedAt: string;
    gatewayRefundId: string | null;
}

export interface AdminCustomerAddress {
    id: number;
    kind: "billing" | "shipping" | "both";
    label: string;
    firstName: string;
    lastName: string;
    company: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    provinceCode: string;
    postcode: string;
    country: string;
    phone: string;
    isDefault: boolean;
}

export interface AdminCustomerDownload {
    id: number;
    productName: LocalizedString;
    orderNumber: number;
    grantedAt: string;
    expiresAt: string | null;
    downloadLimit: number | null;
    downloadsUsed: number;
}

export type AdminCustomerStatus = "active" | "suspended" | "deleted";

export interface AdminCustomerMarketingPrefs {
    emailOptIn: boolean;
    emailOptInAt: string | null;
    emailOptInSource: string | null;
    smsOptIn: boolean;
    smsOptInAt: string | null;
    smsOptInSource: string | null;
    phoneCallOptIn: boolean;
    phoneCallOptInAt: string | null;
    phoneCallOptInSource: string | null;
    updatedAt: string | null;
}

export interface AdminCustomer {
    id: number;
    userId: number | null;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    nationalId: string | null;
    companyName: string | null;
    isPayingCustomer: boolean;
    status: AdminCustomerStatus;
    hasAccount: boolean;
    /** Driven from the linked auth user (`User.emailVerifiedAt`); proxied here for the list page status pill. */
    emailVerified: boolean;
    acquisitionChannel: string | null;
    lastSeenAt: string | null;
    tags: string[];
    /** Lifetime metrics from the stats aggregate query. Zero when no orders. */
    ordersCount: number;
    totalSpent: MoneyMinor;
    averageOrderValue: MoneyMinor;
    lastOrderAt: string | null;
    firstOrderAt: string | null;
    daysSinceLastOrder: number | null;
    addressesCount: number;
    notesCount: number;
    createdAt: string;
    addresses: AdminCustomerAddress[];
    downloads: AdminCustomerDownload[];
    marketingPrefs?: AdminCustomerMarketingPrefs;
}

export interface AdminCustomerInsights {
    total: number;
    totalDelta30d: number;
    avgOrderCount: number;
    avgOrderCountDelta30d: number;
    avgLifetimeSpend: MoneyMinor;
    avgLifetimeSpendDelta30dPct: number;
    avgOrderValue: MoneyMinor;
    avgOrderValueDelta30dPct: number;
    pctWithAccount: number;
    sparklines: {
        total: number[];
        spend: number[];
    };
    generatedAt: string;
}

export interface AdminCustomerCounts {
    all: number;
    accountHolders: number;
    guest: number;
    bigSpenders: number;
    new30d: number;
    inactive180d: number;
    noAddress: number;
    trashed: number;
    summary: {
        avgOrderCount: number;
        avgLifetimeSpend: MoneyMinor;
        avgAov: MoneyMinor;
        pctWithAccount: number;
    };
}

export interface AdminCustomerStatsDetail {
    lifetimeOrderCount: number;
    lifetimeSpend: MoneyMinor;
    averageOrderValue: MoneyMinor;
    lastOrderAt: string | null;
    firstOrderAt: string | null;
    daysSinceLastOrder: number | null;
    monthlySpendSeries: { month: string; amount: MoneyMinor }[];
    favoriteProductId: number | null;
}

export interface AdminCustomerNote {
    id: number;
    customerId: number;
    body: string;
    authorId: number | null;
    authorEmail: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminCustomerTagRow {
    id: number;
    name: string;
    createdAt: string | null;
}

export interface AdminCustomerSegment {
    id: number;
    name: string;
    filters: Record<string, unknown>;
    isPinned: boolean;
    createdAt: string | null;
    updatedAt: string | null;
    lastUsedAt: string | null;
}

export interface AdminCustomerStatusHistory {
    id: number;
    fromStatus: AdminCustomerStatus | null;
    toStatus: AdminCustomerStatus;
    reason: string | null;
    actorEmail: string | null;
    occurredAt: string;
}

export interface AdminCustomerMarketingHistory {
    id: number;
    channel: "email" | "sms" | "phone";
    optedIn: boolean;
    source: string | null;
    actorEmail: string | null;
    occurredAt: string;
}

export interface AdminCustomerTimelineEntry {
    kind: "order" | "note" | "status" | "marketing" | "impersonation";
    occurredAt: string;
    payload: Record<string, unknown>;
    actor: { id: string; email: string } | null;
}

export type CouponDiscountType = "percent" | "fixed_cart" | "fixed_product" | "free_shipping";

export interface AdminCoupon {
    id: number;
    code: string;
    discountType: CouponDiscountType;
    amountMinor: MoneyMinor | null;
    amountPercent: number | null;
    description: LocalizedString;
    startsAt: string | null;
    expiresAt: string | null;
    individualUse: boolean;
    excludeSaleItems: boolean;
    minimumAmount: MoneyMinor | null;
    maximumAmount: MoneyMinor | null;
    usageLimitGlobal: number | null;
    usageLimitPerUser: number | null;
    limitUsageToXItems: number | null;
    freeShipping: boolean;
    status: "active" | "disabled";
    usageCount: number;
    recentRedemptions7d: number;
    productConstraints: { include: number[]; exclude: number[] };
    categoryConstraints: { include: number[]; exclude: number[] };
    brandConstraints: { include: number[]; exclude: number[] };
    emailRestrictions: string[];
    productConstraintsCount: number;
    categoryConstraintsCount: number;
    brandConstraintsCount: number;
    emailRestrictionsCount: number;
    deletedAt: string | null;
}

export interface AdminCouponCounts {
    all: number;
    active: number;
    disabled: number;
    expired: number;
    scheduled: number;
    used: number;
    trashed: number;
    expiringSoon: number;
}

export type CouponTabKey = "any" | "active" | "disabled" | "expired" | "scheduled" | "used" | "trashed";

export interface AdminTaxClass {
    id: number;
    slug: string;
    name: LocalizedString;
    rateCount: number;
}

export interface AdminTaxRate {
    id: number;
    taxClassId: number;
    country: string | null;
    provinceCode: string | null;
    cities: string[] | null;
    ratePercent: number;
    label: LocalizedString;
    priority: number;
    compound: boolean;
    appliesToShipping: boolean;
}

export interface AdminShippingZone {
    id: number;
    name: LocalizedString;
    isFallback: boolean;
    countries: string[];
    methodCount: number;
}

export interface AdminShippingMethod {
    id: number;
    code: string;
    titleDefault: LocalizedString;
    descriptionDefault: LocalizedString;
}

export interface AdminShippingZoneMethod {
    id: number;
    zoneId: number;
    methodCode: string;
    title: LocalizedString;
    cost: MoneyMinor;
    enabled: boolean;
    ordering: number;
}

export type PaymentGatewayCode = "zarinpal" | "idpay" | "nextpay" | "payir" | "zibal" | "cod" | "bank_transfer";

export type PaymentGatewayImplementationStatus = "stub" | "live";

export interface AdminPaymentGateway {
    id: number;
    code: PaymentGatewayCode;
    title: LocalizedString;
    description: LocalizedString;
    customerInstructions: LocalizedString;
    enabled: boolean;
    ordering: number;
    supportsRefunds: boolean;
    /**
     * `"stub"` rows are recognised by the platform but every PSP lifecycle method throws
     * `E_GATEWAY_NOT_IMPLEMENTED`. The admin UI surfaces a badge and disables the enable
     * toggle on these rows; the storefront refuses to submit against them.
     */
    implementationStatus: PaymentGatewayImplementationStatus;
    settings: Record<string, string>;
}

export type SettingsGroupKey = "general" | "products" | "tax" | "shipping" | "account" | "email" | "advanced";

export interface AdminSettingField {
    key: string;
    label: LocalizedString;
    description: LocalizedString;
    type: "text" | "select" | "switch" | "number" | "textarea";
    value: string | boolean | number;
    options?: { value: string; label: LocalizedString }[];
}

export interface AdminSettingsGroup {
    key: SettingsGroupKey;
    title: LocalizedString;
    subtitle: LocalizedString;
    fields: AdminSettingField[];
}

export interface SalesReport {
    totalRevenue: MoneyMinor;
    netRevenue: MoneyMinor;
    refundedAmount: MoneyMinor;
    averageOrderValue: MoneyMinor;
    orderCount: number;
    series: { date: string; revenue: MoneyMinor; orders: number; refunded: MoneyMinor }[];
}

export interface TopSellersReport {
    range: { startDate: string; endDate: string };
    rows: { productId: number; name: LocalizedString; sku: string; units: number; revenue: MoneyMinor }[];
}

/**
 * Coarse media kind, mirroring the API. `image` covers anything with an `image/*` MIME; everything
 * else lives under `file` and is further classified by inspecting the MIME string client-side
 * (see {@link "#/views/media/types".classifyMediaType}).
 */
export type AdminMediaKind = "image" | "file";

export interface AdminMedia {
    id: number;
    kind: AdminMediaKind;
    url: string;
    filename: string;
    title: string | null;
    alt: string | null;
    caption: string | null;
    description: string | null;
    mime: string | null;
    width: number | null;
    height: number | null;
    sizeBytes: number | null;
    uploadedByUserId: number | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface Paginated<T> {
    data: T[];
    meta: { page: number; perPage: number; total: number; lastPage: number };
}

/**
 * Regional insights — one country-mode row per ISO-3166-2:IR province. `revenueMinor` is a
 * `number` (Rial minor units); the wire format ships a numeric string for BIGINT safety and
 * the adapter converts via `Number()`. Iran's gross dashboard revenue fits comfortably below
 * `2^53` so the precision tradeoff is fine for the heatmap.
 */
export interface AdminRegionalProvinceRow {
    regionId: number;
    code: string;
    name: LocalizedString;
    ordersCount: number;
    revenueMinor: MoneyMinor;
    customersCount: number;
}

/** Country-mode envelope: 31 province rows plus a totals + range summary. */
export interface AdminRegionalCountry {
    rows: AdminRegionalProvinceRow[];
    totals: { ordersCount: number; revenueMinor: MoneyMinor; customersCount: number };
    range: { from: string; to: string };
}

/**
 * One county (شهرستان) row inside a province-mode response. Counties are rolled up from the
 * order-address city snapshot via sajaddp's city→county lookup so this list aligns 1:1 with
 * the polygons drawn on the province SVG. `matched: false` rows carry raw snapshot text that
 * didn't resolve to any sajaddp county — kept visible for data-hygiene visibility.
 */
export interface AdminRegionalCounty {
    name: { fa: string; en: string | null };
    ordersCount: number;
    revenueMinor: MoneyMinor;
    customersCount: number;
    matched: boolean;
}

/** Province-mode envelope with totals, top products, and top counties. */
export interface AdminRegionalProvinceDetail {
    regionId: number;
    code: string;
    name: LocalizedString;
    ordersCount: number;
    revenueMinor: MoneyMinor;
    customersCount: number;
    topProducts: Array<{
        productId: number;
        name: string;
        sku: string | null;
        units: number;
        revenueMinor: MoneyMinor;
        imageUrl: string | null;
    }>;
    counties: AdminRegionalCounty[];
    range: { from: string; to: string };
}
