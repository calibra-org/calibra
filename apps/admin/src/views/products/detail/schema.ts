import { z } from "zod";

import type { AdminProductDetailView } from "#/lib/adapters/product-detail";

/**
 * Zod schema for the product detail form. **Single-language content**: the CMS treats Persian
 * as the only source of truth — `name`, `slug`, `description`, `shortDescription`, `purchaseNote`,
 * and `externalButtonText` live as flat string fields. The API still accepts a `translations[]`
 * array for back-compat, but the admin only ever sends a single `{ locale: "fa", … }` entry; the
 * formValuesToPayload adapter handles the wire shape.
 *
 * Money is kept as Toman MAJOR units (the input layer renders Toman; the submit adapter
 * multiplies ×10 to convert back to Rial minor units). Dates are ISO strings (UTC).
 */
export const productDetailSchema = z
    .object({
        type: z.enum(["simple", "variable", "grouped", "external"]),
        sku: z.string().nullable(),
        gtin: z.string().nullable(),
        status: z.enum(["draft", "publish", "pending", "private"]),
        catalogVisibility: z.enum(["visible", "catalog", "search", "hidden"]),
        featured: z.boolean(),
        virtual: z.boolean(),
        downloadable: z.boolean(),
        regularPriceToman: z.number().min(0).nullable(),
        salePriceToman: z.number().min(0).nullable(),
        saleStartsAt: z.string().nullable(),
        saleEndsAt: z.string().nullable(),
        taxClassId: z.number().nullable(),
        taxStatus: z.enum(["taxable", "shipping", "none"]),
        shippingClassId: z.number().nullable(),
        weightGrams: z.number().min(0).nullable(),
        lengthMm: z.number().min(0).nullable(),
        widthMm: z.number().min(0).nullable(),
        heightMm: z.number().min(0).nullable(),
        soldIndividually: z.boolean(),
        reviewsAllowed: z.boolean(),
        externalUrl: z.string().nullable(),
        menuOrder: z.number().int(),
        posAvailable: z.boolean(),
        name: z.string().min(1, "name_required").max(300),
        slug: z.string().min(1).max(320),
        description: z.string().nullable(),
        shortDescription: z.string().max(500).nullable(),
        purchaseNote: z.string().max(2000).nullable(),
        externalButtonText: z.string().max(120).nullable(),
        categoryIds: z.array(z.number()),
        tagIds: z.array(z.number()),
        brandId: z.number().nullable(),
        imageMediaIds: z.array(z.number()),
        upsellIds: z.array(z.number()),
        crossSellIds: z.array(z.number()),
        groupedMemberIds: z.array(z.number()),
        downloads: z.array(
            z.object({
                id: z.number().optional(),
                mediaId: z.number(),
                fileLabel: z.string().min(1).max(200),
                downloadLimit: z.number().int().min(0).nullable(),
                downloadExpiryDays: z.number().int().min(0).nullable(),
                position: z.number().int().min(0),
            }),
        ),
        attributeLinks: z.array(
            z.object({
                attributeId: z.number(),
                position: z.number().int().min(0),
                visible: z.boolean(),
                usedForVariation: z.boolean(),
                termIds: z.array(z.number()),
            }),
        ),
        defaultVariationId: z.number().nullable(),
    })
    .refine(
        (data) => data.salePriceToman === null || data.regularPriceToman === null || data.salePriceToman < data.regularPriceToman,
        {
            message: "sale_price_must_be_below_regular",
            path: ["salePriceToman"],
        },
    );

export type ProductDetailFormValues = z.infer<typeof productDetailSchema>;

/** Default values for the New Product flow. */
export function emptyProductDetailValues(): ProductDetailFormValues {
    return {
        type: "simple",
        sku: null,
        gtin: null,
        status: "draft",
        catalogVisibility: "visible",
        featured: false,
        virtual: false,
        downloadable: false,
        regularPriceToman: null,
        salePriceToman: null,
        saleStartsAt: null,
        saleEndsAt: null,
        taxClassId: null,
        taxStatus: "taxable",
        shippingClassId: null,
        weightGrams: null,
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        soldIndividually: false,
        reviewsAllowed: true,
        externalUrl: null,
        menuOrder: 0,
        posAvailable: true,
        name: "",
        slug: "",
        description: null,
        shortDescription: null,
        purchaseNote: null,
        externalButtonText: null,
        categoryIds: [],
        tagIds: [],
        brandId: null,
        imageMediaIds: [],
        upsellIds: [],
        crossSellIds: [],
        groupedMemberIds: [],
        downloads: [],
        attributeLinks: [],
        defaultVariationId: null,
    };
}

/**
 * Drops NaN / non-finite / duplicate ids. The adapter coerces every id through `Number(...)` so
 * a missing field surfaces as `NaN`; we filter at the form boundary so React renders never see
 * duplicate `NaN` keys and async resolvers don't loop on ids that can never be resolved.
 */
