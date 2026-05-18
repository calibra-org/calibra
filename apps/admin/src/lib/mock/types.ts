/**
 * Admin-side view types for mock mode. Mirrors the ADR schema (apps/api will eventually return
 * the same shapes through the SDK) but lives here for now so the admin can render every page
 * without a live backend. When the real API endpoints land, these move into `@calibra/sdk/types`
 * and the repos in `./repos.ts` swap from in-memory fixtures to SDK calls — pages stay untouched.
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

export interface AdminProduct {
    id: number;
    sku: string;
    type: ProductType;
    status: ProductStatus;
    name: LocalizedString;
    slug: LocalizedString;
    shortDescription: LocalizedString;
    regularPrice: MoneyMinor;
    salePrice: MoneyMinor | null;
    stockQuantity: number | null;
    stockStatus: StockStatus;
    manageStock: boolean;
    featured: boolean;
    categoryIds: number[];
    brandId: number | null;
    tagIds: number[];
    imageUrl: string | null;
    weightGrams: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminCategory {
    id: number;
    parentId: number | null;
    name: LocalizedString;
    slug: LocalizedString;
    productCount: number;
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
    reviewerName: string;
    reviewerEmail: string;
    rating: 1 | 2 | 3 | 4 | 5;
    body: string;
    status: ReviewStatus;
    verified: boolean;
    createdAt: string;
}

export type OrderStatus =
    | "draft"
    | "pending"
    | "on_hold"
    | "processing"
    | "completed"
    | "cancelled"
    | "refunded"
    | "failed";

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
    paymentMethodTitle: LocalizedString;
    createdAt: string;
    paidAt: string | null;
    completedAt: string | null;
    billingAddress: AdminOrderAddress;
    shippingAddress: AdminOrderAddress;
    lineItems: AdminOrderLineItem[];
    shippingLines: AdminOrderShippingLine[];
    couponLines: AdminOrderCouponLine[];
    taxLines: AdminOrderTaxLine[];
    history: AdminOrderStatusHistoryEntry[];
    notes: AdminOrderNote[];
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
    ordersCount: number;
    totalSpent: MoneyMinor;
    lastOrderAt: string | null;
    createdAt: string;
    addresses: AdminCustomerAddress[];
    downloads: AdminCustomerDownload[];
}

export type CouponDiscountType = "percent" | "fixed_cart" | "fixed_product" | "free_shipping";

export interface AdminCoupon {
    id: number;
    code: string;
    discountType: CouponDiscountType;
    amountMinor: MoneyMinor | null;
    amountPercent: number | null;
    description: LocalizedString;
    expiresAt: string | null;
    individualUse: boolean;
    excludeSaleItems: boolean;
    minimumAmount: MoneyMinor | null;
    maximumAmount: MoneyMinor | null;
    usageLimitGlobal: number | null;
    usageLimitPerUser: number | null;
    freeShipping: boolean;
    status: "active" | "disabled";
    usageCount: number;
}

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

export type PaymentGatewayCode =
    | "zarinpal"
    | "idpay"
    | "nextpay"
    | "payir"
    | "zibal"
    | "cod"
    | "bank_transfer";

export interface AdminPaymentGateway {
    id: number;
    code: PaymentGatewayCode;
    title: LocalizedString;
    description: LocalizedString;
    customerInstructions: LocalizedString;
    enabled: boolean;
    ordering: number;
    supportsRefunds: boolean;
    settings: Record<string, string>;
}

export type SettingsGroupKey =
    | "general"
    | "products"
    | "tax"
    | "shipping"
    | "account"
    | "email"
    | "advanced";

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

/** Aggregate stats for the dashboard. */
export interface DashboardStats {
    ordersToday: number;
    ordersDeltaPercent: number;
    revenueToday: MoneyMinor;
    revenueDeltaPercent: number;
    activeProducts: number;
    activeProductsDeltaPercent: number;
    pendingFulfilments: number;
    newCustomersToday: number;
    salesSeries: { date: string; revenue: MoneyMinor; orders: number }[];
    ordersByStatus: { status: OrderStatus; count: number }[];
    topProducts: { productId: number; name: LocalizedString; sku: string; revenue: MoneyMinor; units: number }[];
    recentOrders: AdminOrder[];
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

export interface Paginated<T> {
    data: T[];
    meta: { page: number; perPage: number; total: number; lastPage: number };
}
