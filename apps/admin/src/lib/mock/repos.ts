/**
 * Mock repository layer. Every function returns a promise so swapping these for SDK calls is a
 * mechanical change later — pages can `await` exactly the same way against the real API.
 *
 * All filtering / pagination happens in-memory against the seed fixtures in `./data.ts`.
 */

import {
    attributes,
    attributeTerms,
    brands,
    categories,
    coupons,
    customers,
    dashboard,
    orders,
    paymentGateways,
    products,
    refunds,
    reviews,
    salesReport,
    settingsGroups,
    shippingMethods,
    shippingZoneMethods,
    shippingZones,
    tags,
    taxClasses,
    taxRates,
    topSellersReport,
} from "./data";
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
    DashboardStats,
    OrderStatus,
    Paginated,
    ReviewStatus,
    SalesReport,
    SettingsGroupKey,
    TopSellersReport,
} from "./types";

interface ListParams {
    page?: number;
    perPage?: number;
    search?: string;
}

function paginate<T>(rows: T[], { page = 1, perPage = 20 }: { page?: number; perPage?: number }): Paginated<T> {
    const total = rows.length;
    const lastPage = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(Math.max(1, page), lastPage);
    const slice = rows.slice((safePage - 1) * perPage, safePage * perPage);
    return { data: slice, meta: { page: safePage, perPage, total, lastPage } };
}

function matchesText(haystacks: string[], needle: string | undefined): boolean {
    if (needle === undefined || needle.length === 0) return true;
    const lower = needle.toLowerCase();
    return haystacks.some((h) => h.toLowerCase().includes(lower));
}

/* -------------------------------------------------------------------------- */
/*  Dashboard                                                                 */
/* -------------------------------------------------------------------------- */

export async function getDashboardStats(): Promise<DashboardStats> {
    return dashboard;
}

/* -------------------------------------------------------------------------- */
/*  Catalog                                                                   */
/* -------------------------------------------------------------------------- */

interface ProductListParams extends ListParams {
    status?: AdminProduct["status"] | "any";
    categoryId?: number;
}

export async function listProducts(params: ProductListParams = {}): Promise<Paginated<AdminProduct>> {
    const filtered = products.filter((product) => {
        if (params.status !== undefined && params.status !== "any" && product.status !== params.status) return false;
        if (params.categoryId !== undefined && !product.categoryIds.includes(params.categoryId)) return false;
        if (!matchesText([product.name.fa, product.name.en, product.sku], params.search)) return false;
        return true;
    });
    return paginate(filtered, params);
}

export async function getProduct(id: number): Promise<AdminProduct | null> {
    return products.find((product) => product.id === id) ?? null;
}

export async function listCategories(params: ListParams = {}): Promise<Paginated<AdminCategory>> {
    const filtered = categories.filter((category) => matchesText([category.name.fa, category.name.en, category.slug.fa, category.slug.en], params.search));
    return paginate(filtered, params);
}

export async function listTags(params: ListParams = {}): Promise<Paginated<AdminTag>> {
    const filtered = tags.filter((tag) => matchesText([tag.name.fa, tag.name.en, tag.slug.fa, tag.slug.en], params.search));
    return paginate(filtered, params);
}

export async function listBrands(params: ListParams = {}): Promise<Paginated<AdminBrand>> {
    const filtered = brands.filter((brand) => matchesText([brand.name.fa, brand.name.en, brand.slug.fa, brand.slug.en], params.search));
    return paginate(filtered, params);
}

export async function listAttributes(): Promise<AdminAttribute[]> {
    return attributes;
}

export async function getAttribute(id: number): Promise<AdminAttribute | null> {
    return attributes.find((attr) => attr.id === id) ?? null;
}

export async function listAttributeTerms(attributeId: number): Promise<AdminAttributeTerm[]> {
    return attributeTerms.filter((term) => term.attributeId === attributeId);
}

interface ReviewListParams extends ListParams {
    status?: ReviewStatus | "any";
}

