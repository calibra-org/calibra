import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import Order from "#models/order";
import OrderLineItem from "#models/order_line_item";
import { CacheTags } from "#services/cache_keys";
import { createTaxableProduct } from "#tests/helpers/cart";
import { resetWithPhase07 } from "#tests/helpers/refunds";

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({ userId: admin.id, firstName: "Admin", lastName: "User", countryDefault: "IR", isPayingCustomer: false });
    return admin;
}

async function plainUser() {
    const user = await UserFactory.create();
    await Customer.create({ userId: user.id, firstName: "Plain", lastName: "User", countryDefault: "IR", isPayingCustomer: true });
    return user;
}

async function nextOrderNumber(): Promise<number> {
    const result = (await db.rawQuery("SELECT nextval('order_number_seq') as next")) as { rows?: Array<{ next: unknown }> };
    return Number(result.rows?.[0]?.next ?? 0);
}

async function nextRefundNumber(): Promise<number> {
    const result = (await db.rawQuery("SELECT nextval('refund_number_seq') as next")) as { rows?: Array<{ next: unknown }> };
    return Number(result.rows?.[0]?.next ?? 0);
}

interface OrderSpec {
    productId: number;
    status?: OrderStatus;
    quantity?: number;
    lineSubtotal: number;
    itemsTotal: number;
    taxTotal?: number;
    shippingTotal?: number;
    shippingTaxTotal?: number;
    discountTotal?: number;
    grandTotal: number;
    customerId?: number | null;
    variationId?: number | null;
    createdAtDaysAgo?: number;
}

/**
 * Create a counted order directly with explicit totals + one line item, skipping the cart/state
 * machine so report-math tests control every figure. Status defaults to `processing` (counted).
 */
async function makeCountedOrder(spec: OrderSpec): Promise<Order> {
    const qty = spec.quantity ?? 1;
    const order = await Order.create({
        orderNumber: await nextOrderNumber(),
        status: spec.status ?? OrderStatus.Processing,
        customerId: spec.customerId ?? null,
        currency: "IRR",
        currencyDisplay: "IRT",
        pricesIncludeTax: true,
        createdVia: "checkout",
        itemsTotal: spec.itemsTotal,
        taxTotal: spec.taxTotal ?? 0,
        shippingTotal: spec.shippingTotal ?? 0,
        shippingTaxTotal: spec.shippingTaxTotal ?? 0,
        discountTotal: spec.discountTotal ?? 0,
        grandTotal: spec.grandTotal,
    });
    await OrderLineItem.create({
        orderId: order.id,
        productId: spec.productId,
        variationId: spec.variationId ?? null,
        nameSnapshot: "Test product",
        skuSnapshot: "SKU",
        quantity: qty,
        priceSnapshot: Math.round(spec.lineSubtotal / qty),
        subtotal: spec.lineSubtotal,
        subtotalTax: 0,
        total: spec.itemsTotal,
        totalTax: spec.taxTotal ?? 0,
        taxClassIdSnapshot: null,
        attributesSnapshot: {},
    });
    if (spec.createdAtDaysAgo !== undefined) {
        await Order.query()
            .where("id", Number(order.id))
            .update({ created_at: DateTime.utc().minus({ days: spec.createdAtDaysAgo }).toSQL({ includeOffset: false }) });
    }
    return order;
}

/** Wide window that brackets "now" so freshly-created orders land inside it. */
function window() {
    return {
        date_from: DateTime.utc().minus({ days: 7 }).toISODate()!,
        date_to: DateTime.utc().plus({ days: 1 }).toISO()!,
    };
}

