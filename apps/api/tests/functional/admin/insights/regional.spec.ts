import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import { UserFactory } from "#factories/user_factory";
import Customer from "#models/customer";
import Order from "#models/order";
import OrderAddress from "#models/order_address";
import OrderLineItem from "#models/order_line_item";
import Region from "#models/region";
import IranCitiesSeeder from "#database/seed_modules/0011_iran_cities_seeder";
import { OrderStatus } from "#enums/order_status";
import { createTaxableProduct } from "#tests/helpers/cart";
import { resetPhase05 } from "#tests/helpers/orders";

interface OrderSeed {
    regionCode: string;
    grandTotal: number;
    status?: OrderStatus.Processing | OrderStatus.Completed;
    createdAt?: DateTime;
    city?: string;
    productId?: number | null;
    productName?: string;
    productSku?: string | null;
    units?: number;
}

async function adminUser() {
    const admin = await UserFactory.apply("admin").create();
    await Customer.create({
        userId: admin.id,
        firstName: "Admin",
        lastName: "User",
        countryDefault: "IR",
        isPayingCustomer: false,
    });
    return admin;
}

async function plainUser() {
    const user = await UserFactory.create();
    await Customer.create({
        userId: user.id,
        firstName: "Plain",
        lastName: "User",
        countryDefault: "IR",
        isPayingCustomer: true,
    });
    return user;
}

async function seedRegionsAndCities() {
    await new IranCitiesSeeder(db.connection()).run();
}

async function regionId(code: string): Promise<number> {
    const region = await Region.findByOrFail("code", code);
    return Number(region.id);
}

async function seedOrder(args: OrderSeed): Promise<Order> {
    const province = await regionId(args.regionCode);
    const order = await Order.create({
        orderNumber: await nextOrderNumber(),
        status: args.status ?? OrderStatus.Completed,
        currency: "IRR",
        currencyDisplay: "IRT",
        pricesIncludeTax: true,
        createdVia: "checkout",
        paymentGatewayIdSnapshot: 1,
        paymentMethodCodeSnapshot: "cod",
        paymentMethodTitleSnapshot: "cod",
        itemsTotal: args.grandTotal,
        grandTotal: args.grandTotal,
    });
    if (args.createdAt) {
        order.createdAt = args.createdAt;
        await order.save();
    }
    await OrderAddress.create({
        orderId: order.id,
        kind: "shipping",
        firstName: "Test",
        lastName: "Shipping",
        addressLine1: "1 Test St",
        city: args.city ?? "Tehran",
        regionId: province,
        country: "IR",
    });
    if (args.productId !== null && args.productId !== undefined) {
        await OrderLineItem.create({
            orderId: order.id,
            productId: args.productId,
            variationId: null,
            nameSnapshot: args.productName ?? "Probe Product",
            skuSnapshot: args.productSku ?? "PROBE-1",
            quantity: args.units ?? 1,
            priceSnapshot: args.grandTotal,
            subtotal: args.grandTotal,
            subtotalTax: 0,
            total: args.grandTotal,
            totalTax: 0,
            taxClassIdSnapshot: null,
            attributesSnapshot: {},
        });
    }
    return order;
}

async function nextOrderNumber(): Promise<number> {
    const result = (await db.rawQuery("SELECT nextval('order_number_seq') as next")) as {
        rows?: Array<{ next: unknown }>;
    };
    return Number(result.rows?.[0]?.next ?? 0);
}

test.group("GET /api/v1/admin/insights/regional/provinces", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
        await seedRegionsAndCities();
    });

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/insights/regional/provinces");
        response.assertStatus(401);
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await plainUser();
        const response = await client
            .get("/api/v1/admin/insights/regional/provinces")
            .withGuard("api")
            .loginAs(user);
        response.assertStatus(403);
    });

    test("returns 31 province rows even when there are zero orders", async ({ client, assert }) => {
        const admin = await adminUser();
        const response = await client
            .get("/api/v1/admin/insights/regional/provinces")
            .withGuard("api")
            .loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: Array<{ code: string; orders_count: number; revenue_minor: string; name: { fa: string; en: string } }>;
            meta: { totals: { orders_count: number; revenue_minor: string } };
        };

        assert.lengthOf(body.data, 31);
        assert.equal(body.meta.totals.orders_count, 0);
        assert.equal(body.meta.totals.revenue_minor, "0");
        for (const row of body.data) {
            assert.match(row.code, /^IR-(0[1-9]|[12][0-9]|3[01])$/);
            assert.equal(row.orders_count, 0);
        }
        const tehran = body.data.find((r) => r.code === "IR-24");
        assert.exists(tehran);
        assert.equal(tehran?.name.en, "Tehran");
    });

    test("totals equal the sum of row contributions", async ({ client, assert }) => {
        const admin = await adminUser();
        await seedOrder({ regionCode: "IR-24", grandTotal: 1_000_000 });
        await seedOrder({ regionCode: "IR-08", grandTotal: 500_000 });
        await seedOrder({ regionCode: "IR-24", grandTotal: 250_000 });

        const response = await client
            .get("/api/v1/admin/insights/regional/provinces")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: Array<{ code: string; orders_count: number; revenue_minor: string }>;
            meta: { totals: { orders_count: number; revenue_minor: string } };
        };

        const sumOrders = body.data.reduce((acc, r) => acc + r.orders_count, 0);
        const sumRevenue = body.data.reduce((acc, r) => acc + BigInt(r.revenue_minor), 0n);

        assert.equal(sumOrders, body.meta.totals.orders_count);
        assert.equal(sumRevenue.toString(), body.meta.totals.revenue_minor);
        const tehran = body.data.find((r) => r.code === "IR-24");
        assert.equal(tehran?.orders_count, 2);
        assert.equal(tehran?.revenue_minor, "1250000");
    });

    test("honours the from/to window — orders outside the window do not contribute", async ({ client, assert }) => {
        const admin = await adminUser();
        await seedOrder({ regionCode: "IR-24", grandTotal: 1_000_000, createdAt: DateTime.utc().minus({ days: 5 }) });
        await seedOrder({ regionCode: "IR-24", grandTotal: 999_000, createdAt: DateTime.utc().minus({ days: 90 }) });

        const from = DateTime.utc().minus({ days: 30 }).toISO();
        const to = DateTime.utc().toISO();
        const response = await client
            .get(`/api/v1/admin/insights/regional/provinces?from=${encodeURIComponent(from!)}&to=${encodeURIComponent(to!)}`)
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: Array<{ code: string; orders_count: number; revenue_minor: string }>;
        };
        const tehran = body.data.find((r) => r.code === "IR-24");
        assert.equal(tehran?.orders_count, 1);
        assert.equal(tehran?.revenue_minor, "1000000");
    });
});

