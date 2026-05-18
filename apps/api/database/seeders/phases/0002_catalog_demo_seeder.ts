import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

import { slugify } from "#services/slug_service";

/**
 * Phase 02 seed data — a realistic Persian e-commerce catalog. Eight categories, four attributes
 * with ~30 terms, five brands, 50 products (35 simple + 15 variable). Variable products get 2–4
 * variations each, plus one inventory row per simple product and per variation. Every translatable
 * entity gets both `fa` and `en` rows. Images point at `https://picsum.photos/seed/<slug>/600/600`
 * placeholders — no actual storage in dev.
 *
 * Idempotent: every write upserts on a stable natural key (product/category/attribute code, or
 * `(parent_id, locale)` for translation tables). Running the seeder twice produces the same
 * database state.
 */
export default class CatalogDemoSeeder extends BaseSeeder {
    static environment = ["__phase_seeder__"];

    async run() {
        const now = DateTime.utc().toSQL();

        const categoryIds = await this.seedCategories(now);
        const brandIds = await this.seedBrands(now);
        const { attributeIdsByCode, termIdsBySlug } = await this.seedAttributesAndTerms(now);
        await this.seedProducts(now, categoryIds, brandIds, attributeIdsByCode, termIdsBySlug);
    }

    private async seedCategories(now: string): Promise<Map<string, number>> {
        const cats = [
            { fa: "پوشاک", en: "Apparel" },
            { fa: "الکترونیک", en: "Electronics" },
            { fa: "خانه و آشپزخانه", en: "Home & Kitchen" },
            { fa: "زیبایی و سلامت", en: "Beauty & Health" },
            { fa: "کتاب", en: "Books" },
            { fa: "ورزش و سفر", en: "Sports & Travel" },
            { fa: "کودک و نوزاد", en: "Kids & Baby" },
            { fa: "خودرو", en: "Automotive" },
        ];
        const slugByEn = new Map<string, number>();
        for (let i = 0; i < cats.length; i += 1) {
            const c = cats[i]!;
            const slugEn = slugify(c.en, "en");
            const slugFa = slugify(c.fa, "fa");
            const existing = await this.client
                .from("product_category_translations")
                .where("locale", "en")
                .where("slug", slugEn)
                .first();
            let id: number;
            if (existing) {
                id = Number(existing.category_id);
                await this.client
                    .from("product_categories")
                    .where("id", id)
                    .update({ menu_order: i + 1, updated_at: now });
            } else {
                const [{ id: insertedId }] = await this.client
                    .table("product_categories")
                    .returning("id")
                    .insert({ display: "default", menu_order: i + 1, attributes: {}, created_at: now, updated_at: now });
                id = Number(insertedId);
            }
            slugByEn.set(c.en, id);
            await this.client
                .table("product_category_translations")
                .insert([
                    { category_id: id, locale: "fa", name: c.fa, slug: slugFa, created_at: now, updated_at: now },
                    { category_id: id, locale: "en", name: c.en, slug: slugEn, created_at: now, updated_at: now },
                ])
                .onConflict(["category_id", "locale"])
                .merge(["name", "slug", "updated_at"]);
        }
        return slugByEn;
    }

    private async seedBrands(now: string): Promise<Map<string, number>> {
        const brands = [
            { fa: "کلیربا", en: "Calibra" },
            { fa: "آذرنوش", en: "Azarnoosh" },
            { fa: "پارسیان", en: "Parsian" },
            { fa: "کاوه", en: "Kaveh" },
            { fa: "زاگرس", en: "Zagros" },
        ];
        const byEn = new Map<string, number>();
        for (let i = 0; i < brands.length; i += 1) {
            const b = brands[i]!;
            const slugEn = slugify(b.en, "en");
            const slugFa = slugify(b.fa, "fa");
            const existing = await this.client
                .from("product_brand_translations")
                .where("locale", "en")
                .where("slug", slugEn)
                .first();
            let id: number;
            if (existing) {
                id = Number(existing.brand_id);
                await this.client
                    .from("product_brands")
                    .where("id", id)
                    .update({ menu_order: i + 1, updated_at: now });
            } else {
                const [{ id: insertedId }] = await this.client
                    .table("product_brands")
                    .returning("id")
                    .insert({ menu_order: i + 1, attributes: {}, created_at: now, updated_at: now });
                id = Number(insertedId);
            }
            byEn.set(b.en, id);
            await this.client
                .table("product_brand_translations")
                .insert([
                    { brand_id: id, locale: "fa", name: b.fa, slug: slugFa, created_at: now, updated_at: now },
                    { brand_id: id, locale: "en", name: b.en, slug: slugEn, created_at: now, updated_at: now },
                ])
                .onConflict(["brand_id", "locale"])
                .merge(["name", "slug", "updated_at"]);
        }
        return byEn;
    }