test.group("GET /api/v1/admin/reports/sales-stats", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
        await cache.clear();
    });

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/reports/sales-stats").qs(window());
        response.assertStatus(401);
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await plainUser();
        const response = await client.get("/api/v1/admin/reports/sales-stats").qs(window()).withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("net sales excludes tax + shipping; total sales is all-in", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        /** items 100,000 + tax 9,000 + shipping 5,000 (1,000 of which is shipping tax) → grand 114,000. */
        await makeCountedOrder({
            productId: Number(product.id),
            lineSubtotal: 100_000,
            itemsTotal: 100_000,
            taxTotal: 9_000,
            shippingTotal: 5_000,
            shippingTaxTotal: 1_000,
            grandTotal: 114_000,
        });

        const response = await client.get("/api/v1/admin/reports/sales-stats").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as { totals: Record<string, number> };
        assert.equal(body.totals.gross_sales, 100_000);
        assert.equal(body.totals.taxes, 9_000);
        assert.equal(body.totals.shipping, 5_000);
        assert.equal(body.totals.total_sales, 114_000);
        assert.equal(body.totals.net_sales, 100_000);
        assert.equal(body.totals.order_tax, 8_000);
        assert.equal(body.totals.shipping_tax, 1_000);
        assert.equal(body.totals.orders, 1);
        assert.equal(body.totals.items_sold, 1);
        assert.equal(body.totals.avg_order_value, 100_000);
    });

    test("coupons reduce net sales; gross stays pre-discount", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        /** subtotal 100,000, 20,000 coupon → items_total 80,000, grand 80,000. */
        const order = await makeCountedOrder({
            productId: Number(product.id),
            lineSubtotal: 100_000,
            itemsTotal: 80_000,
            discountTotal: 20_000,
            grandTotal: 80_000,
        });
        await db.table("order_coupon_lines").insert({ order_id: Number(order.id), coupon_id: null, code_snapshot: "SAVE20", discount: 20_000, discount_tax: 0 });

        const response = await client.get("/api/v1/admin/reports/sales-stats").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { totals: Record<string, number> };
        assert.equal(body.totals.gross_sales, 100_000);
        assert.equal(body.totals.coupons, 20_000);
        assert.equal(body.totals.net_sales, 80_000);
    });

    test("refunds subtract from net + total via returns", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000 });
        await db.table("order_refunds").insert({ order_id: Number(order.id), refund_number: await nextRefundNumber(), amount_minor: 30_000, tax_amount_minor: 0 });

        const response = await client.get("/api/v1/admin/reports/sales-stats").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { totals: Record<string, number> };
        assert.equal(body.totals.gross_sales, 100_000);
        assert.equal(body.totals.returns, 30_000);
        assert.equal(body.totals.total_sales, 70_000);
        assert.equal(body.totals.net_sales, 70_000);
    });

    test("excludes draft / pending / cancelled orders", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), status: OrderStatus.Draft, lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), status: OrderStatus.Cancelled, lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000 });

        const response = await client.get("/api/v1/admin/reports/sales-stats").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        const body = response.body() as { totals: Record<string, number> };
        assert.equal(body.totals.orders, 0);
        assert.equal(body.totals.net_sales, 0);
    });

    test("returns a comparison block when compare bounds are supplied", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000 });

        const w = window();
        const response = await client
            .get("/api/v1/admin/reports/sales-stats")
            .qs({ ...w, compare_from: DateTime.utc().minus({ days: 21 }).toISODate()!, compare_to: DateTime.utc().minus({ days: 8 }).toISO()! })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { totals: Record<string, number>; comparison: { totals: Record<string, number> } | null };
        assert.equal(body.totals.net_sales, 100_000);
        assert.isNotNull(body.comparison);
        assert.equal(body.comparison!.totals.net_sales, 0);
    });

    test("422 on an inverted date range", async ({ client }) => {
        const admin = await adminUser();
        const response = await client
            .get("/api/v1/admin/reports/sales-stats")
            .qs({ date_from: DateTime.utc().toISO()!, date_to: DateTime.utc().minus({ days: 5 }).toISO()! })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(422);
    });

    test("cold-miss populates, warm-hit is stable, tag invalidation returns fresh", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000 });
        const w = window();

        const first = await client.get("/api/v1/admin/reports/sales-stats").qs(w).withGuard("api").loginAs(admin);
        first.assertStatus(200);
        assert.equal((first.body() as { totals: { net_sales: number } }).totals.net_sales, 100_000);

        /** A write the cache layer doesn't know about — the warm hit must still serve the cached value. */
        await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 50_000, itemsTotal: 50_000, grandTotal: 50_000 });
        const warm = await client.get("/api/v1/admin/reports/sales-stats").qs(w).withGuard("api").loginAs(admin);
        assert.equal((warm.body() as { totals: { net_sales: number } }).totals.net_sales, 100_000);

        /** Every order write busts `admin:reports` (see start/events.ts) — simulate that here. */
        await cache.deleteByTag({ tags: [CacheTags.adminReports] });
        const fresh = await client.get("/api/v1/admin/reports/sales-stats").qs(w).withGuard("api").loginAs(admin);
        assert.equal((fresh.body() as { totals: { net_sales: number } }).totals.net_sales, 150_000);
    });
});

