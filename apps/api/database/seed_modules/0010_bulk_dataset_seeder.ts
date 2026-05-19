import hash from "@adonisjs/core/services/hash";
import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { faker } from "@faker-js/faker";
import { faker as fakerEn } from "@faker-js/faker/locale/en";
import { faker as fakerFa } from "@faker-js/faker/locale/fa";
import { DateTime } from "luxon";

import { slugify } from "#services/slug_service";

const BATCH = 500;

/**
 * Email suffix that tags every user inserted by this seeder. Used as the idempotency marker on
 * subsequent runs and as the deletion scope for `--reset`. Demo seeders use `@calibra.dev`, so the
 * two datasets never collide.
 */
const BULK_EMAIL_DOMAIN = "@bulk.calibra.dev";

/**
 * SKU prefix that tags every product inserted by this seeder. Demo SKUs use uppercase 3-letter
 * codes (PHN-001, etc.) so the two datasets never collide.
 */
const BULK_SKU_PREFIX = "BULK-";

/**
 * Shared bcrypt-equivalent (scrypt) hash for the seeded users. Hashing is expensive (~30–100ms on
 * the dev container) so we do it once and reuse the string for every insert.
 */
const SHARED_PASSWORD = "Passw0rd1!";

/**
 * Optional knobs for callers. The `db:bulk-seed` ace command surfaces these as CLI flags.
 */
export interface BulkSeederOptions {
    products?: number;
    users?: number;
    orders?: number;
    reset?: boolean;
}

/**
 * Realistic Iranian e-commerce dataset generator. Produces:
 *
 *   - `users` users (≈99.5% `customer`, ≈0.5% `admin`) tagged with `@bulk.calibra.dev`
 *   - one `customers` row per user, 1–3 addresses each, IR profile + valid `national_id`
 *     checksum on ~70% of customers
 *   - `products` products tagged with `BULK-` SKU prefix, ~80% simple / ~18% variable /
 *     ~2% grouped, status mix ~85% publish / ~10% draft / ~5% pending, ~30–40% on sale, 1–4
 *     images per product (picsum URLs keyed off the slug), `fa`+`en` translations, 1–3 category
 *     links and a ~50% brand link, one `inventory_items` row per simple product and per variation
 *   - ~`orders` orders distributed across the customers with realistic status, internally
 *     consistent totals (subtotal + shipping + tax − discount = grand_total), 1–8 line items
 *     each, spread across the last 18 months
 *   - ~3,000 product reviews tied to completed orders so `verified` is meaningful
 *
 * Idempotent — re-running with no flags changes zero rows. Use `--reset` to wipe just the bulk
 * dataset (the demo seeders' `@calibra.dev` users and non-`BULK-` products are untouched).
 *
 * Performance target: full default run (10k products / 1k users / 5k orders) completes in under
 * 90 seconds on a developer laptop against the docker-compose Postgres. Inserts go through
 * `multiInsert` in batches of {@link BATCH} rows.
 */
export default class BulkDatasetSeeder extends BaseSeeder {
    private options: Required<BulkSeederOptions> = {
        products: 10_000,
        users: 1_000,
        orders: 5_000,
        reset: false,
    };

    setOptions(options: BulkSeederOptions): this {
        this.options = { ...this.options, ...options };
        return this;
    }

    async run() {
        faker.seed(42);
        fakerFa.seed(42);
        fakerEn.seed(42);

        const totals = this.options;

        if (totals.reset) await this.reset();

        const now = DateTime.utc().toSQL();

        const categoryIds = await this.loadDemoCategoryIds();
        const brandIds = await this.loadDemoBrandIds();
        if (categoryIds.length === 0) {
            console.warn("No categories found — run `node ace db:seed` first to load the demo catalog scaffolding.");
            return;
        }
        const tagIds = await this.ensureBulkTags(now);

        /**
         * Idempotency check. Each section inserts only the delta between its current bulk count
         * and the target. A second run with the same targets produces zero new rows.
         */
        const existing = await this.countExistingBulk();
        console.log(
            `Current bulk dataset: users=${existing.users}, products=${existing.products}, orders=${existing.orders}, reviews=${existing.reviews}`,
        );

        const usersNeeded = Math.max(0, totals.users - existing.users);
        const productsNeeded = Math.max(0, totals.products - existing.products);
        const ordersNeeded = Math.max(0, totals.orders - existing.orders);

        if (usersNeeded === 0 && productsNeeded === 0 && ordersNeeded === 0) {
            console.log("Bulk dataset already at or above target — nothing to insert. Pass --reset to start over.");
            return;
        }

        const passwordHash = usersNeeded > 0 ? await hash.use("scrypt").make(SHARED_PASSWORD) : "";

        if (usersNeeded > 0) {
            console.time("[bulk-seed] users + customers");
            const customerInserted = await this.seedUsersAndCustomers(usersNeeded, passwordHash, now);
            console.timeEnd("[bulk-seed] users + customers");
            console.log(`Inserted ${customerInserted.users} users + ${customerInserted.customers} customers`);
        }

        if (productsNeeded > 0) {
            console.time("[bulk-seed] products + translations + images + inventory");
            const productInserted = await this.seedProducts(productsNeeded, categoryIds, brandIds, tagIds, now);
            console.timeEnd("[bulk-seed] products + translations + images + inventory");
            console.log(
                `Inserted ${productInserted.products} products (${productInserted.variations} variations) + ${productInserted.translations} translations + ${productInserted.images} images + ${productInserted.inventory} inventory rows + ${productInserted.tagLinks} tag links`,
            );
        }

        if (ordersNeeded > 0) {
            console.time("[bulk-seed] orders + line items + status history");
            const orderInserted = await this.seedOrders(ordersNeeded, now);
            console.timeEnd("[bulk-seed] orders + line items + status history");
            console.log(
                `Inserted ${orderInserted.orders} orders + ${orderInserted.lineItems} line items + ${orderInserted.history} history rows`,
            );
        }

        if (existing.reviews < 3_000 && ordersNeeded > 0) {
            console.time("[bulk-seed] reviews");
            const reviewInserted = await this.seedReviews(3_000 - existing.reviews, now);
            console.timeEnd("[bulk-seed] reviews");
            console.log(`Inserted ${reviewInserted} reviews`);
        }
    }