test.group("GET /api/v1/admin/insights/regional/provinces/:code", (group) => {
    group.each.setup(async () => {
        await resetPhase05();
        await seedRegionsAndCities();
    });

    test("rejects unauthenticated requests with 401", async ({ client }) => {
        const response = await client.get("/api/v1/admin/insights/regional/provinces/IR-24");
        response.assertStatus(401);
    });

    test("rejects non-admin sessions with 403", async ({ client }) => {
        const user = await plainUser();
        const response = await client
            .get("/api/v1/admin/insights/regional/provinces/IR-24")
            .withGuard("api")
            .loginAs(user);
        response.assertStatus(403);
    });

    test("returns 422 for a malformed code", async ({ client }) => {
        const admin = await adminUser();
        const response = await client
            .get("/api/v1/admin/insights/regional/provinces/IR-99")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(422);
    });

    test("returns the province detail payload, capped top_products + cities", async ({ client, assert }) => {
        const admin = await adminUser();
        const productA = await createTaxableProduct({ regularPrice: 500_000 });
        const productB = await createTaxableProduct({ regularPrice: 500_000 });

        await seedOrder({
            regionCode: "IR-24",
            grandTotal: 1_000_000,
            city: "تهران",
            productId: Number(productA.id),
            productName: "Probe Product 1",
            productSku: "P1",
            units: 2,
        });
        await seedOrder({
            regionCode: "IR-24",
            grandTotal: 500_000,
            city: "تهران",
            productId: Number(productB.id),
            productName: "Probe Product 2",
            productSku: "P2",
            units: 1,
        });
        await seedOrder({ regionCode: "IR-24", grandTotal: 200_000, city: "ری" });

        const response = await client
            .get("/api/v1/admin/insights/regional/provinces/IR-24?top_products=1")
            .withGuard("api")
            .loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: {
                code: string;
                orders_count: number;
                revenue_minor: string;
                top_products: Array<{ product_id: number }>;
                cities: Array<{ region_code: string | null; name: { fa: string; en: string | null }; orders_count: number; matched: boolean }>;
            };
        };

        assert.equal(body.data.code, "IR-24");
        assert.equal(body.data.orders_count, 3);
        assert.lengthOf(body.data.top_products, 1);
        assert.isAtLeast(body.data.cities.length, 1);

        const tehranCity = body.data.cities.find((c) => c.matched && c.name.fa === "تهران");
        assert.exists(tehranCity, "Tehran city row should be matched against seeded city region");
        assert.match(tehranCity!.region_code!, /^IR-24-\d{3}$/);

        const reyCity = body.data.cities.find((c) => c.matched && c.name.fa === "ری");
        assert.exists(reyCity, "Rey city row should be matched against seeded city region");
    });

    test("buckets snapshot text into seeded cities via normalizeIranText (yeh/kaf folding)", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();

        await seedOrder({ regionCode: "IR-31", grandTotal: 100, city: "كرج" });
        await seedOrder({ regionCode: "IR-31", grandTotal: 100, city: "کرج" });
        await seedOrder({ regionCode: "IR-31", grandTotal: 100, city: "شهر کرج" });

        const response = await client
            .get("/api/v1/admin/insights/regional/provinces/IR-31")
            .withGuard("api")
            .loginAs(admin);

        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: { cities: Array<{ region_code: string | null; name: { fa: string }; orders_count: number; matched: boolean }> };
        };
        const karaj = body.data.cities.find((c) => c.matched && c.name.fa === "کرج");
        assert.exists(karaj, "All three snapshot variants should collapse into the seeded Karaj row");
        assert.equal(karaj?.orders_count, 3);
    });

    test("surfaces unmatched city snapshot text with matched=false and a null region_code", async ({
        client,
        assert,
    }) => {
        const admin = await adminUser();
        await seedOrder({ regionCode: "IR-24", grandTotal: 100, city: "اسپانیا-آباد" });

        const response = await client
            .get("/api/v1/admin/insights/regional/provinces/IR-24")
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();

        const body = response.body() as {
            data: { cities: Array<{ region_code: string | null; matched: boolean; name: { fa: string } }> };
        };
        const fallback = body.data.cities.find((c) => !c.matched);
        assert.exists(fallback, "Unmatched city should appear with matched=false");
        assert.isNull(fallback!.region_code);
    });
});
