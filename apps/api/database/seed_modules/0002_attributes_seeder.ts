import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

/**
 * Phase 02 seed — global attribute taxonomy that products + variations reference. Lives next to
 * the foundation seeder because attributes are cross-cutting catalog metadata: the admin's
 * Attributes card and the storefront's variation picker both rely on these rows existing.
 *
 * Idempotent — upserts by `code` for attributes and by `(attribute_id, slug-fa)` for terms, so a
 * second run produces no duplicates and previously-seeded ids are preserved (existing
 * product_attribute_links keep pointing at the same row).
 *
 * Catalog: Color · Size · Weight · Material · Capacity. Realistic for the apparel / food /
 * homeware products the bulk dataset spans.
 */
export default class AttributesSeeder extends BaseSeeder {
    async run() {
        for (const definition of ATTRIBUTE_CATALOG) {
            const attributeId = await this.upsertAttribute(definition);
            await this.upsertTerms(attributeId, definition.terms);
        }
    }

    private async upsertAttribute(definition: AttributeDefinition): Promise<number> {
        const now = DateTime.utc().toSQL();
        const existing = await this.client.from("product_attributes").where("code", definition.code).select("id").first();
        let id: number;
        if (existing) {
            id = Number(existing.id);
        } else {
            const [inserted] = await this.client
                .table("product_attributes")
                .returning("id")
                .insert({
                    code: definition.code,
                    order_by: definition.orderBy ?? "menu_order",
                    has_archives: false,
                    is_custom: false,
                    attributes: JSON.stringify({}),
                    created_at: now,
                    updated_at: now,
                });
            id = Number(inserted.id);
        }

        for (const tr of definition.translations) {
            await this.client
                .table("product_attribute_translations")
                .insert({
                    attribute_id: id,
                    locale: tr.locale,
                    name: tr.name,
                    created_at: now,
                    updated_at: now,
                })
                .onConflict(["attribute_id", "locale"])
                .merge(["name", "updated_at"]);
        }
        return id;
    }

    private async upsertTerms(attributeId: number, terms: TermDefinition[]) {
        const now = DateTime.utc().toSQL();
        for (let index = 0; index < terms.length; index += 1) {
            const term = terms[index]!;
            const faSlug = term.translations.find((t) => t.locale === "fa")?.slug ?? term.translations[0]!.slug;

            const existing = await this.client
                .from("product_attribute_terms as t")
                .leftJoin("product_attribute_term_translations as tt", function () {
                    this.on("tt.term_id", "t.id").andOnVal("tt.locale", "fa");
                })
                .where("t.attribute_id", attributeId)
                .where("tt.slug", faSlug)
                .select("t.id")
                .first();

            let termId: number;
            if (existing) {
                termId = Number(existing.id);
                await this.client
                    .from("product_attribute_terms")
                    .where("id", termId)
                    .update({ menu_order: index, updated_at: now });
            } else {
                const [inserted] = await this.client
                    .table("product_attribute_terms")
                    .returning("id")
                    .insert({
                        attribute_id: attributeId,
                        menu_order: index,
                        attributes: JSON.stringify({}),
                        created_at: now,
                        updated_at: now,
                    });
                termId = Number(inserted.id);
            }

            for (const tr of term.translations) {
                await this.client
                    .table("product_attribute_term_translations")
                    .insert({
                        term_id: termId,
                        locale: tr.locale,
                        name: tr.name,
                        slug: tr.slug,
                        description: null,
                        created_at: now,
                        updated_at: now,
                    })
                    .onConflict(["term_id", "locale"])
                    .merge(["name", "slug", "updated_at"]);
            }
        }
    }
}

interface TranslationDefinition {
    locale: "fa" | "en";
    name: string;
    slug: string;
}

interface TermDefinition {
    translations: TranslationDefinition[];
}

interface AttributeDefinition {
    code: string;
    orderBy?: "menu_order" | "name" | "id";
    translations: { locale: "fa" | "en"; name: string }[];
    terms: TermDefinition[];
}

