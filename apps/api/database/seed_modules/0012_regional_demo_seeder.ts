import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";

interface CustomerRow {
    id: string | number;
    user_id: string | number;
    email: string | null;
}

interface ProductRow {
    id: string | number;
    sku: string;
    regular_price: string | number;
    name: string | null;
}

interface RegionRow {
    id: string | number;
    code: string;
}

interface CityRow {
    region_id: string | number;
    code: string;
    name: string;
    province_id: string | number;
}

/**
 * Demo data for the regional insights map widget — distributes ~300 trailing-30-day orders across
 * Iran's 31 provinces using a Tehran-heavy Zipf-like weighting (matches the shape Iranian
 * e-commerce dashboards actually see). Shipping addresses always carry a `region_id` pointing at
 * the province and a `city` string sampled from the seeded city translations, so the regional
 * controller's province + city aggregation has interesting data to show.
 *
 * Idempotent — only inserts when fewer than {@link TARGET_ORDERS} demo orders exist; rerunning
 * the seeder is a no-op. Pass `--reset` to the seed command to wipe + re-seed via
 * `MainSeeder` → bulk seeder.
 *
 * Lives under `database/seed_modules/` so Lucid only runs it when `MainSeeder` imports it
 * explicitly.
 */
export default class RegionalDemoSeeder extends BaseSeeder {
    private readonly TARGET_ORDERS = 300;
    private readonly DEMO_TAG = "regional_demo";

    /**
     * Tehran-heavy Zipf-like weights. Sums to ~100 (relative). Provinces not listed are sampled
     * uniformly from the remaining tail (~32% pooled, divided across the other 22).
     */
    private readonly WEIGHTS: ReadonlyArray<{ code: string; weight: number }> = [
        { code: "IR-24", weight: 25 },
        { code: "IR-31", weight: 8 },
        { code: "IR-11", weight: 7 },
        { code: "IR-08", weight: 6 },
        { code: "IR-10", weight: 6 },
        { code: "IR-04", weight: 5 },
        { code: "IR-09", weight: 4 },
        { code: "IR-26", weight: 4 },
        { code: "IR-23", weight: 3 },
    ];