    private async seedAttributesAndTerms(now: string): Promise<{
        attributeIdsByCode: Map<string, number>;
        termIdsBySlug: Map<string, number>;
    }> {
        const attributes = [
            {
                code: "color",
                fa: "رنگ",
                en: "Color",
                terms: [
                    { fa: "مشکی", en: "Black" },
                    { fa: "سفید", en: "White" },
                    { fa: "قرمز", en: "Red" },
                    { fa: "آبی", en: "Blue" },
                    { fa: "سبز", en: "Green" },
                    { fa: "طوسی", en: "Gray" },
                    { fa: "طلایی", en: "Gold" },
                    { fa: "صورتی", en: "Pink" },
                    { fa: "قهوه‌ای", en: "Brown" },
                    { fa: "بنفش", en: "Purple" },
                ],
            },
            {
                code: "size",
                fa: "سایز",
                en: "Size",
                terms: [
                    { fa: "S", en: "S" },
                    { fa: "M", en: "M" },
                    { fa: "L", en: "L" },
                    { fa: "XL", en: "XL" },
                    { fa: "XXL", en: "XXL" },
                ],
            },
            {
                code: "material",
                fa: "متریال",
                en: "Material",
                terms: [
                    { fa: "پنبه", en: "Cotton" },
                    { fa: "چرم", en: "Leather" },
                    { fa: "فلز", en: "Metal" },
                    { fa: "چوب", en: "Wood" },
                    { fa: "پلاستیک", en: "Plastic" },
                    { fa: "شیشه", en: "Glass" },
                    { fa: "سرامیک", en: "Ceramic" },
                ],
            },
            {
                code: "weight",
                fa: "وزن",
                en: "Weight",
                terms: [
                    { fa: "سبک", en: "Light" },
                    { fa: "متوسط", en: "Medium" },
                    { fa: "سنگین", en: "Heavy" },
                ],
            },
        ];

        const attributeIdsByCode = new Map<string, number>();
        const termIdsBySlug = new Map<string, number>();

        for (const attr of attributes) {
            const existingAttr = await this.client.from("product_attributes").where("code", attr.code).first();
            let attrId: number;
            if (existingAttr) {
                attrId = Number(existingAttr.id);
                await this.client.from("product_attributes").where("id", attrId).update({ updated_at: now });
            } else {
                const [{ id: insertedId }] = await this.client.table("product_attributes").returning("id").insert({
                    code: attr.code,
                    order_by: "menu_order",
                    has_archives: false,
                    attributes: {},
                    created_at: now,
                    updated_at: now,
                });
                attrId = Number(insertedId);
            }
            attributeIdsByCode.set(attr.code, attrId);
            await this.client
                .table("product_attribute_translations")
                .insert([
                    { attribute_id: attrId, locale: "fa", name: attr.fa, created_at: now, updated_at: now },
                    { attribute_id: attrId, locale: "en", name: attr.en, created_at: now, updated_at: now },
                ])
                .onConflict(["attribute_id", "locale"])
                .merge(["name", "updated_at"]);

            for (let i = 0; i < attr.terms.length; i += 1) {
                const term = attr.terms[i]!;
                const slugEn = `${attr.code}-${slugify(term.en, "en")}`;
                const slugFa = `${attr.code}-${slugify(term.fa, "fa")}`;
                const existingTerm = await this.client
                    .from("product_attribute_term_translations")
                    .where("locale", "en")
                    .where("slug", slugEn)
                    .first();
                let termId: number;
                if (existingTerm) {
                    termId = Number(existingTerm.term_id);
                    await this.client
                        .from("product_attribute_terms")
                        .where("id", termId)
                        .update({ menu_order: i + 1, updated_at: now });
                } else {
                    const [{ id: insertedId }] = await this.client
                        .table("product_attribute_terms")
                        .returning("id")
                        .insert({
                            attribute_id: attrId,
                            menu_order: i + 1,
                            attributes: {},
                            created_at: now,
                            updated_at: now,
                        });
                    termId = Number(insertedId);
                }
                termIdsBySlug.set(slugEn, termId);
                await this.client
                    .table("product_attribute_term_translations")
                    .insert([
                        { term_id: termId, locale: "fa", name: term.fa, slug: slugFa, created_at: now, updated_at: now },
                        { term_id: termId, locale: "en", name: term.en, slug: slugEn, created_at: now, updated_at: now },
                    ])
                    .onConflict(["term_id", "locale"])
                    .merge(["name", "slug", "updated_at"]);
            }
        }

        return { attributeIdsByCode, termIdsBySlug };
    }

    private async seedProducts(
        now: string,
        categoryIds: Map<string, number>,
        brandIds: Map<string, number>,
        attributeIdsByCode: Map<string, number>,
        termIdsBySlug: Map<string, number>,
    ): Promise<void> {
        const products = generateDemoProducts();
        for (const p of products) {
            const slugEn = slugify(p.en.name, "en");
            const slugFa = slugify(p.fa.name, "fa");
            const existing = await this.client.from("product_translations").where("locale", "en").where("slug", slugEn).first();
            let productId: number;
            if (existing) {
                productId = Number(existing.product_id);
                await this.client.from("products").where("id", productId).update({
                    type: p.type,
                    regular_price: p.regular_price,
                    sale_price: p.sale_price,
                    featured: p.featured,
                    status: "publish",
                    catalog_visibility: "visible",
                    menu_order: p.menu_order,
                    updated_at: now,
                });
            } else {
                const [{ id: insertedId }] = await this.client.table("products").returning("id").insert({
                    type: p.type,
                    sku: p.sku,
                    status: "publish",
                    catalog_visibility: "visible",
                    featured: p.featured,
                    virtual: false,
                    downloadable: false,
                    regular_price: p.regular_price,
                    sale_price: p.sale_price,
                    tax_status: "taxable",
                    sold_individually: false,
                    reviews_allowed: true,
                    menu_order: p.menu_order,
                    attributes: {},
                    created_at: now,
                    updated_at: now,
                });
                productId = Number(insertedId);
            }
            await this.client
                .table("product_translations")
                .insert([
                    {
                        product_id: productId,
                        locale: "fa",
                        name: p.fa.name,
                        slug: slugFa,
                        description: p.fa.description,
                        short_description: p.fa.short,
                        created_at: now,
                        updated_at: now,
                    },
                    {
                        product_id: productId,
                        locale: "en",
                        name: p.en.name,
                        slug: slugEn,
                        description: p.en.description,
                        short_description: p.en.short,
                        created_at: now,
                        updated_at: now,
                    },
                ])
                .onConflict(["product_id", "locale"])
                .merge(["name", "slug", "description", "short_description", "updated_at"]);

            const categoryId = categoryIds.get(p.category);
            if (categoryId) {
                await this.client
                    .table("product_category_links")
                    .insert({ product_id: productId, category_id: categoryId, created_at: now, updated_at: now })
                    .onConflict(["product_id", "category_id"])
                    .ignore();
            }
            const brandId = brandIds.get(p.brand);
            if (brandId) {
                await this.client
                    .table("product_brand_links")
                    .insert({ product_id: productId, brand_id: brandId, created_at: now, updated_at: now })
                    .onConflict(["product_id", "brand_id"])
                    .ignore();
            }

            const mediaId = await this.ensureMedia(slugEn, p.en.name, now);
            await this.client
                .table("product_images")
                .insert({ product_id: productId, media_id: mediaId, position: 0, created_at: now, updated_at: now })
                .onConflict(["product_id", "position"])
                .merge(["media_id", "updated_at"]);

            await this.upsertInventoryItem(productId, null, p.stock, now);

            if (p.type === "variable") {
                await this.seedVariations(productId, p, attributeIdsByCode, termIdsBySlug, now);
            }
        }
    }