export async function listReviews(params: ReviewListParams = {}): Promise<Paginated<AdminReview>> {
    const filtered = reviews.filter((review) => {
        if (params.status !== undefined && params.status !== "any" && review.status !== params.status) return false;
        if (!matchesText([review.reviewerName, review.reviewerEmail, review.body], params.search)) return false;
        return true;
    });
    return paginate(filtered, params);
}

/* -------------------------------------------------------------------------- */
/*  Customers                                                                 */
/* -------------------------------------------------------------------------- */

export async function listCustomers(params: ListParams = {}): Promise<Paginated<AdminCustomer>> {
    const filtered = customers.filter((customer) =>
        matchesText([customer.firstName, customer.lastName, customer.email, customer.phone, customer.companyName ?? ""], params.search),
    );
    return paginate(filtered, params);
}

export async function getCustomer(id: number): Promise<AdminCustomer | null> {
    return customers.find((customer) => customer.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

interface OrderListParams extends ListParams {
    status?: OrderStatus | "any";
}

export async function listOrders(params: OrderListParams = {}): Promise<Paginated<AdminOrder>> {
    const filtered = orders.filter((order) => {
        if (params.status !== undefined && params.status !== "any" && order.status !== params.status) return false;
        if (!matchesText([order.customerName, order.billingEmail, order.orderNumber.toString()], params.search)) return false;
        return true;
    });
    return paginate(filtered, params);
}

export async function getOrder(id: number): Promise<AdminOrder | null> {
    return orders.find((order) => order.id === id) ?? null;
}

export async function listRefunds(params: ListParams = {}): Promise<Paginated<AdminRefund>> {
    const filtered = refunds.filter((refund) =>
        matchesText([refund.orderNumber.toString(), refund.reason ?? "", refund.refundedByName], params.search),
    );
    return paginate(filtered, params);
}

/* -------------------------------------------------------------------------- */
/*  Coupons                                                                   */
/* -------------------------------------------------------------------------- */

interface CouponListParams extends ListParams {
    status?: AdminCoupon["status"] | "any";
}

export async function listCoupons(params: CouponListParams = {}): Promise<Paginated<AdminCoupon>> {
    const filtered = coupons.filter((coupon) => {
        if (params.status !== undefined && params.status !== "any" && coupon.status !== params.status) return false;
        if (!matchesText([coupon.code, coupon.description.fa, coupon.description.en], params.search)) return false;
        return true;
    });
    return paginate(filtered, params);
}

export async function getCoupon(id: number): Promise<AdminCoupon | null> {
    return coupons.find((coupon) => coupon.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Configuration                                                             */
/* -------------------------------------------------------------------------- */

export async function listTaxClasses(): Promise<AdminTaxClass[]> {
    return taxClasses;
}

export async function listTaxRates(): Promise<AdminTaxRate[]> {
    return taxRates;
}

export async function listShippingZones(): Promise<AdminShippingZone[]> {
    return shippingZones;
}

export async function listShippingMethods(): Promise<AdminShippingMethod[]> {
    return shippingMethods;
}

export async function listShippingZoneMethods(zoneId: number): Promise<AdminShippingZoneMethod[]> {
    return shippingZoneMethods.filter((method) => method.zoneId === zoneId);
}

export async function listPaymentGateways(): Promise<AdminPaymentGateway[]> {
    return paymentGateways;
}

export async function getPaymentGateway(code: string): Promise<AdminPaymentGateway | null> {
    return paymentGateways.find((gateway) => gateway.code === code) ?? null;
}

export async function listSettingsGroups(): Promise<AdminSettingsGroup[]> {
    return settingsGroups;
}

export async function getSettingsGroup(key: SettingsGroupKey): Promise<AdminSettingsGroup | null> {
    return settingsGroups.find((group) => group.key === key) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                   */
/* -------------------------------------------------------------------------- */

export async function getSalesReport(): Promise<SalesReport> {
    return salesReport;
}

export async function getTopSellersReport(): Promise<TopSellersReport> {
    return topSellersReport;
}