    async run() {
        const existing = (await this.client
            .from("orders")
            .where("attributes", "@>", `{"${this.DEMO_TAG}": true}`)
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        const existingCount = Number(existing?.count ?? 0);
        if (existingCount >= this.TARGET_ORDERS) {
            console.log(`Regional demo orders already at target (${existingCount}). Skipping.`);
            return;
        }
        const toInsert = this.TARGET_ORDERS - existingCount;

        const provinces = (await this.client
            .from("regions")
            .select(["id", "code"])
            .where("country_code", "IR")
            .whereNull("parent_id")) as RegionRow[];

        const provinceById = new Map<string, RegionRow>();
        for (const p of provinces) provinceById.set(p.code, p);

        const provinceIds = provinces.map((p) => p.id);
        const cityRows = (await this.client
            .from("region_translations as t")
            .innerJoin("regions as c", "c.id", "t.region_id")
            .whereIn("c.parent_id", provinceIds)
            .where("t.locale", "fa")
            .select([
                "t.region_id",
                "c.code",
                "t.name",
                "c.parent_id as province_id",
            ])) as CityRow[];

        const citiesByProvince = new Map<string, CityRow[]>();
        for (const city of cityRows) {
            const province = provinces.find((p) => String(p.id) === String(city.province_id));
            if (!province) continue;
            const list = citiesByProvince.get(province.code) ?? [];
            list.push(city);
            citiesByProvince.set(province.code, list);
        }

        const customers = (await this.client
            .from("customers")
            .select(["customers.id as id", "customers.user_id as user_id", "users.email as email"])
            .leftJoin("users", "users.id", "customers.user_id")
            .limit(100)) as CustomerRow[];
        if (customers.length === 0) {
            console.warn("No customers available — run bulk seeder first. Skipping regional demo.");
            return;
        }

        const products = (await this.client
            .from("products as p")
            .leftJoin("product_translations as pt", function () {
                this.on("pt.product_id", "=", "p.id").andOnVal("pt.locale", "=", "fa");
            })
            .select(["p.id", "p.sku", "p.regular_price", "pt.name"])
            .where("p.status", "publish")
            .limit(200)) as ProductRow[];
        if (products.length === 0) {
            console.warn("No published products — run bulk seeder first. Skipping regional demo.");
            return;
        }

        const maxOrderRow = (await this.client.from("orders").max("order_number as max").first()) as
            | { max: string | number | null }
            | undefined;
        const orderNumberBase = Math.max(900_000, Number(maxOrderRow?.max ?? 0) + 1);

        const provincePool: string[] = [];
        const explicit = new Set(this.WEIGHTS.map((w) => w.code));
        for (const w of this.WEIGHTS) {
            for (let i = 0; i < w.weight; i += 1) provincePool.push(w.code);
        }
        const tailCodes = provinces.map((p) => p.code).filter((c) => !explicit.has(c));
        const tailWeightEach = Math.max(1, Math.floor(32 / Math.max(1, tailCodes.length)));
        for (const code of tailCodes) {
            for (let i = 0; i < tailWeightEach; i += 1) provincePool.push(code);
        }

        const now = DateTime.utc();
        const windowMs = 30 * 24 * 60 * 60 * 1000;

        const orderRows: Array<Record<string, unknown>> = [];
        const lineSpecs: Array<{ orderIndex: number; productId: number; sku: string; name: string; quantity: number; price: number; subtotal: number }> = [];
        const addressSpecs: Array<{ orderIndex: number; row: Record<string, unknown> }> = [];

        for (let i = 0; i < toInsert; i += 1) {
            const provinceCode = provincePool[Math.floor(Math.random() * provincePool.length)]!;
            const province = provinceById.get(provinceCode);
            if (!province) continue;
            const cityList = citiesByProvince.get(provinceCode) ?? [];
            const city = cityList[Math.floor(Math.random() * Math.max(1, cityList.length))];
            const customer = customers[Math.floor(Math.random() * customers.length)]!;

            const status = Math.random() < 0.7 ? OrderStatus.Completed : OrderStatus.Processing;
            const createdAt = new Date(now.toMillis() - Math.random() * windowMs);
            const createdIso = createdAt.toISOString();

            const lineCount = 1 + Math.floor(Math.random() * 3);
            let itemsTotal = 0;
            const orderLines: typeof lineSpecs = [];
            for (let li = 0; li < lineCount; li += 1) {
                const product = products[Math.floor(Math.random() * products.length)]!;
                const qty = 1 + Math.floor(Math.random() * 3);
                const price = Number(product.regular_price);
                const subtotal = price * qty;
                itemsTotal += subtotal;
                orderLines.push({
                    orderIndex: i,
                    productId: Number(product.id),
                    sku: String(product.sku),
                    name: product.name ?? `Product ${product.id}`,
                    quantity: qty,
                    price,
                    subtotal,
                });
            }

            const shippingTotal = [0, 250_000, 500_000][Math.floor(Math.random() * 3)]!;
            const grandTotal = itemsTotal + shippingTotal;

            orderRows.push({
                customer_id: customer.id,
                order_number: orderNumberBase + i,
                order_key: `regional_demo_${i}_${Math.random().toString(36).slice(2, 10)}`,
                status,
                currency: "IRR",
                currency_display: "IRT",
                prices_include_tax: false,
                billing_email: customer.email,
                created_via: "checkout",
                items_total: itemsTotal,
                items_tax_total: 0,
                shipping_total: shippingTotal,
                shipping_tax_total: 0,
                fees_total: 0,
                fees_tax_total: 0,
                discount_total: 0,
                discount_tax_total: 0,
                tax_total: 0,
                grand_total: grandTotal,
                payment_method_code_snapshot: "zarinpal",
                payment_method_title_snapshot: "زرین‌پال",
                date_paid_at: createdIso,
                date_completed_at: status === OrderStatus.Completed ? createdIso : null,
                attributes: { [this.DEMO_TAG]: true },
                created_at: createdIso,
                updated_at: createdIso,
            });
            for (const ls of orderLines) lineSpecs.push(ls);

            addressSpecs.push({
                orderIndex: i,
                row: {
                    kind: "shipping" as const,
                    first_name: "Demo",
                    last_name: "Customer",
                    address_line_1: "1 Demo Ave",
                    city: city?.name ?? "",
                    region_id: province.id,
                    country: "IR",
                    attributes: {},
                    created_at: createdIso,
                    updated_at: createdIso,
                },
            });
        }

        if (orderRows.length === 0) return;

        const insertedIds: number[] = [];
        const BATCH = 200;
        for (let i = 0; i < orderRows.length; i += BATCH) {
            const slice = orderRows.slice(i, i + BATCH);
            const inserted = await this.client.table("orders").returning("id").insert(slice);
            for (const r of inserted) insertedIds.push(Number(r.id));
        }

        const lineRows = lineSpecs.map((ls) => ({
            order_id: insertedIds[ls.orderIndex]!,
            product_id: ls.productId,
            variation_id: null,
            name_snapshot: ls.name,
            sku_snapshot: ls.sku,
            quantity: ls.quantity,
            price_snapshot: ls.price,
            subtotal: ls.subtotal,
            subtotal_tax: 0,
            total: ls.subtotal,
            total_tax: 0,
            attributes_snapshot: {},
            created_at: orderRows[ls.orderIndex]!.created_at,
            updated_at: orderRows[ls.orderIndex]!.created_at,
        }));
        for (let i = 0; i < lineRows.length; i += BATCH) {
            await this.client.table("order_line_items").insert(lineRows.slice(i, i + BATCH));
        }

        const addressRows = addressSpecs.map((spec) => ({
            ...spec.row,
            order_id: insertedIds[spec.orderIndex]!,
        }));
        for (let i = 0; i < addressRows.length; i += BATCH) {
            await this.client.table("order_addresses").insert(addressRows.slice(i, i + BATCH));
        }

        console.log(`Seeded ${insertedIds.length} regional demo orders across ${provinces.length} provinces`);
    }
}