    private async seedVariations(
        productId: number,
        p: DemoProduct,
        attributeIdsByCode: Map<string, number>,
        termIdsBySlug: Map<string, number>,
        now: string,
    ): Promise<void> {
        if (!p.variations) return;
        const attributesUsed = new Set<string>();
        for (const v of p.variations) for (const pin of v.pins) attributesUsed.add(pin.code);
        for (const code of attributesUsed) {
            const attrId = attributeIdsByCode.get(code);
            if (!attrId) continue;
            const linkExisting = await this.client
                .from("product_attribute_links")
                .where("product_id", productId)
                .where("attribute_id", attrId)
                .first();
            let linkId: number;
            if (linkExisting) {
                linkId = Number(linkExisting.id);
                await this.client
                    .from("product_attribute_links")
                    .where("id", linkId)
                    .update({ used_for_variation: true, visible: true, updated_at: now });
            } else {
                const [{ id: insertedId }] = await this.client.table("product_attribute_links").returning("id").insert({
                    product_id: productId,
                    attribute_id: attrId,
                    position: 0,
                    visible: true,
                    used_for_variation: true,
                    created_at: now,
                    updated_at: now,
                });
                linkId = Number(insertedId);
            }
            for (const v of p.variations) {
                for (const pin of v.pins) {
                    if (pin.code !== code) continue;
                    const termId = termIdsBySlug.get(pin.termSlug);
                    if (!termId) continue;
                    await this.client
                        .table("product_attribute_link_terms")
                        .insert({ link_id: linkId, term_id: termId, created_at: now, updated_at: now })
                        .onConflict(["link_id", "term_id"])
                        .ignore();
                }
            }
        }

        for (let idx = 0; idx < p.variations.length; idx += 1) {
            const v = p.variations[idx]!;
            const variationSku = `${p.sku}-V${idx + 1}`;
            const existing = await this.client.from("product_variations").where("sku", variationSku).first();
            let variationId: number;
            if (existing) {
                variationId = Number(existing.id);
                await this.client
                    .from("product_variations")
                    .where("id", variationId)
                    .update({
                        regular_price: v.regular_price ?? p.regular_price,
                        menu_order: idx + 1,
                        updated_at: now,
                    });
            } else {
                const [{ id: insertedId }] = await this.client
                    .table("product_variations")
                    .returning("id")
                    .insert({
                        product_id: productId,
                        sku: variationSku,
                        regular_price: v.regular_price ?? p.regular_price,
                        sale_price: null,
                        virtual: false,
                        downloadable: false,
                        manage_stock_mode: "own",
                        menu_order: idx + 1,
                        attributes: {},
                        created_at: now,
                        updated_at: now,
                    });
                variationId = Number(insertedId);
            }
            for (const pin of v.pins) {
                const attrId = attributeIdsByCode.get(pin.code);
                const termId = termIdsBySlug.get(pin.termSlug);
                if (!attrId || !termId) continue;
                await this.client
                    .table("product_variation_attributes")
                    .insert({
                        variation_id: variationId,
                        attribute_id: attrId,
                        term_id: termId,
                        created_at: now,
                        updated_at: now,
                    })
                    .onConflict(["variation_id", "attribute_id"])
                    .merge(["term_id", "updated_at"]);
            }
            await this.upsertInventoryItem(productId, variationId, v.stock ?? 10, now);
        }
    }

    private async upsertInventoryItem(productId: number, variationId: number | null, stock: number, now: string): Promise<void> {
        const existing = await this.client
            .from("inventory_items")
            .where("product_id", productId)
            .where((q) => {
                if (variationId === null) q.whereNull("variation_id");
                else q.where("variation_id", variationId);
            })
            .whereNull("location_id")
            .first();
        if (existing) {
            await this.client
                .from("inventory_items")
                .where("id", existing.id)
                .update({
                    stock_quantity: stock,
                    stock_status: stock > 0 ? "instock" : "outofstock",
                    updated_at: now,
                });
        } else {
            await this.client.table("inventory_items").insert({
                product_id: productId,
                variation_id: variationId,
                location_id: null,
                stock_quantity: stock,
                manage_stock: true,
                backorders: "no",
                stock_status: stock > 0 ? "instock" : "outofstock",
                created_at: now,
                updated_at: now,
            });
        }
    }

    private async ensureMedia(slug: string, alt: string, now: string): Promise<number> {
        const url = `https://picsum.photos/seed/${slug}/600/600`;
        const existing = await this.client.from("media").where("url", url).first();
        if (existing) return Number(existing.id);
        const [{ id: insertedId }] = await this.client.table("media").returning("id").insert({
            kind: "image",
            url,
            mime: "image/jpeg",
            width: 600,
            height: 600,
            alt,
            attributes: {},
            created_at: now,
            updated_at: now,
        });
        return Number(insertedId);
    }
}

interface DemoVariation {
    pins: Array<{ code: string; termSlug: string }>;
    regular_price?: number;
    stock?: number;
}

interface DemoProduct {
    sku: string;
    type: "simple" | "variable";
    category: string;
    brand: string;
    regular_price: number;
    sale_price: number | null;
    stock: number;
    featured: boolean;
    menu_order: number;
    fa: { name: string; description: string; short: string };
    en: { name: string; description: string; short: string };
    variations?: DemoVariation[];
}

/**
 * 50 demo products. Picsum URLs are deterministic per slug. Prices in IRR minor units (i.e. Rial),
 * ranging 5,000,000 – 50,000,000 (= 500k – 5M Toman). Mix of 35 simple + 15 variable.
 */
function generateDemoProducts(): DemoProduct[] {
    const simple = SIMPLE.map((p, i) => ({
        ...p,
        menu_order: i + 1,
        featured: i < 6,
        stock: 25 + ((i * 7) % 30),
    }));
    const variable = VARIABLE.map((p, i) => ({
        ...p,
        menu_order: 100 + i,
        featured: i < 3,
        stock: 0,
    }));
    return [...simple, ...variable];
}