const ATTRIBUTE_CATALOG: AttributeDefinition[] = [
    {
        code: "color",
        translations: [
            { locale: "fa", name: "رنگ" },
            { locale: "en", name: "Color" },
        ],
        terms: [
            {
                translations: [
                    { locale: "fa", name: "قرمز", slug: "ghermez" },
                    { locale: "en", name: "Red", slug: "red" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "آبی", slug: "abi" },
                    { locale: "en", name: "Blue", slug: "blue" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "سبز", slug: "sabz" },
                    { locale: "en", name: "Green", slug: "green" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "مشکی", slug: "meshki" },
                    { locale: "en", name: "Black", slug: "black" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "سفید", slug: "sefid" },
                    { locale: "en", name: "White", slug: "white" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "طلایی", slug: "talaaee" },
                    { locale: "en", name: "Gold", slug: "gold" },
                ],
            },
        ],
    },
    {
        code: "size",
        translations: [
            { locale: "fa", name: "اندازه" },
            { locale: "en", name: "Size" },
        ],
        terms: [
            {
                translations: [
                    { locale: "fa", name: "S", slug: "s" },
                    { locale: "en", name: "S", slug: "s" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "M", slug: "m" },
                    { locale: "en", name: "M", slug: "m" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "L", slug: "l" },
                    { locale: "en", name: "L", slug: "l" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "XL", slug: "xl" },
                    { locale: "en", name: "XL", slug: "xl" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "XXL", slug: "xxl" },
                    { locale: "en", name: "XXL", slug: "xxl" },
                ],
            },
        ],
    },
    {
        code: "weight",
        translations: [
            { locale: "fa", name: "وزن" },
            { locale: "en", name: "Weight" },
        ],
        terms: [
            {
                translations: [
                    { locale: "fa", name: "۱۰۰ گرم", slug: "100g" },
                    { locale: "en", name: "100g", slug: "100g" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "۲۵۰ گرم", slug: "250g" },
                    { locale: "en", name: "250g", slug: "250g" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "۵۰۰ گرم", slug: "500g" },
                    { locale: "en", name: "500g", slug: "500g" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "۱ کیلوگرم", slug: "1kg" },
                    { locale: "en", name: "1kg", slug: "1kg" },
                ],
            },
        ],
    },
    {
        code: "material",
        translations: [
            { locale: "fa", name: "جنس" },
            { locale: "en", name: "Material" },
        ],
        terms: [
            {
                translations: [
                    { locale: "fa", name: "نخ پنبه", slug: "nakh-panbeh" },
                    { locale: "en", name: "Cotton", slug: "cotton" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "چرم", slug: "charm" },
                    { locale: "en", name: "Leather", slug: "leather" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "پلاستیک", slug: "plastic" },
                    { locale: "en", name: "Plastic", slug: "plastic" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "فلز", slug: "felez" },
                    { locale: "en", name: "Metal", slug: "metal" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "شیشه", slug: "shisheh" },
                    { locale: "en", name: "Glass", slug: "glass" },
                ],
            },
        ],
    },
    {
        code: "capacity",
        translations: [
            { locale: "fa", name: "ظرفیت" },
            { locale: "en", name: "Capacity" },
        ],
        terms: [
            {
                translations: [
                    { locale: "fa", name: "۱ نفره", slug: "1-person" },
                    { locale: "en", name: "1-person", slug: "1-person" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "۲ نفره", slug: "2-person" },
                    { locale: "en", name: "2-person", slug: "2-person" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "۴ نفره", slug: "4-person" },
                    { locale: "en", name: "4-person", slug: "4-person" },
                ],
            },
            {
                translations: [
                    { locale: "fa", name: "۶ نفره", slug: "6-person" },
                    { locale: "en", name: "6-person", slug: "6-person" },
                ],
            },
        ],
    },
];