    private async countExistingBulk(): Promise<{ users: number; products: number; orders: number; reviews: number }> {
        const usersRow = (await this.client
            .from("users")
            .where("email", "like", `%${BULK_EMAIL_DOMAIN}`)
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        const productsRow = (await this.client
            .from("products")
            .where("sku", "like", `${BULK_SKU_PREFIX}%`)
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        const ordersRow = (await this.client
            .from("orders")
            .leftJoin("customers", "customers.id", "orders.customer_id")
            .leftJoin("users", "users.id", "customers.user_id")
            .where("users.email", "like", `%${BULK_EMAIL_DOMAIN}`)
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        const reviewsRow = (await this.client
            .from("product_reviews")
            .leftJoin("products", "products.id", "product_reviews.product_id")
            .where("products.sku", "like", `${BULK_SKU_PREFIX}%`)
            .count("* as count")
            .first()) as { count: string | number } | undefined;
        return {
            users: Number(usersRow?.count ?? 0),
            products: Number(productsRow?.count ?? 0),
            orders: Number(ordersRow?.count ?? 0),
            reviews: Number(reviewsRow?.count ?? 0),
        };
    }

    /**
     * Drops the bulk dataset in FK-safe order. Only rows tagged with the bulk markers are
     * affected — the demo seeders' rows are untouched.
     */
    private async reset(): Promise<void> {
        console.log("Resetting bulk dataset (rows tagged BULK-*  / @bulk.calibra.dev)…");

        const bulkUserIds = (await this.client.from("users").select("id").where("email", "like", `%${BULK_EMAIL_DOMAIN}`)).map(
            (r: { id: number | string }) => Number(r.id),
        );

        const bulkCustomerIds = (
            await this.client
                .from("customers")
                .select("id")
                .whereIn("user_id", bulkUserIds.length === 0 ? [-1] : bulkUserIds)
        ).map((r: { id: number | string }) => Number(r.id));

        const bulkOrderIds = (
            await this.client
                .from("orders")
                .select("id")
                .whereIn("customer_id", bulkCustomerIds.length === 0 ? [-1] : bulkCustomerIds)
        ).map((r: { id: number | string }) => Number(r.id));

        const bulkProductIds = (await this.client.from("products").select("id").where("sku", "like", `${BULK_SKU_PREFIX}%`)).map(
            (r: { id: number | string }) => Number(r.id),
        );

        const ordersFilter = bulkOrderIds.length === 0 ? [-1] : bulkOrderIds;
        const productsFilter = bulkProductIds.length === 0 ? [-1] : bulkProductIds;
        const customersFilter = bulkCustomerIds.length === 0 ? [-1] : bulkCustomerIds;
        const usersFilter = bulkUserIds.length === 0 ? [-1] : bulkUserIds;

        await this.client
            .from("order_line_item_taxes")
            .whereIn("line_item_id", this.client.from("order_line_items").select("id").whereIn("order_id", ordersFilter))
            .delete();
        await this.client.from("order_line_items").whereIn("order_id", ordersFilter).delete();
        await this.client.from("order_tax_lines").whereIn("order_id", ordersFilter).delete();
        await this.client.from("order_shipping_lines").whereIn("order_id", ordersFilter).delete();
        await this.client.from("order_coupon_lines").whereIn("order_id", ordersFilter).delete();
        await this.client.from("order_status_history").whereIn("order_id", ordersFilter).delete();
        await this.client.from("order_addresses").whereIn("order_id", ordersFilter).delete();
        await this.client.from("orders").whereIn("id", ordersFilter).delete();

        await this.client.from("product_reviews").whereIn("product_id", productsFilter).delete();

        await this.client.from("inventory_items").whereIn("product_id", productsFilter).delete();
        await this.client.from("product_translations").whereIn("product_id", productsFilter).delete();
        await this.client.from("product_images").whereIn("product_id", productsFilter).delete();
        await this.client.from("product_variations").whereIn("product_id", productsFilter).delete();
        await this.client.from("product_category_links").whereIn("product_id", productsFilter).delete();
        await this.client.from("product_brand_links").whereIn("product_id", productsFilter).delete();
        await this.client.from("product_tag_links").whereIn("product_id", productsFilter).delete();
        await this.client.from("products").whereIn("id", productsFilter).delete();

        await this.client.from("customer_addresses").whereIn("customer_id", customersFilter).delete();
        await this.client.from("customer_iran_profiles").whereIn("customer_id", customersFilter).delete();
        await this.client.from("customers").whereIn("id", customersFilter).delete();
        await this.client.from("users").whereIn("id", usersFilter).delete();

        console.log(
            `Reset removed ${bulkOrderIds.length} orders, ${bulkProductIds.length} products, ${bulkCustomerIds.length} customers, ${bulkUserIds.length} users.`,
        );
    }

    private async loadDemoCategoryIds(): Promise<number[]> {
        const rows = await this.client.from("product_categories").select("id");
        return rows.map((r: { id: number | string }) => Number(r.id));
    }

    private async loadDemoBrandIds(): Promise<number[]> {
        const rows = await this.client.from("product_brands").select("id");
        return rows.map((r: { id: number | string }) => Number(r.id));
    }

    /**
     * The base seeders don't ship product tags — the bulk seeder owns the tag taxonomy. Creates
     * the fixed {@link BULK_TAGS} list once and returns the ids; reused on subsequent runs via
     * the unique `(locale, slug)` constraint on `product_tag_translations`.
     */
    private async ensureBulkTags(now: string): Promise<number[]> {
        const existingTranslations = await this.client
            .from("product_tag_translations")
            .select(["tag_id", "slug"])
            .where("locale", "en")
            .whereIn(
                "slug",
                BULK_TAGS.map((t) => t.slugEn),
            );
        const slugToId = new Map<string, number>();
        for (const r of existingTranslations) slugToId.set(String(r.slug), Number(r.tag_id));

        const ids: number[] = [];
        for (let i = 0; i < BULK_TAGS.length; i += 1) {
            const t = BULK_TAGS[i]!;
            const existingId = slugToId.get(t.slugEn);
            if (existingId !== undefined) {
                ids.push(existingId);
                continue;
            }
            const [{ id: newId }] = await this.client
                .table("product_tags")
                .returning("id")
                .insert({ menu_order: i + 1, attributes: {}, created_at: now, updated_at: now });
            const tagId = Number(newId);
            ids.push(tagId);
            await this.client.table("product_tag_translations").insert([
                { tag_id: tagId, locale: "fa", name: t.fa, slug: t.slugFa, created_at: now, updated_at: now },
                { tag_id: tagId, locale: "en", name: t.en, slug: t.slugEn, created_at: now, updated_at: now },
            ]);
        }
        return ids;
    }

    private async seedUsersAndCustomers(
        target: number,
        passwordHash: string,
        now: string,
    ): Promise<{ users: number; customers: number }> {
        const existingEmails = new Set<string>(
            (await this.client.from("users").select("email").where("email", "like", `%${BULK_EMAIL_DOMAIN}`)).map(
                (r: { email: string }) => String(r.email).toLowerCase(),
            ),
        );

        const userRows: Array<Record<string, unknown>> = [];
        for (let i = 0; i < target; i += 1) {
            const email = uniqueBulkEmail(existingEmails, i);
            const role = i < Math.max(1, Math.floor(target * 0.005)) ? "admin" : "customer";
            userRows.push({
                email,
                password_hash: passwordHash,
                role,
                locale: "fa",
                created_at: now,
                updated_at: now,
            });
        }
        if (userRows.length === 0) return { users: 0, customers: 0 };

        const ensureAdminEmail = "admin@bulk.calibra.dev";
        if (!existingEmails.has(ensureAdminEmail) && !userRows.some((r) => r.email === ensureAdminEmail)) {
            userRows.unshift({
                email: ensureAdminEmail,
                password_hash: passwordHash,
                role: "admin",
                locale: "fa",
                created_at: now,
                updated_at: now,
            });
        }

        const insertedUsers: Array<{ id: number; email: string }> = [];
        for (const chunk of chunked(userRows, BATCH)) {
            const rows = await this.client.table("users").returning(["id", "email"]).insert(chunk);
            for (const r of rows) insertedUsers.push({ id: Number(r.id), email: String(r.email) });
        }

        const customerRows = insertedUsers.map((u) => {
            const ir = faker.datatype.boolean({ probability: 0.7 });
            return {
                user_id: u.id,
                first_name: ir ? fakerFa.person.firstName() : fakerEn.person.firstName(),
                last_name: ir ? fakerFa.person.lastName() : fakerEn.person.lastName(),
                phone: ir ? randomIranianPhone() : faker.phone.number({ style: "international" }),
                country_default: ir ? "IR" : faker.helpers.arrayElement(["US", "DE", "TR", "AE"]),
                is_paying_customer: faker.datatype.boolean({ probability: 0.6 }),
                attributes: {},
                created_at: now,
                updated_at: now,
            };
        });

        const insertedCustomers: Array<{ id: number; user_id: number; country: string }> = [];
        for (const chunk of chunked(customerRows, BATCH)) {
            const rows = await this.client.table("customers").returning(["id", "user_id", "country_default"]).insert(chunk);
            for (const r of rows) {
                insertedCustomers.push({ id: Number(r.id), user_id: Number(r.user_id), country: String(r.country_default) });
            }
        }

        const iranProfiles: Array<Record<string, unknown>> = [];
        const addresses: Array<Record<string, unknown>> = [];
        for (const c of insertedCustomers) {
            if (c.country === "IR") {
                iranProfiles.push({
                    customer_id: c.id,
                    national_id: randomValidIranianNationalId(),
                    attributes: {},
                    created_at: now,
                    updated_at: now,
                });
            }
            const addressCount = faker.number.int({ min: 1, max: 3 });
            for (let i = 0; i < addressCount; i += 1) {
                const isIr = c.country === "IR";
                addresses.push({
                    customer_id: c.id,
                    kind: faker.helpers.arrayElement(["billing", "shipping", "both"]),
                    label: `address-${i + 1}`,
                    first_name: isIr ? fakerFa.person.firstName() : fakerEn.person.firstName(),
                    last_name: isIr ? fakerFa.person.lastName() : fakerEn.person.lastName(),
                    address_line_1: isIr ? randomIranianStreet() : faker.location.streetAddress(),
                    city: isIr ? faker.helpers.arrayElement(IRANIAN_CITIES) : faker.location.city(),
                    postcode: isIr ? randomIranianPostcode() : faker.location.zipCode(),
                    country: c.country,
                    phone: isIr ? randomIranianPhone() : faker.phone.number({ style: "international" }),
                    is_default: i === 0,
                    region_text: isIr ? null : faker.location.state(),
                    attributes: {},
                    created_at: now,
                    updated_at: now,
                });
            }
        }

        for (const chunk of chunked(iranProfiles, BATCH)) {
            await this.client.table("customer_iran_profiles").insert(chunk);
        }
        for (const chunk of chunked(addresses, BATCH)) {
            await this.client.table("customer_addresses").insert(chunk);
        }

        return { users: insertedUsers.length, customers: insertedCustomers.length };
    }

    private async seedProducts(
        target: number,
        categoryIds: number[],
        brandIds: number[],
        tagIds: number[],
        now: string,
    ): Promise<{
        products: number;
        variations: number;
        translations: number;
        images: number;
        inventory: number;
        tagLinks: number;
    }> {
        const existingSkus = new Set<string>(
            (await this.client.from("products").select("sku").where("sku", "like", `${BULK_SKU_PREFIX}%`)).map(
                (r: { sku: string }) => String(r.sku),
            ),
        );
        const existingProductSlugsEn = new Set<string>(
            (await this.client.from("product_translations").select("slug").where("locale", "en")).map((r: { slug: string }) =>
                String(r.slug),
            ),
        );

        const productSpecs: Array<{
            sku: string;
            type: "simple" | "variable" | "grouped";
            status: "publish" | "draft" | "pending";
            regular_price: number;
            sale_price: number | null;
            featured: boolean;
            name_fa: string;
            name_en: string;
            slug_fa: string;
            slug_en: string;
            short_fa: string;
            short_en: string;
            description_fa: string;
            description_en: string;
            categoryIds: number[];
            brandId: number | null;
            tagIds: number[];
            variations: Array<{ sku: string; regular_price: number; sale_price: number | null }>;
        }> = [];

        for (let i = 0; i < target; i += 1) {
            const sku = uniqueBulkSku(existingSkus, i);

            const typeRoll = faker.number.float({ min: 0, max: 1 });
            const type: "simple" | "variable" | "grouped" = typeRoll < 0.8 ? "simple" : typeRoll < 0.98 ? "variable" : "grouped";

            const statusRoll = faker.number.float({ min: 0, max: 1 });
            const status: "publish" | "draft" | "pending" =
                statusRoll < 0.85 ? "publish" : statusRoll < 0.95 ? "draft" : "pending";

            const regular = faker.number.int({ min: 200_000, max: 50_000_000 });
            const sale =
                faker.datatype.boolean({ probability: 0.35 }) && regular > 500_000
                    ? Math.floor(regular * faker.number.float({ min: 0.5, max: 0.95 }))
                    : null;

            const nameFa = randomPersianProductName();
            const nameEn = faker.commerce.productName();

            const slugFa = uniqueSlug(existingProductSlugsEn, slugify(`${nameFa}-${sku}`, "fa"));
            const slugEn = uniqueSlug(existingProductSlugsEn, slugify(`${nameEn}-${sku}`, "en"));

            const categoryChoiceCount = faker.number.int({ min: 1, max: 3 });
            const chosenCategoryIds = faker.helpers.arrayElements(categoryIds, categoryChoiceCount);

            const brandChosen =
                brandIds.length > 0 && faker.datatype.boolean({ probability: 0.5 }) ? faker.helpers.arrayElement(brandIds) : null;

            const chosenTagIds =
                tagIds.length > 0 && faker.datatype.boolean({ probability: 0.7 })
                    ? faker.helpers.arrayElements(tagIds, faker.number.int({ min: 1, max: Math.min(3, tagIds.length) }))
                    : [];

            const variations: Array<{ sku: string; regular_price: number; sale_price: number | null }> = [];
            if (type === "variable") {
                const variationCount = faker.number.int({ min: 2, max: 6 });
                for (let v = 0; v < variationCount; v += 1) {
                    const vPrice = Math.floor(regular * faker.number.float({ min: 0.9, max: 1.2 }));
                    variations.push({
                        sku: `${sku}-V${v + 1}`,
                        regular_price: vPrice,
                        sale_price: sale ? Math.floor(vPrice * 0.9) : null,
                    });
                }
            }

            productSpecs.push({
                sku,
                type,
                status,
                regular_price: regular,
                sale_price: sale,
                featured: faker.datatype.boolean({ probability: 0.05 }),
                name_fa: nameFa,
                name_en: nameEn,
                slug_fa: slugFa,
                slug_en: slugEn,
                short_fa: fakerFa.lorem.sentence({ min: 4, max: 8 }),
                short_en: fakerEn.lorem.sentence({ min: 4, max: 8 }),
                description_fa: fakerFa.lorem.paragraphs(2, "\n\n"),
                description_en: fakerEn.lorem.paragraphs(2, "\n\n"),
                categoryIds: chosenCategoryIds,
                brandId: brandChosen,
                tagIds: chosenTagIds,
                variations,
            });
        }

        const productRows = productSpecs.map((p) => ({
            type: p.type,
            sku: p.sku,
            status: p.status,
            catalog_visibility: "visible",
            featured: p.featured,
            virtual: false,
            downloadable: false,
            regular_price: p.regular_price,
            sale_price: p.sale_price,
            tax_status: "taxable",
            sold_individually: false,
            reviews_allowed: true,
            menu_order: 0,
            attributes: {},
            created_at: now,
            updated_at: now,
        }));

        const insertedProductIds: number[] = [];
        for (const chunk of chunked(productRows, BATCH)) {
            const rows = await this.client.table("products").returning("id").insert(chunk);
            for (const r of rows) insertedProductIds.push(Number(r.id));
        }

        let translationsCount = 0;
        let imagesCount = 0;
        let inventoryCount = 0;
        let variationsCount = 0;

        const translationRows: Array<Record<string, unknown>> = [];
        const imageMediaRows: Array<Record<string, unknown>> = [];
        const categoryLinkRows: Array<Record<string, unknown>> = [];
        const brandLinkRows: Array<Record<string, unknown>> = [];
        const tagLinkRows: Array<Record<string, unknown>> = [];
        const variationRows: Array<Record<string, unknown>> = [];
        const inventoryRows: Array<Record<string, unknown>> = [];
        const productImageLinks: Array<{ product_id: number; slug: string; image_count: number; alt: string }> = [];

        for (let i = 0; i < productSpecs.length; i += 1) {
            const spec = productSpecs[i]!;
            const productId = insertedProductIds[i]!;

            translationRows.push(
                {
                    product_id: productId,
                    locale: "fa",
                    name: spec.name_fa,
                    slug: spec.slug_fa,
                    description: spec.description_fa,
                    short_description: spec.short_fa,
                    created_at: now,
                    updated_at: now,
                },
                {
                    product_id: productId,
                    locale: "en",
                    name: spec.name_en,
                    slug: spec.slug_en,
                    description: spec.description_en,
                    short_description: spec.short_en,
                    created_at: now,
                    updated_at: now,
                },
            );

            for (const categoryId of spec.categoryIds) {
                categoryLinkRows.push({
                    product_id: productId,
                    category_id: categoryId,
                    created_at: now,
                    updated_at: now,
                });
            }
            if (spec.brandId !== null) {
                brandLinkRows.push({
                    product_id: productId,
                    brand_id: spec.brandId,
                    created_at: now,
                    updated_at: now,
                });
            }
            for (const tagId of spec.tagIds) {
                tagLinkRows.push({
                    product_id: productId,
                    tag_id: tagId,
                    created_at: now,
                    updated_at: now,
                });
            }

            const imageCount = faker.number.int({ min: 1, max: 4 });
            productImageLinks.push({ product_id: productId, slug: spec.slug_en, image_count: imageCount, alt: spec.name_en });

            if (spec.type === "simple" || spec.type === "grouped") {
                inventoryRows.push({
                    product_id: productId,
                    variation_id: null,
                    location_id: null,
                    stock_quantity: faker.number.int({ min: 0, max: 250 }),
                    manage_stock: true,
                    backorders: "no",
                    stock_status: faker.helpers.arrayElement(["instock", "instock", "instock", "outofstock"]),
                    created_at: now,
                    updated_at: now,
                });
            }

            if (spec.type === "variable") {
                for (const v of spec.variations) {
                    variationRows.push({
                        product_id: productId,
                        sku: v.sku,
                        regular_price: v.regular_price,
                        sale_price: v.sale_price,
                        virtual: false,
                        downloadable: false,
                        manage_stock_mode: "own",
                        menu_order: 0,
                        attributes: {},
                        created_at: now,
                        updated_at: now,
                    });
                }
            }
        }

        for (const chunk of chunked(translationRows, BATCH)) {
            await this.client.table("product_translations").insert(chunk);
            translationsCount += chunk.length;
        }
        for (const chunk of chunked(categoryLinkRows, BATCH)) {
            await this.client.table("product_category_links").insert(chunk);
        }
        for (const chunk of chunked(brandLinkRows, BATCH)) {
            await this.client.table("product_brand_links").insert(chunk);
        }
        for (const chunk of chunked(tagLinkRows, BATCH)) {
            await this.client.table("product_tag_links").insert(chunk);
        }

        const insertedVariationIdsByProduct = new Map<number, number[]>();
        if (variationRows.length > 0) {
            for (const chunk of chunked(variationRows, BATCH)) {
                const inserted = await this.client.table("product_variations").returning(["id", "product_id"]).insert(chunk);
                for (const r of inserted) {
                    const pid = Number(r.product_id);
                    const arr = insertedVariationIdsByProduct.get(pid) ?? [];
                    arr.push(Number(r.id));
                    insertedVariationIdsByProduct.set(pid, arr);
                }
            }
            variationsCount = variationRows.length;

            const variationInventoryRows: Array<Record<string, unknown>> = [];
            for (const [pid, variationIds] of insertedVariationIdsByProduct.entries()) {
                for (const vid of variationIds) {
                    variationInventoryRows.push({
                        product_id: pid,
                        variation_id: vid,
                        location_id: null,
                        stock_quantity: faker.number.int({ min: 0, max: 100 }),
                        manage_stock: true,
                        backorders: "no",
                        stock_status: faker.helpers.arrayElement(["instock", "instock", "instock", "outofstock"]),
                        created_at: now,
                        updated_at: now,
                    });
                }
            }
            for (const chunk of chunked(variationInventoryRows, BATCH)) {
                await this.client.table("inventory_items").insert(chunk);
            }
            inventoryCount += variationInventoryRows.length;
        }

        for (const chunk of chunked(inventoryRows, BATCH)) {
            await this.client.table("inventory_items").insert(chunk);
        }
        inventoryCount += inventoryRows.length;

        const mediaRows: Array<Record<string, unknown>> = [];
        for (const link of productImageLinks) {
            for (let n = 0; n < link.image_count; n += 1) {
                mediaRows.push({
                    kind: "image",
                    url: `https://picsum.photos/seed/${link.slug}-${n}/600/600`,
                    mime: "image/jpeg",
                    width: 600,
                    height: 600,
                    alt: link.alt,
                    attributes: {},
                    created_at: now,
                    updated_at: now,
                });
            }
        }
        const insertedMediaIds: number[] = [];
        for (const chunk of chunked(mediaRows, BATCH)) {
            const inserted = await this.client.table("media").returning("id").insert(chunk);
            for (const r of inserted) insertedMediaIds.push(Number(r.id));
        }

        let mediaCursor = 0;
        for (const link of productImageLinks) {
            for (let n = 0; n < link.image_count; n += 1) {
                const mediaId = insertedMediaIds[mediaCursor++];
                if (mediaId === undefined) break;
                imageMediaRows.push({
                    product_id: link.product_id,
                    media_id: mediaId,
                    position: n,
                    created_at: now,
                    updated_at: now,
                });
            }
        }
        for (const chunk of chunked(imageMediaRows, BATCH)) {
            await this.client.table("product_images").insert(chunk);
            imagesCount += chunk.length;
        }

        return {
            products: insertedProductIds.length,
            variations: variationsCount,
            translations: translationsCount,
            images: imagesCount,
            inventory: inventoryCount,
            tagLinks: tagLinkRows.length,
        };
    }

    private async seedOrders(target: number, now: string): Promise<{ orders: number; lineItems: number; history: number }> {
        const bulkCustomers = await this.client
            .from("customers")
            .select(["customers.id as id", "customers.user_id as user_id", "users.email as email"])
            .leftJoin("users", "users.id", "customers.user_id")
            .where("users.email", "like", `%${BULK_EMAIL_DOMAIN}`);

        if (bulkCustomers.length === 0) {
            console.warn("No bulk customers found; skipping orders.");
            return { orders: 0, lineItems: 0, history: 0 };
        }

        const productPool = await this.client
            .from("products")
            .select(["id", "sku", "regular_price"])
            .where("sku", "like", `${BULK_SKU_PREFIX}%`)
            .where("status", "publish")
            .limit(2_000);

        if (productPool.length === 0) {
            console.warn("No bulk products with status=publish; skipping orders.");
            return { orders: 0, lineItems: 0, history: 0 };
        }

        const maxOrderNumberRow = (await this.client.from("orders").max("order_number as max").first()) as
            | { max: string | number | null }
            | undefined;
        const orderNumberBase = Math.max(100_000, Number(maxOrderNumberRow?.max ?? 0) + 1);

        const nameTranslations: Map<number, string> = new Map();
        for (const chunk of chunked(productPool, 500)) {
            const ids = chunk.map((p: { id: number | string }) => Number(p.id));
            const rows = await this.client
                .from("product_translations")
                .select(["product_id", "name"])
                .whereIn("product_id", ids)
                .where("locale", "fa");
            for (const r of rows) nameTranslations.set(Number(r.product_id), String(r.name));
        }

        const startWindow = DateTime.utc().minus({ months: 18 });
        const endWindow = DateTime.utc();

        const orderRows: Array<Record<string, unknown>> = [];
        const orderLineSpecs: Array<{
            orderIndex: number;
            productId: number;
            sku: string;
            name: string;
            quantity: number;
            price: number;
            subtotal: number;
            total: number;
        }> = [];
        const orderAddressSpecs: Array<{ orderIndex: number; kind: "billing" | "shipping"; row: Record<string, unknown> }> = [];

        const statuses: Array<{ s: string; p: number }> = [
            { s: "completed", p: 0.6 },
            { s: "processing", p: 0.2 },
            { s: "pending", p: 0.08 },
            { s: "on_hold", p: 0.05 },
            { s: "cancelled", p: 0.05 },
            { s: "refunded", p: 0.02 },
        ];

        for (let i = 0; i < target; i += 1) {
            const customer = faker.helpers.arrayElement(bulkCustomers) as { id: number; user_id: number; email: string };
            const status = weightedPick(statuses);
            const createdAt = faker.date.between({
                from: startWindow.toJSDate(),
                to: endWindow.toJSDate(),
            });
            const createdIso = createdAt.toISOString();
            const isCompleted = status === "completed" || status === "refunded";
            const isPaid = isCompleted || status === "processing";

            const lineCount = faker.number.int({ min: 1, max: 8 });
            let itemsTotal = 0;
            const lineSpecs: typeof orderLineSpecs = [];
            for (let li = 0; li < lineCount; li += 1) {
                const product = faker.helpers.arrayElement(productPool) as { id: number; sku: string; regular_price: number };
                const qty = faker.number.int({ min: 1, max: 4 });
                const price = Number(product.regular_price);
                const subtotal = price * qty;
                itemsTotal += subtotal;
                lineSpecs.push({
                    orderIndex: i,
                    productId: Number(product.id),
                    sku: String(product.sku),
                    name: nameTranslations.get(Number(product.id)) ?? `Product ${product.id}`,
                    quantity: qty,
                    price,
                    subtotal,
                    total: subtotal,
                });
            }

            const shippingTotal = faker.helpers.arrayElement([0, 250_000, 500_000, 750_000]);
            const discountTotal =
                faker.datatype.boolean({ probability: 0.15 }) && itemsTotal > 1_000_000
                    ? Math.floor(itemsTotal * faker.number.float({ min: 0.05, max: 0.2 }))
                    : 0;
            const taxTotal = Math.floor((itemsTotal - discountTotal + shippingTotal) * 0.09);
            const grandTotal = itemsTotal + shippingTotal + taxTotal - discountTotal;

            orderRows.push({
                customer_id: customer.id,
                order_number: orderNumberBase + i,
                order_key: `wc_bulk_${i}_${faker.string.alphanumeric({ length: 8 })}`,
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
                discount_total: discountTotal,
                discount_tax_total: 0,
                tax_total: taxTotal,
                grand_total: grandTotal,
                payment_method_code_snapshot: faker.helpers.arrayElement(["bank_transfer", "zarinpal", "cod"]),
                payment_method_title_snapshot: faker.helpers.arrayElement(["انتقال بانکی", "زرین‌پال", "پرداخت در محل"]),
                date_paid_at: isPaid ? createdIso : null,
                date_completed_at: isCompleted ? createdIso : null,
                attributes: { bulk_seed: true },
                created_at: createdIso,
                updated_at: createdIso,
            });

            for (const ls of lineSpecs) orderLineSpecs.push(ls);

            const billing = {
                kind: "billing" as const,
                first_name: fakerFa.person.firstName(),
                last_name: fakerFa.person.lastName(),
                address_line_1: randomIranianStreet(),
                city: faker.helpers.arrayElement(IRANIAN_CITIES),
                postcode: randomIranianPostcode(),
                country: "IR",
                email: customer.email,
                phone: randomIranianPhone(),
                attributes: {},
                created_at: createdIso,
                updated_at: createdIso,
            };
            orderAddressSpecs.push({ orderIndex: i, kind: "billing", row: billing });
            orderAddressSpecs.push({
                orderIndex: i,
                kind: "shipping",
                row: { ...billing, kind: "shipping" as const },
            });
        }

        const insertedOrderIds: number[] = [];
        for (const chunk of chunked(orderRows, BATCH)) {
            const inserted = await this.client.table("orders").returning("id").insert(chunk);
            for (const r of inserted) insertedOrderIds.push(Number(r.id));
        }

        const lineRows = orderLineSpecs.map((ls) => ({
            order_id: insertedOrderIds[ls.orderIndex]!,
            product_id: ls.productId,
            variation_id: null,
            name_snapshot: ls.name,
            sku_snapshot: ls.sku,
            quantity: ls.quantity,
            price_snapshot: ls.price,
            subtotal: ls.subtotal,
            subtotal_tax: 0,
            total: ls.total,
            total_tax: 0,
            attributes_snapshot: {},
            created_at: now,
            updated_at: now,
        }));

        let lineCount = 0;
        for (const chunk of chunked(lineRows, BATCH)) {
            await this.client.table("order_line_items").insert(chunk);
            lineCount += chunk.length;
        }

        const addressRows = orderAddressSpecs.map((spec) => ({
            ...spec.row,
            order_id: insertedOrderIds[spec.orderIndex]!,
        }));
        for (const chunk of chunked(addressRows, BATCH)) {
            await this.client.table("order_addresses").insert(chunk);
        }

        const historyRows: Array<Record<string, unknown>> = [];
        for (let i = 0; i < insertedOrderIds.length; i += 1) {
            const orderId = insertedOrderIds[i]!;
            const order = orderRows[i]!;
            historyRows.push({
                order_id: orderId,
                from_status: null,
                to_status: "pending",
                occurred_at: order.created_at,
                reason: "Order created",
                created_at: order.created_at,
                updated_at: order.created_at,
            });
            if (order.status !== "pending") {
                historyRows.push({
                    order_id: orderId,
                    from_status: "pending",
                    to_status: order.status,
                    occurred_at: order.created_at,
                    reason: null,
                    created_at: order.created_at,
                    updated_at: order.created_at,
                });
            }
        }
        let historyCount = 0;
        for (const chunk of chunked(historyRows, BATCH)) {
            await this.client.table("order_status_history").insert(chunk);
            historyCount += chunk.length;
        }

        return { orders: insertedOrderIds.length, lineItems: lineCount, history: historyCount };
    }

    private async seedReviews(targetCount: number, now: string): Promise<number> {
        const completedOrders = await this.client
            .from("orders")
            .select(["customers.id as customer_id", "order_line_items.product_id as product_id"])
            .leftJoin("customers", "customers.id", "orders.customer_id")
            .leftJoin("users", "users.id", "customers.user_id")
            .leftJoin("order_line_items", "order_line_items.order_id", "orders.id")
            .where("users.email", "like", `%${BULK_EMAIL_DOMAIN}`)
            .where("orders.status", "completed")
            .whereNotNull("order_line_items.product_id")
            .limit(8_000);

        if (completedOrders.length === 0) return 0;

        const target = Math.min(targetCount, completedOrders.length);
        const reviewRows: Array<Record<string, unknown>> = [];
        for (let i = 0; i < target; i += 1) {
            const row = faker.helpers.arrayElement(completedOrders) as { customer_id: number; product_id: number };
            const ratingRoll = faker.number.float({ min: 0, max: 1 });
            const rating = ratingRoll < 0.7 ? faker.number.int({ min: 4, max: 5 }) : faker.number.int({ min: 1, max: 3 });
            reviewRows.push({
                product_id: row.product_id,
                customer_id: row.customer_id,
                reviewer_name: fakerFa.person.fullName(),
                reviewer_email: faker.internet.email().toLowerCase(),
                rating,
                body: faker.helpers.arrayElement(PERSIAN_REVIEW_SAMPLES),
                status: "approved",
                verified: true,
                created_at: now,
                updated_at: now,
            });
        }

        let count = 0;
        for (const chunk of chunked(reviewRows, BATCH)) {
            await this.client.table("product_reviews").insert(chunk);
            count += chunk.length;
        }
        return count;
    }
}

/**
 * Split an array into fixed-size chunks. Stays as a generator so we never hold both the input and
 * the slices in memory at once.
 */
function* chunked<T>(items: T[], size: number): Iterable<T[]> {
    for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

function uniqueBulkEmail(existing: Set<string>, index: number): string {
    const base = `bulk-${faker.string.alphanumeric({ length: 8, casing: "lower" })}-${index}`;
    let candidate = `${base}${BULK_EMAIL_DOMAIN}`;
    let suffix = 0;
    while (existing.has(candidate)) {
        suffix += 1;
        candidate = `${base}-${suffix}${BULK_EMAIL_DOMAIN}`;
    }
    existing.add(candidate);
    return candidate;
}

function uniqueBulkSku(existing: Set<string>, index: number): string {
    const hash = faker.string.alphanumeric({ length: 4, casing: "upper" });
    let candidate = `${BULK_SKU_PREFIX}${String(index + 1).padStart(6, "0")}-${hash}`;
    let suffix = 0;
    while (existing.has(candidate)) {
        suffix += 1;
        candidate = `${BULK_SKU_PREFIX}${String(index + 1).padStart(6, "0")}-${hash}${suffix}`;
    }
    existing.add(candidate);
    return candidate;
}

function uniqueSlug(existing: Set<string>, base: string): string {
    let candidate = base;
    let suffix = 0;
    while (existing.has(candidate)) {
        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
    existing.add(candidate);
    return candidate;
}

function weightedPick(buckets: Array<{ s: string; p: number }>): string {
    const roll = faker.number.float({ min: 0, max: 1 });
    let acc = 0;
    for (const b of buckets) {
        acc += b.p;
        if (roll < acc) return b.s;
    }
    return buckets[buckets.length - 1]!.s;
}

/**
 * Iranian national ID — generates a 10-digit ID with a valid checksum. Mirrors the algorithm in
 * `NationalIdService.validate`.
 */
function randomValidIranianNationalId(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const digits: number[] = [];
        for (let i = 0; i < 9; i += 1) digits.push(faker.number.int({ min: 0, max: 9 }));
        if (digits.every((d) => d === digits[0])) continue;
        const sum = digits.reduce((acc, d, i) => acc + d * (10 - i), 0);
        const remainder = sum % 11;
        const check = remainder < 2 ? remainder : 11 - remainder;
        digits.push(check);
        const id = digits.join("");
        if (!/^(\d)\1{9}$/.test(id)) return id;
    }
    return "1234567891";
}

function randomIranianPhone(): string {
    return `+989${faker.string.numeric({ length: 9 })}`;
}

function randomIranianPostcode(): string {
    return faker.string.numeric({ length: 10 });
}

function randomIranianStreet(): string {
    const street = faker.helpers.arrayElement(IRANIAN_STREETS);
    const plate = faker.number.int({ min: 1, max: 200 });
    return `${street}، پلاک ${plate}`;
}

function randomPersianProductName(): string {
    const noun = faker.helpers.arrayElement(PERSIAN_PRODUCT_NOUNS);
    const adjective = faker.helpers.arrayElement(PERSIAN_PRODUCT_ADJECTIVES);
    const code = faker.string.alphanumeric({ length: 3, casing: "upper" });
    return `${noun} ${adjective} مدل ${code}`;
}

const IRANIAN_CITIES = [
    "تهران",
    "مشهد",
    "اصفهان",
    "شیراز",
    "تبریز",
    "کرج",
    "اهواز",
    "قم",
    "کرمانشاه",
    "ارومیه",
    "رشت",
    "زاهدان",
    "همدان",
    "کرمان",
    "یزد",
    "اردبیل",
    "بندرعباس",
    "اراک",
    "اسلامشهر",
    "زنجان",
];

const IRANIAN_STREETS = [
    "خیابان آزادی",
    "خیابان ولیعصر",
    "خیابان انقلاب",
    "خیابان فردوسی",
    "خیابان شریعتی",
    "خیابان جمهوری",
    "بلوار کشاورز",
    "خیابان سعدی",
    "بلوار میرداماد",
    "خیابان طالقانی",
    "خیابان مطهری",
    "بلوار کاوه",
];

const PERSIAN_PRODUCT_NOUNS = [
    "گوشی",
    "لپ‌تاپ",
    "ساعت",
    "کیف",
    "کفش",
    "کوله",
    "تلویزیون",
    "هدفون",
    "بلندگو",
    "تبلت",
    "دوربین",
    "مانیتور",
    "صندلی",
    "میز",
    "چراغ",
    "تابه",
    "قابلمه",
    "پیراهن",
    "شلوار",
    "ژاکت",
    "کاپشن",
    "عینک",
    "کتاب",
    "عطر",
    "کرم",
    "شامپو",
    "فرش",
    "پتو",
    "بالش",
    "تشک",
];

const PERSIAN_PRODUCT_ADJECTIVES = [
    "هوشمند",
    "حرفه‌ای",
    "کلاسیک",
    "مدرن",
    "سنتی",
    "دست‌ساز",
    "اقتصادی",
    "لوکس",
    "اسپرت",
    "رسمی",
    "خانگی",
    "اداری",
    "تابستانی",
    "زمستانی",
    "بچگانه",
    "زنانه",
    "مردانه",
];

const PERSIAN_REVIEW_SAMPLES = [
    "کیفیت محصول عالی بود و در سریع‌ترین زمان به دستم رسید.",
    "بسته‌بندی بسیار شیک و دقیق، بازم ازتون خرید می‌کنم.",
    "جنس کالا با تصویر سایت کاملا مطابقت داشت.",
    "قیمت نسبت به کیفیت منصفانه است، پیشنهاد می‌کنم.",
    "ارسال سریع بود اما بسته‌بندی می‌توانست بهتر باشد.",
    "خیلی راضی هستم، ممنون از فروشنده.",
    "محصول عالی، ارزش خرید را دارد.",
    "نسبت به قیمت قابل قبول است.",
    "از کیفیت دوخت/ساخت رضایت داشتم.",
    "تجربه خرید خوبی بود، تشکر می‌کنم.",
    "محصول دقیقا همانی بود که در سایت نمایش داده شده بود.",
    "خیلی خوب بود، فقط رنگ کمی متفاوت با تصویر سایت بود.",
    "بسیار سریع رسید، تشکر از تیم ارسال.",
    "کیفیت بسته‌بندی متوسط بود ولی کالا سالم رسید.",
    "ارزشش رو داره، حتما دوباره خرید می‌کنم.",
    "از سرویس پشتیبانی هم راضی بودم.",
];

/**
 * Tag taxonomy owned by the bulk seeder. The base demo seeders only ship categories + brands; tags
 * are a bulk-only concern. Keyed by `(locale, slug)` for idempotent upserts.
 */
const BULK_TAGS: Array<{ fa: string; en: string; slugFa: string; slugEn: string }> = [
    { fa: "جدید", en: "New Arrival", slugFa: "tag-new-arrival", slugEn: "tag-new-arrival" },
    { fa: "پرفروش", en: "Bestseller", slugFa: "tag-bestseller", slugEn: "tag-bestseller" },
    { fa: "تخفیف ویژه", en: "Special Offer", slugFa: "tag-special-offer", slugEn: "tag-special-offer" },
    { fa: "محدود", en: "Limited Edition", slugFa: "tag-limited-edition", slugEn: "tag-limited-edition" },
    { fa: "اقتصادی", en: "Budget", slugFa: "tag-budget", slugEn: "tag-budget" },
    { fa: "لوکس", en: "Premium", slugFa: "tag-premium", slugEn: "tag-premium" },
    { fa: "هدیه", en: "Gift", slugFa: "tag-gift", slugEn: "tag-gift" },
    { fa: "ایرانی", en: "Made in Iran", slugFa: "tag-made-in-iran", slugEn: "tag-made-in-iran" },
    { fa: "وارداتی", en: "Imported", slugFa: "tag-imported", slugEn: "tag-imported" },
    { fa: "ارگانیک", en: "Organic", slugFa: "tag-organic", slugEn: "tag-organic" },
    { fa: "حرفه‌ای", en: "Professional", slugFa: "tag-professional", slugEn: "tag-professional" },
    { fa: "خانگی", en: "Home Use", slugFa: "tag-home-use", slugEn: "tag-home-use" },
];