const SIMPLE: Array<Omit<DemoProduct, "menu_order" | "featured" | "stock">> = [
    {
        sku: "PHN-001",
        type: "simple",
        category: "Electronics",
        brand: "Calibra",
        regular_price: 28_500_000,
        sale_price: 25_900_000,
        fa: {
            name: "گوشی هوشمند کلیربا مدل X1",
            description: "گوشی هوشمند با دوربین ۴۸ مگاپیکسلی و باتری ۵۰۰۰ میلی‌آمپر.",
            short: "گوشی هوشمند X1",
        },
        en: {
            name: "Calibra Smartphone X1",
            description: "Smartphone with 48MP camera and 5000mAh battery.",
            short: "Smartphone X1",
        },
    },
    {
        sku: "LAP-001",
        type: "simple",
        category: "Electronics",
        brand: "Calibra",
        regular_price: 48_000_000,
        sale_price: null,
        fa: {
            name: "لپ‌تاپ کلیربا پرو ۱۵ اینچ",
            description: "لپ‌تاپ ۱۵ اینچی با پردازنده نسل دوازدهم و ۱۶ گیگابایت رم.",
            short: "لپ‌تاپ پرو ۱۵",
        },
        en: {
            name: 'Calibra Pro Laptop 15"',
            description: "15-inch laptop with 12th-gen processor and 16GB RAM.",
            short: 'Pro Laptop 15"',
        },
    },
    {
        sku: "HDP-001",
        type: "simple",
        category: "Electronics",
        brand: "Parsian",
        regular_price: 5_500_000,
        sale_price: 4_900_000,
        fa: { name: "هدفون بی‌سیم پارسیان", description: "هدفون بی‌سیم با حذف نویز و عمر باتری ۳۰ ساعت.", short: "هدفون بی‌سیم" },
        en: {
            name: "Parsian Wireless Headphones",
            description: "Wireless headphones with noise cancellation and 30-hour battery.",
            short: "Wireless Headphones",
        },
    },
    {
        sku: "SPK-001",
        type: "simple",
        category: "Electronics",
        brand: "Kaveh",
        regular_price: 3_200_000,
        sale_price: null,
        fa: { name: "اسپیکر بلوتوثی کاوه", description: "اسپیکر قابل حمل با مقاومت در برابر آب IPX7.", short: "اسپیکر بلوتوثی" },
        en: {
            name: "Kaveh Bluetooth Speaker",
            description: "Portable speaker with IPX7 water resistance.",
            short: "Bluetooth Speaker",
        },
    },
    {
        sku: "WCH-001",
        type: "simple",
        category: "Electronics",
        brand: "Calibra",
        regular_price: 6_800_000,
        sale_price: 5_900_000,
        fa: {
            name: "ساعت هوشمند کلیربا فیت",
            description: "ساعت هوشمند با ضربان قلب و ردیابی فعالیت ورزشی.",
            short: "ساعت هوشمند فیت",
        },
        en: {
            name: "Calibra Fit Smartwatch",
            description: "Smartwatch with heart rate and fitness tracking.",
            short: "Fit Smartwatch",
        },
    },
    {
        sku: "TBL-001",
        type: "simple",
        category: "Electronics",
        brand: "Calibra",
        regular_price: 18_900_000,
        sale_price: null,
        fa: {
            name: "تبلت کلیربا تب ۱۰",
            description: "تبلت ۱۰ اینچی با صفحه نمایش HD و ۶۴ گیگابایت حافظه.",
            short: "تبلت تب ۱۰",
        },
        en: {
            name: "Calibra Tab 10 Tablet",
            description: "10-inch tablet with HD display and 64GB storage.",
            short: "Tab 10 Tablet",
        },
    },
    {
        sku: "BLD-001",
        type: "simple",
        category: "Home & Kitchen",
        brand: "Zagros",
        regular_price: 4_200_000,
        sale_price: 3_800_000,
        fa: {
            name: "مخلوط‌کن زاگرس مدل کلاسیک",
            description: "مخلوط‌کن ۱۰۰۰ وات با کاسه شیشه‌ای ۱.۵ لیتری.",
            short: "مخلوط‌کن کلاسیک",
        },
        en: { name: "Zagros Classic Blender", description: "1000W blender with 1.5L glass jar.", short: "Classic Blender" },
    },
    {
        sku: "COF-001",
        type: "simple",
        category: "Home & Kitchen",
        brand: "Zagros",
        regular_price: 7_500_000,
        sale_price: null,
        fa: { name: "قهوه‌ساز زاگرس اکسپرس", description: "قهوه‌ساز اسپرسو‌ساز نیمه اتوماتیک ۱۵ بار.", short: "قهوه‌ساز اکسپرس" },
        en: { name: "Zagros Espresso Maker", description: "Semi-automatic 15-bar espresso maker.", short: "Espresso Maker" },
    },
    {
        sku: "KNF-001",
        type: "simple",
        category: "Home & Kitchen",
        brand: "Azarnoosh",
        regular_price: 2_100_000,
        sale_price: null,
        fa: { name: "ست چاقوی آشپزخانه آذرنوش", description: "ست شش‌تایی چاقوی استیل ضد زنگ آلمانی.", short: "ست چاقو شش‌تایی" },
        en: {
            name: "Azarnoosh Chef Knife Set",
            description: "Six-piece German stainless steel knife set.",
            short: "Chef Knife Set",
        },
    },
    {
        sku: "PAN-001",
        type: "simple",
        category: "Home & Kitchen",
        brand: "Azarnoosh",
        regular_price: 1_800_000,
        sale_price: 1_500_000,
        fa: { name: "تابه نچسب آذرنوش ۲۸ سانتی", description: "تابه نچسب با پوشش سنگی، قطر ۲۸ سانتی‌متر.", short: "تابه نچسب ۲۸" },
        en: {
            name: "Azarnoosh Non-Stick Pan 28cm",
            description: "Stone-coated non-stick pan, 28cm diameter.",
            short: "Non-Stick Pan 28cm",
        },
    },
    {
        sku: "BWL-001",
        type: "simple",
        category: "Home & Kitchen",
        brand: "Parsian",
        regular_price: 950_000,
        sale_price: null,
        fa: { name: "ست کاسه سرامیکی پارسیان", description: "ست چهارتایی کاسه سرامیکی دست‌ساز.", short: "ست کاسه چهارتایی" },
        en: { name: "Parsian Ceramic Bowl Set", description: "Set of four handmade ceramic bowls.", short: "Ceramic Bowl Set" },
    },
    {
        sku: "BAG-001",
        type: "simple",
        category: "Apparel",
        brand: "Calibra",
        regular_price: 3_500_000,
        sale_price: 2_900_000,
        fa: { name: "کوله پشتی کلیربا کلاسیک", description: "کوله پشتی چرمی با ظرفیت ۲۵ لیتر.", short: "کوله کلاسیک" },
        en: { name: "Calibra Classic Backpack", description: "Leather backpack with 25L capacity.", short: "Classic Backpack" },
    },
    {
        sku: "SHO-001",
        type: "simple",
        category: "Apparel",
        brand: "Kaveh",
        regular_price: 4_800_000,
        sale_price: 4_200_000,
        fa: { name: "کفش رسمی کاوه چرم", description: "کفش چرم طبیعی برای استفاده رسمی.", short: "کفش رسمی چرم" },
        en: { name: "Kaveh Leather Dress Shoes", description: "Genuine leather formal shoes.", short: "Leather Dress Shoes" },
    },
    {
        sku: "WCH-002",
        type: "simple",
        category: "Apparel",
        brand: "Parsian",
        regular_price: 8_900_000,
        sale_price: null,
        fa: {
            name: "ساعت مچی پارسیان مردانه",
            description: "ساعت مچی مردانه با بند چرمی و موتور ژاپنی.",
            short: "ساعت مچی مردانه",
        },
        en: {
            name: "Parsian Men's Watch",
            description: "Men's watch with leather strap and Japanese movement.",
            short: "Men's Watch",
        },
    },
    {
        sku: "BLT-001",
        type: "simple",
        category: "Apparel",
        brand: "Kaveh",
        regular_price: 1_400_000,
        sale_price: null,
        fa: { name: "کمربند چرمی کاوه", description: "کمربند چرم طبیعی با سگک فلزی.", short: "کمربند چرمی" },
        en: { name: "Kaveh Leather Belt", description: "Genuine leather belt with metal buckle.", short: "Leather Belt" },
    },
    {
        sku: "BTY-001",
        type: "simple",
        category: "Beauty & Health",
        brand: "Azarnoosh",
        regular_price: 1_200_000,
        sale_price: 999_000,
        fa: { name: "کرم مرطوب‌کننده آذرنوش", description: "کرم مرطوب‌کننده با گیاهان دارویی ایرانی.", short: "کرم مرطوب‌کننده" },
        en: {
            name: "Azarnoosh Moisturizer",
            description: "Moisturizing cream with Iranian medicinal herbs.",
            short: "Moisturizer",
        },
    },
    {
        sku: "PRF-001",
        type: "simple",
        category: "Beauty & Health",
        brand: "Parsian",
        regular_price: 3_400_000,
        sale_price: null,
        fa: { name: "عطر مردانه پارسیان نایت", description: "عطر مردانه گرم و چوبی.", short: "عطر نایت" },
        en: { name: "Parsian Night Cologne", description: "Warm woody men's cologne.", short: "Night Cologne" },
    },
    {
        sku: "SHM-001",
        type: "simple",
        category: "Beauty & Health",
        brand: "Azarnoosh",
        regular_price: 580_000,
        sale_price: null,
        fa: { name: "شامپو گیاهی آذرنوش ۴۰۰ میلی", description: "شامپو گیاهی مناسب موهای خشک.", short: "شامپو گیاهی" },
        en: { name: "Azarnoosh Herbal Shampoo 400ml", description: "Herbal shampoo for dry hair.", short: "Herbal Shampoo" },
    },
    {
        sku: "BRS-001",
        type: "simple",
        category: "Beauty & Health",
        brand: "Calibra",
        regular_price: 2_300_000,
        sale_price: 1_900_000,
        fa: { name: "مسواک برقی کلیربا", description: "مسواک برقی با چهار حالت تمیزکاری.", short: "مسواک برقی" },
        en: {
            name: "Calibra Electric Toothbrush",
            description: "Electric toothbrush with four cleaning modes.",
            short: "Electric Toothbrush",
        },
    },
    {
        sku: "BOK-001",
        type: "simple",
        category: "Books",
        brand: "Parsian",
        regular_price: 480_000,
        sale_price: null,
        fa: {
            name: "کتاب کلیله و دمنه — متن کامل",
            description: "متن کامل کتاب کلیله و دمنه با شرح فارسی.",
            short: "کلیله و دمنه",
        },
        en: {
            name: "Kalila wa Dimna — Complete Edition",
            description: "Complete Kalila wa Dimna with Persian commentary.",
            short: "Kalila wa Dimna",
        },
    },
    {
        sku: "BOK-002",
        type: "simple",
        category: "Books",
        brand: "Parsian",
        regular_price: 650_000,
        sale_price: 550_000,
        fa: { name: "شاهنامه فردوسی — نسخه نفیس", description: "شاهنامه فردوسی با تصاویر مینیاتور.", short: "شاهنامه" },
        en: {
            name: "Shahnameh of Ferdowsi — Deluxe Edition",
            description: "Shahnameh with miniature illustrations.",
            short: "Shahnameh",
        },
    },
    {
        sku: "BOK-003",
        type: "simple",
        category: "Books",
        brand: "Azarnoosh",
        regular_price: 320_000,
        sale_price: null,
        fa: { name: "بوف کور — صادق هدایت", description: "رمان مشهور صادق هدایت.", short: "بوف کور" },
        en: {
            name: "The Blind Owl — Sadegh Hedayat",
            description: "The famous novel by Sadegh Hedayat.",
            short: "The Blind Owl",
        },
    },
    {
        sku: "BOK-004",
        type: "simple",
        category: "Books",
        brand: "Kaveh",
        regular_price: 850_000,
        sale_price: null,
        fa: { name: "آشپزی ایرانی — کتاب راهنما", description: "راهنمای جامع آشپزی سنتی ایرانی.", short: "آشپزی ایرانی" },
        en: {
            name: "Iranian Cooking — A Guide",
            description: "Comprehensive guide to traditional Iranian cooking.",
            short: "Iranian Cooking",
        },
    },
    {
        sku: "TNT-001",
        type: "simple",
        category: "Sports & Travel",
        brand: "Zagros",
        regular_price: 12_500_000,
        sale_price: null,
        fa: {
            name: "چادر کوهنوردی زاگرس ۴ نفره",
            description: "چادر کوهنوردی برای چهار نفر، مقاوم در برابر باد.",
            short: "چادر ۴ نفره",
        },
        en: {
            name: "Zagros 4-Person Camping Tent",
            description: "4-person camping tent, wind-resistant.",
            short: "4-Person Tent",
        },
    },
    {
        sku: "BKE-001",
        type: "simple",
        category: "Sports & Travel",
        brand: "Zagros",
        regular_price: 24_000_000,
        sale_price: 21_500_000,
        fa: {
            name: "دوچرخه کوهستان زاگرس ۲۹ اینچ",
            description: "دوچرخه کوهستان با چارچوب آلیاژی و ۲۱ دنده.",
            short: "دوچرخه ۲۹",
        },
        en: {
            name: 'Zagros 29" Mountain Bike',
            description: "Mountain bike with alloy frame and 21 gears.",
            short: 'Mountain Bike 29"',
        },
    },
    {
        sku: "BAL-001",
        type: "simple",
        category: "Sports & Travel",
        brand: "Parsian",
        regular_price: 1_600_000,
        sale_price: null,
        fa: { name: "توپ فوتبال پارسیان حرفه‌ای", description: "توپ فوتبال استاندارد فیفا.", short: "توپ فوتبال" },
        en: { name: "Parsian Pro Football", description: "FIFA standard football.", short: "Pro Football" },
    },
    {
        sku: "MAT-001",
        type: "simple",
        category: "Sports & Travel",
        brand: "Calibra",
        regular_price: 980_000,
        sale_price: 850_000,
        fa: { name: "تشک یوگا کلیربا", description: "تشک یوگا ضد لغزش با ضخامت ۶ میلی‌متر.", short: "تشک یوگا" },
        en: { name: "Calibra Yoga Mat", description: "Non-slip yoga mat, 6mm thick.", short: "Yoga Mat" },
    },
    {
        sku: "TOY-001",
        type: "simple",
        category: "Kids & Baby",
        brand: "Azarnoosh",
        regular_price: 850_000,
        sale_price: null,
        fa: { name: "عروسک پارچه‌ای دست‌ساز", description: "عروسک پارچه‌ای دست‌ساز، مناسب از یک سالگی.", short: "عروسک پارچه‌ای" },
        en: { name: "Handmade Cloth Doll", description: "Handmade cloth doll, suitable for ages 1+.", short: "Cloth Doll" },
    },
    {
        sku: "CRB-001",
        type: "simple",
        category: "Kids & Baby",
        brand: "Azarnoosh",
        regular_price: 14_500_000,
        sale_price: 12_900_000,
        fa: { name: "گهواره چوبی آذرنوش", description: "گهواره چوبی دست‌ساز، چوب راش.", short: "گهواره چوبی" },
        en: { name: "Azarnoosh Wooden Cradle", description: "Handmade wooden cradle, beech wood.", short: "Wooden Cradle" },
    },
    {
        sku: "BAB-001",
        type: "simple",
        category: "Kids & Baby",
        brand: "Parsian",
        regular_price: 720_000,
        sale_price: null,
        fa: { name: "شیرخوار شیشه‌ای ۲۴۰ میلی", description: "شیشه شیر کودک ۲۴۰ میلی‌لیتری بدون BPA.", short: "شیشه شیر ۲۴۰" },
        en: { name: "Baby Bottle 240ml", description: "240ml BPA-free baby bottle.", short: "Baby Bottle 240ml" },
    },
    {
        sku: "CAR-001",
        type: "simple",
        category: "Automotive",
        brand: "Calibra",
        regular_price: 4_500_000,
        sale_price: null,
        fa: {
            name: "دوربین خودرو کلیربا فول‌اچ‌دی",
            description: "دوربین داشبورد خودرو با ضبط Full HD.",
            short: "دوربین خودرو FHD",
        },
        en: {
            name: "Calibra Full-HD Dash Cam",
            description: "Car dashboard camera with Full HD recording.",
            short: "Dash Cam FHD",
        },
    },
    {
        sku: "OIL-001",
        type: "simple",
        category: "Automotive",
        brand: "Zagros",
        regular_price: 1_800_000,
        sale_price: null,
        fa: { name: "روغن موتور زاگرس ۲۰W-۵۰", description: "روغن موتور سینتتیک ۴ لیتری.", short: "روغن موتور ۲۰W-۵۰" },
        en: { name: "Zagros 20W-50 Motor Oil", description: "4L synthetic motor oil.", short: "Motor Oil 20W-50" },
    },
    {
        sku: "TIR-001",
        type: "simple",
        category: "Automotive",
        brand: "Parsian",
        regular_price: 8_900_000,
        sale_price: 7_900_000,
        fa: { name: "لاستیک پارسیان ۲۰۵/۵۵ R16", description: "لاستیک خودرو سواری ۲۰۵/۵۵ R16.", short: "لاستیک R16" },
        en: { name: "Parsian Tire 205/55 R16", description: "Passenger car tire 205/55 R16.", short: "Tire R16" },
    },
    {
        sku: "JUM-001",
        type: "simple",
        category: "Automotive",
        brand: "Kaveh",
        regular_price: 3_400_000,
        sale_price: null,
        fa: { name: "کابل باطری کاوه ۵ متری", description: "کابل اتصال باطری خودرو ۵ متری.", short: "کابل باطری" },
        en: { name: "Kaveh Jumper Cables 5m", description: "5m car battery jumper cables.", short: "Jumper Cables 5m" },
    },
    {
        sku: "VAC-001",
        type: "simple",
        category: "Home & Kitchen",
        brand: "Kaveh",
        regular_price: 9_800_000,
        sale_price: 8_700_000,
        fa: { name: "جاروبرقی کاوه پاور ۲۲۰۰", description: "جاروبرقی ۲۲۰۰ وات با فیلتر HEPA.", short: "جاروبرقی ۲۲۰۰" },
        en: { name: "Kaveh Power 2200 Vacuum", description: "2200W vacuum cleaner with HEPA filter.", short: "Vacuum 2200" },
    },
];