function sanitizeIds(values: number[]): number[] {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const value of values) {
        if (!Number.isFinite(value)) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

/**
 * Maps the loaded server-side product into form values. Picks the `fa` translation when present,
 * falls back to the first available row, then to empty strings. Rial-minor prices become Toman
 * major via /10.
 */
export function productToFormValues(p: AdminProductDetailView): ProductDetailFormValues {
    const t = p.translations.find((row) => row.locale === "fa") ?? p.translations[0];
    return {
        type: p.type,
        sku: p.sku,
        gtin: p.gtin,
        status: p.status,
        catalogVisibility: p.catalogVisibility,
        featured: p.featured,
        virtual: p.virtual,
        downloadable: p.downloadable,
        regularPriceToman: p.regularPriceMinor === null ? null : p.regularPriceMinor / 10,
        salePriceToman: p.salePriceMinor === null ? null : p.salePriceMinor / 10,
        saleStartsAt: p.saleStartsAt,
        saleEndsAt: p.saleEndsAt,
        taxClassId: p.taxClassId,
        taxStatus: p.taxStatus,
        shippingClassId: p.shippingClassId,
        weightGrams: p.weightGrams,
        lengthMm: p.lengthMm,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        soldIndividually: p.soldIndividually,
        reviewsAllowed: p.reviewsAllowed,
        externalUrl: p.externalUrl,
        menuOrder: p.menuOrder,
        posAvailable: p.posAvailable,
        name: t?.name ?? "",
        slug: t?.slug ?? "",
        description: t?.description ?? null,
        shortDescription: t?.shortDescription ?? null,
        purchaseNote: t?.purchaseNote ?? null,
        externalButtonText: t?.externalButtonText ?? null,
        categoryIds: sanitizeIds(p.categoryIds),
        tagIds: sanitizeIds(p.tagIds),
        brandId: p.brandId !== null && Number.isFinite(p.brandId) ? p.brandId : null,
        imageMediaIds: sanitizeIds(p.images.map((img) => img.mediaId)),
        upsellIds: sanitizeIds(p.upsellIds),
        crossSellIds: sanitizeIds(p.crossSellIds),
        groupedMemberIds: sanitizeIds(p.groupedMemberIds),
        downloads: p.downloads.map((d) => ({
            id: d.id,
            mediaId: d.mediaId,
            fileLabel: d.fileLabel,
            downloadLimit: d.downloadLimit,
            downloadExpiryDays: d.downloadExpiryDays,
            position: d.position,
        })),
        attributeLinks: p.attributeLinks,
        defaultVariationId: p.defaultVariationId,
    };
}

/**
 * Map form values to the wire payload the API understands. Toman → Rial. The content fields
 * (`name`, `slug`, …) get packed into a single-entry `translations[{ locale: "fa", … }]` array —
 * the API still owns the translations table, the admin just stops pretending the catalog is
 * multilingual. If/when the API drops `translations[]` for products, this is the only place that
 * needs to change.
 */
export function formValuesToPayload(values: ProductDetailFormValues): Record<string, unknown> {
    return {
        type: values.type,
        sku: values.sku === null || values.sku.length === 0 ? null : values.sku,
        gtin: values.gtin === null || values.gtin.length === 0 ? null : values.gtin,
        status: values.status,
        catalog_visibility: values.catalogVisibility,
        featured: values.featured,
        virtual: values.virtual,
        downloadable: values.downloadable,
        regular_price: values.regularPriceToman === null ? null : Math.round(values.regularPriceToman * 10),
        sale_price: values.salePriceToman === null ? null : Math.round(values.salePriceToman * 10),
        sale_starts_at: values.saleStartsAt,
        sale_ends_at: values.saleEndsAt,
        tax_class_id: values.taxClassId,
        tax_status: values.taxStatus,
        shipping_class_id: values.shippingClassId,
        weight_grams: values.weightGrams,
        length_mm: values.lengthMm,
        width_mm: values.widthMm,
        height_mm: values.heightMm,
        sold_individually: values.soldIndividually,
        reviews_allowed: values.reviewsAllowed,
        external_url: values.externalUrl === null || values.externalUrl.length === 0 ? null : values.externalUrl,
        menu_order: values.menuOrder,
        pos_available: values.posAvailable,
        translations: [
            {
                locale: "fa",
                name: values.name,
                slug: values.slug,
                description: values.description,
                short_description: values.shortDescription,
                purchase_note: values.purchaseNote,
                external_button_text: values.externalButtonText,
            },
        ],
        category_ids: values.categoryIds,
        tag_ids: values.tagIds,
        brand_ids: values.brandId === null ? [] : [values.brandId],
        image_media_ids: values.imageMediaIds,
        upsell_ids: values.upsellIds,
        cross_sell_ids: values.crossSellIds,
        grouped_member_ids: values.groupedMemberIds,
        downloads: values.downloads.map((d) => ({
            ...(d.id !== undefined ? { id: d.id } : {}),
            media_id: d.mediaId,
            file_label: d.fileLabel,
            download_limit: d.downloadLimit,
            download_expiry_days: d.downloadExpiryDays,
            position: d.position,
        })),
        attribute_links: values.attributeLinks.map((link, i) => ({
            attribute_id: link.attributeId,
            position: link.position === 0 ? i : link.position,
            visible: link.visible,
            used_for_variation: link.usedForVariation,
            term_ids: link.termIds,
        })),
        default_variation_id: values.defaultVariationId,
    };
}