test.group("GET /api/v1/admin/reports table endpoints", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
        await cache.clear();
    });

    test("revenue table returns interval rows + window totals footer", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 100_000, itemsTotal: 100_000, taxTotal: 9_000, shippingTotal: 5_000, grandTotal: 114_000 });

        const response = await client.get("/api/v1/admin/reports/revenue").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: Record<string, number>[]; totals: Record<string, number> };
        assert.isAbove(body.data.length, 0);
        assert.equal(body.totals.net_sales, 100_000);
        assert.equal(body.totals.total_sales, 114_000);
        const summed = body.data.reduce((s, r) => s + r.net_sales, 0);
        assert.equal(summed, 100_000);
    });

    test("orders table classifies new vs returning and nets refunds", async ({ client, assert }) => {
        const admin = await adminUser();
        const customer = await Customer.create({ firstName: "Repeat", lastName: "Buyer", countryDefault: "IR", isPayingCustomer: true });
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), customerId: Number(customer.id), lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000, createdAtDaysAgo: 3 });
        const second = await makeCountedOrder({ productId: Number(product.id), customerId: Number(customer.id), lineSubtotal: 100_000, itemsTotal: 100_000, grandTotal: 100_000, createdAtDaysAgo: 1 });
        await db.table("order_refunds").insert({ order_id: Number(second.id), refund_number: await nextRefundNumber(), amount_minor: 40_000, tax_amount_minor: 0 });

        const response = await client.get("/api/v1/admin/reports/orders").qs({ ...window(), order_by: "date", order_dir: "asc" }).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { customer_type: string; net_sales: number; is_refunded: boolean }[] };
        assert.equal(body.data.length, 2);
        assert.equal(body.data[0]!.customer_type, "new");
        assert.equal(body.data[1]!.customer_type, "returning");
        assert.equal(body.data[1]!.net_sales, 60_000);
        assert.isTrue(body.data[1]!.is_refunded);
    });

    test("products table aggregates per product with stock context", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        await makeCountedOrder({ productId: Number(product.id), quantity: 3, lineSubtotal: 300_000, itemsTotal: 300_000, grandTotal: 300_000 });

        const response = await client.get("/api/v1/admin/reports/products").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { product_id: number; items_sold: number; net_sales: number; stock: number | null }[] };
        const row = body.data.find((r) => r.product_id === Number(product.id));
        assert.exists(row);
        assert.equal(row!.items_sold, 3);
        assert.equal(row!.net_sales, 300_000);
        assert.equal(row!.stock, 100);
    });

    test("coupons table groups by code with amount discounted", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 100_000, itemsTotal: 85_000, discountTotal: 15_000, grandTotal: 85_000 });
        await db.table("order_coupon_lines").insert({ order_id: Number(order.id), coupon_id: null, code_snapshot: "WELCOME", discount: 15_000, discount_tax: 0 });

        const response = await client.get("/api/v1/admin/reports/coupons").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { code: string; orders: number; amount: number }[] };
        const row = body.data.find((r) => r.code === "WELCOME");
        assert.exists(row);
        assert.equal(row!.orders, 1);
        assert.equal(row!.amount, 15_000);
    });

    test("taxes table groups by rate code", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const order = await makeCountedOrder({ productId: Number(product.id), lineSubtotal: 100_000, itemsTotal: 100_000, taxTotal: 9_000, grandTotal: 109_000 });
        await db.table("order_tax_lines").insert({
            order_id: Number(order.id),
            tax_rate_id_snapshot: null,
            rate_code_snapshot: "VAT-9",
            label_snapshot: "VAT",
            rate_percent_snapshot: 9,
            compound_snapshot: false,
            tax_total: 9_000,
            shipping_tax_total: 0,
        });

        const response = await client.get("/api/v1/admin/reports/taxes").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { code: string; total_tax: number; orders: number }[] };
        const row = body.data.find((r) => r.code === "VAT-9");
        assert.exists(row);
        assert.equal(row!.total_tax, 9_000);
        assert.equal(row!.orders, 1);
    });

    test("categories table rolls up through the category pivot", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const catResult = (await db.table("product_categories").insert({ display: "default", menu_order: 0 }).returning("id")) as Array<{ id: number } | number>;
        const categoryId = typeof catResult[0] === "object" ? Number((catResult[0] as { id: number }).id) : Number(catResult[0]);
        await db.table("product_category_translations").insert({ category_id: categoryId, locale: "fa", name: "صنایع دستی", slug: `cat-${categoryId}`, description: null });
        await db.table("product_category_links").insert({ product_id: Number(product.id), category_id: categoryId });
        await makeCountedOrder({ productId: Number(product.id), quantity: 2, lineSubtotal: 200_000, itemsTotal: 200_000, grandTotal: 200_000 });

        const response = await client.get("/api/v1/admin/reports/categories").qs(window()).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { category_id: number; items_sold: number; orders: number }[] };
        const row = body.data.find((r) => r.category_id === categoryId);
        assert.exists(row);
        assert.equal(row!.items_sold, 2);
        assert.equal(row!.orders, 1);
    });
});