const VARIABLE: Array<Omit<DemoProduct, "menu_order" | "featured" | "stock">> = [
    {
        sku: "TSH-001",
        type: "variable",
        category: "Apparel",
        brand: "Calibra",
        regular_price: 1_200_000,
        sale_price: null,
        fa: { name: "تی‌شرت کلیربا کلاسیک", description: "تی‌شرت پنبه‌ای با چاپ لوگوی کلیربا.", short: "تی‌شرت کلاسیک" },
        en: { name: "Calibra Classic T-Shirt", description: "Cotton t-shirt with Calibra logo print.", short: "Classic T-Shirt" },
        variations: [
            {
                pins: [
                    { code: "size", termSlug: "size-s" },
                    { code: "color", termSlug: "color-black" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-m" },
                    { code: "color", termSlug: "color-white" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-l" },
                    { code: "color", termSlug: "color-blue" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-xl" },
                    { code: "color", termSlug: "color-red" },
                ],
            },
        ],
    },
    {
        sku: "JKT-001",
        type: "variable",
        category: "Apparel",
        brand: "Kaveh",
        regular_price: 6_800_000,
        sale_price: 5_900_000,
        fa: { name: "ژاکت زمستانی کاوه", description: "ژاکت گرم برای زمستان، دو رنگ.", short: "ژاکت زمستانی" },
        en: { name: "Kaveh Winter Jacket", description: "Warm winter jacket, two colors.", short: "Winter Jacket" },
        variations: [
            {
                pins: [
                    { code: "size", termSlug: "size-m" },
                    { code: "color", termSlug: "color-black" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-l" },
                    { code: "color", termSlug: "color-gray" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-xl" },
                    { code: "color", termSlug: "color-brown" },
                ],
            },
        ],
    },
    {
        sku: "JNS-001",
        type: "variable",
        category: "Apparel",
        brand: "Parsian",
        regular_price: 2_900_000,
        sale_price: null,
        fa: { name: "شلوار جین پارسیان", description: "شلوار جین کلاسیک با برش معمولی.", short: "شلوار جین" },
        en: { name: "Parsian Jeans", description: "Classic jeans, regular cut.", short: "Jeans" },
        variations: [
            {
                pins: [
                    { code: "size", termSlug: "size-m" },
                    { code: "color", termSlug: "color-blue" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-l" },
                    { code: "color", termSlug: "color-black" },
                ],
            },
        ],
    },
    {
        sku: "SHO-002",
        type: "variable",
        category: "Apparel",
        brand: "Calibra",
        regular_price: 4_500_000,
        sale_price: null,
        fa: { name: "کفش ورزشی کلیربا ران", description: "کفش ورزشی مخصوص دویدن.", short: "کفش ورزشی ران" },
        en: { name: "Calibra Run Sport Shoes", description: "Sport shoes designed for running.", short: "Run Sport Shoes" },
        variations: [
            {
                pins: [
                    { code: "size", termSlug: "size-m" },
                    { code: "color", termSlug: "color-black" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-l" },
                    { code: "color", termSlug: "color-white" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-xl" },
                    { code: "color", termSlug: "color-red" },
                ],
            },
        ],
    },
    {
        sku: "SCF-001",
        type: "variable",
        category: "Apparel",
        brand: "Azarnoosh",
        regular_price: 1_500_000,
        sale_price: null,
        fa: { name: "روسری آذرنوش طرح سنتی", description: "روسری ابریشمی با طرح سنتی ایرانی.", short: "روسری سنتی" },
        en: {
            name: "Azarnoosh Traditional Scarf",
            description: "Silk scarf with traditional Iranian pattern.",
            short: "Traditional Scarf",
        },
        variations: [
            { pins: [{ code: "color", termSlug: "color-red" }] },
            { pins: [{ code: "color", termSlug: "color-blue" }] },
            { pins: [{ code: "color", termSlug: "color-green" }] },
        ],
    },
    {
        sku: "CUP-001",
        type: "variable",
        category: "Home & Kitchen",
        brand: "Parsian",
        regular_price: 380_000,
        sale_price: null,
        fa: { name: "فنجان سرامیکی پارسیان دست‌ساز", description: "فنجان سرامیکی دست‌ساز با لعاب رنگی.", short: "فنجان دست‌ساز" },
        en: {
            name: "Parsian Handmade Ceramic Cup",
            description: "Handmade ceramic cup with colored glaze.",
            short: "Handmade Cup",
        },
        variations: [
            {
                pins: [
                    { code: "color", termSlug: "color-blue" },
                    { code: "material", termSlug: "material-ceramic" },
                ],
            },
            {
                pins: [
                    { code: "color", termSlug: "color-green" },
                    { code: "material", termSlug: "material-ceramic" },
                ],
            },
            {
                pins: [
                    { code: "color", termSlug: "color-white" },
                    { code: "material", termSlug: "material-ceramic" },
                ],
            },
        ],
    },
    {
        sku: "POT-001",
        type: "variable",
        category: "Home & Kitchen",
        brand: "Azarnoosh",
        regular_price: 2_800_000,
        sale_price: null,
        fa: { name: "ست قابلمه آذرنوش", description: "ست سه‌تایی قابلمه استیل ضد زنگ.", short: "ست قابلمه" },
        en: { name: "Azarnoosh Pot Set", description: "Three-piece stainless steel pot set.", short: "Pot Set" },
        variations: [
            {
                pins: [
                    { code: "weight", termSlug: "weight-light" },
                    { code: "material", termSlug: "material-metal" },
                ],
            },
            {
                pins: [
                    { code: "weight", termSlug: "weight-medium" },
                    { code: "material", termSlug: "material-metal" },
                ],
            },
            {
                pins: [
                    { code: "weight", termSlug: "weight-heavy" },
                    { code: "material", termSlug: "material-metal" },
                ],
            },
        ],
    },
    {
        sku: "PLW-001",
        type: "variable",
        category: "Home & Kitchen",
        brand: "Calibra",
        regular_price: 950_000,
        sale_price: null,
        fa: { name: "بالشت کلیربا ضد حساسیت", description: "بالشت ضد حساسیت با پارچه پنبه‌ای.", short: "بالشت ضد حساسیت" },
        en: {
            name: "Calibra Hypoallergenic Pillow",
            description: "Hypoallergenic pillow with cotton cover.",
            short: "Hypoallergenic Pillow",
        },
        variations: [
            {
                pins: [
                    { code: "color", termSlug: "color-white" },
                    { code: "material", termSlug: "material-cotton" },
                ],
            },
            {
                pins: [
                    { code: "color", termSlug: "color-gray" },
                    { code: "material", termSlug: "material-cotton" },
                ],
            },
        ],
    },
    {
        sku: "LMP-001",
        type: "variable",
        category: "Home & Kitchen",
        brand: "Parsian",
        regular_price: 1_800_000,
        sale_price: null,
        fa: { name: "لامپ رومیزی پارسیان", description: "لامپ رومیزی LED با کنترل لمسی.", short: "لامپ رومیزی" },
        en: { name: "Parsian Desk Lamp", description: "LED desk lamp with touch control.", short: "Desk Lamp" },
        variations: [
            { pins: [{ code: "color", termSlug: "color-black" }] },
            { pins: [{ code: "color", termSlug: "color-white" }] },
            { pins: [{ code: "color", termSlug: "color-gold" }] },
        ],
    },
    {
        sku: "WTR-001",
        type: "variable",
        category: "Sports & Travel",
        brand: "Zagros",
        regular_price: 850_000,
        sale_price: 720_000,
        fa: { name: "قمقمه استیل زاگرس", description: "قمقمه استیل ضد زنگ ۱ لیتری.", short: "قمقمه استیل" },
        en: { name: "Zagros Steel Water Bottle", description: "1L stainless steel water bottle.", short: "Steel Water Bottle" },
        variations: [
            { pins: [{ code: "color", termSlug: "color-black" }] },
            { pins: [{ code: "color", termSlug: "color-blue" }] },
            { pins: [{ code: "color", termSlug: "color-red" }] },
            { pins: [{ code: "color", termSlug: "color-green" }] },
        ],
    },
    {
        sku: "BCK-001",
        type: "variable",
        category: "Sports & Travel",
        brand: "Zagros",
        regular_price: 5_400_000,
        sale_price: null,
        fa: {
            name: "کوله کوهنوردی زاگرس ۶۰ لیتری",
            description: "کوله کوهنوردی ۶۰ لیتری با فریم داخلی.",
            short: "کوله ۶۰ لیتری",
        },
        en: {
            name: "Zagros 60L Hiking Backpack",
            description: "60L hiking backpack with internal frame.",
            short: "Hiking Backpack 60L",
        },
        variations: [
            { pins: [{ code: "color", termSlug: "color-black" }] },
            { pins: [{ code: "color", termSlug: "color-green" }] },
        ],
    },
    {
        sku: "BAB-002",
        type: "variable",
        category: "Kids & Baby",
        brand: "Azarnoosh",
        regular_price: 2_200_000,
        sale_price: null,
        fa: { name: "لباس نوزاد آذرنوش پنبه‌ای", description: "لباس نوزاد ست سه‌تکه پنبه‌ای.", short: "لباس نوزاد" },
        en: { name: "Azarnoosh Cotton Baby Outfit", description: "Three-piece cotton baby outfit.", short: "Baby Outfit" },
        variations: [
            {
                pins: [
                    { code: "size", termSlug: "size-s" },
                    { code: "color", termSlug: "color-pink" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-m" },
                    { code: "color", termSlug: "color-blue" },
                ],
            },
        ],
    },
    {
        sku: "BLK-001",
        type: "variable",
        category: "Kids & Baby",
        brand: "Calibra",
        regular_price: 1_400_000,
        sale_price: null,
        fa: { name: "پتو نوزاد کلیربا", description: "پتو نوزاد پنبه‌ای نرم.", short: "پتو نوزاد" },
        en: { name: "Calibra Baby Blanket", description: "Soft cotton baby blanket.", short: "Baby Blanket" },
        variations: [
            { pins: [{ code: "color", termSlug: "color-pink" }] },
            { pins: [{ code: "color", termSlug: "color-blue" }] },
            { pins: [{ code: "color", termSlug: "color-white" }] },
        ],
    },
    {
        sku: "PNT-001",
        type: "variable",
        category: "Apparel",
        brand: "Parsian",
        regular_price: 2_400_000,
        sale_price: null,
        fa: { name: "شلوار راحتی پارسیان", description: "شلوار راحتی پنبه‌ای منزل.", short: "شلوار راحتی" },
        en: { name: "Parsian Casual Pants", description: "Cotton casual pants for home.", short: "Casual Pants" },
        variations: [
            {
                pins: [
                    { code: "size", termSlug: "size-m" },
                    { code: "color", termSlug: "color-gray" },
                ],
            },
            {
                pins: [
                    { code: "size", termSlug: "size-l" },
                    { code: "color", termSlug: "color-black" },
                ],
            },
        ],
    },
    {
        sku: "BOK-005",
        type: "variable",
        category: "Books",
        brand: "Parsian",
        regular_price: 1_200_000,
        sale_price: null,
        fa: { name: "دیوان حافظ — انتخاب جلد", description: "دیوان حافظ با انتخاب جلد سخت یا جلد چرمی.", short: "دیوان حافظ" },
        en: {
            name: "Divan of Hafez — Choose Binding",
            description: "Divan of Hafez with choice of hardcover or leather binding.",
            short: "Divan of Hafez",
        },
        variations: [
            { pins: [{ code: "material", termSlug: "material-leather" }] },
            { pins: [{ code: "material", termSlug: "material-cotton" }] },
        ],
    },
];