test.group("GET /api/v1/admin/reports/stock", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
        await cache.clear();
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await plainUser();
        const response = await client.get("/api/v1/admin/reports/stock").withGuard("api").loginAs(user);
        response.assertStatus(403);
    });

    test("lists inventory with footer counts and respects the status filter", async ({ client, assert }) => {
        const admin = await adminUser();
        await createTaxableProduct({ regularPrice: 100_000, stockStatus: "instock" });
        await createTaxableProduct({ regularPrice: 100_000, stockStatus: "outofstock" });

        const all = await client.get("/api/v1/admin/reports/stock").withGuard("api").loginAs(admin);
        all.assertStatus(200);
        all.assertAgainstApiSpec();
        const body = all.body() as { data: unknown[]; counts: Record<string, number> };
        assert.equal(body.counts.total, 2);
        assert.equal(body.counts.instock, 1);
        assert.equal(body.counts.outofstock, 1);

        const outOnly = await client.get("/api/v1/admin/reports/stock").qs({ status: "outofstock" }).withGuard("api").loginAs(admin);
        outOnly.assertStatus(200);
        const outBody = outOnly.body() as { data: { status: string }[] };
        assert.equal(outBody.data.length, 1);
        assert.equal(outBody.data[0]!.status, "outofstock");
    });
});

test.group("GET /api/v1/admin/reports/top-categories", (group) => {
    group.each.setup(async () => {
        await resetWithPhase07();
        await cache.clear();
    });

    test("ranks categories by units sold", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 100_000 });
        const catResult = (await db.table("product_categories").insert({ display: "default", menu_order: 0 }).returning("id")) as Array<{ id: number } | number>;
        const categoryId = typeof catResult[0] === "object" ? Number((catResult[0] as { id: number }).id) : Number(catResult[0]);
        await db.table("product_category_translations").insert({ category_id: categoryId, locale: "fa", name: "صنایع دستی", slug: `cat-${categoryId}`, description: null });
        await db.table("product_category_links").insert({ product_id: Number(product.id), category_id: categoryId });
        await makeCountedOrder({ productId: Number(product.id), quantity: 4, lineSubtotal: 400_000, itemsTotal: 400_000, grandTotal: 400_000 });

        const response = await client.get("/api/v1/admin/reports/top-categories").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        const body = response.body() as { data: { category_id: number; units: number }[] };
        assert.equal(body.data[0]!.category_id, categoryId);
        assert.equal(body.data[0]!.units, 4);
    });
});
