import { z } from "zod";

import type { AdminProductDetailView } from "#/lib/adapters/product-detail";

/**
 * Zod schema for the product detail form. **Single-language content**: the CMS treats Persian
 * as the only source of truth — `name`, `slug`, `description`, `shortDescription`, `purchaseNote`,
 * and `externalButtonText` live as flat string fields. The API still accepts a `translations[]`
 * array for back-compat, but the admin only ever sends a single `{ locale: "fa", … }` entry; the
 * formValuesToPayload adapter handles the wire shape.
 *
 * Money is kept as BASE MINOR units (Rial) end-to-end — the same unit the API speaks. `MoneyInput`
 * renders the store display currency from the config; no ×10/÷10 happens here. Dates are ISO (UTC).
 */
export const productDetailSchema = z
    .object({
        type: z.enum(["simple", "variable", "grouped", "external"]),
        sku: z.string().nullable(),
        gtin: z.string().nullable(),
        status: z.enum(["draft", "publish", "pending", "private"]),
        catalogVisibility: z.enum(["visible", "catalog", "search", "hidden"]),
        featured: z.boolean(),
        /**
         * Unified "digital / downloadable" flag. On the wire we still write the legacy
         * `virtual` + `downloadable` booleans (the API + reports + invoices read them
         * independently) but the editor exposes a single toggle, so the two server fields are
         * always kept in lock-step. On read we lift either truthy column into `isDigital`.
         */
        isDigital: z.boolean(),
        regularPriceMinor: z.number().min(0).nullable(),
        salePriceMinor: z.number().min(0).nullable(),
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
                displayType: z.enum(["dropdown", "pills", "color_swatch", "image_swatch"]),
                termIds: z.array(z.number()),
            }),
        ),
        customAttributes: z.array(
            z.object({
                id: z.number().optional(),
                name: z.string().min(1).max(200),
                values: z.array(z.string().min(1).max(200)).max(200),
                position: z.number().int().min(0),
                visible: z.boolean(),
            }),
        ),
        defaultVariationId: z.number().nullable(),
    })
    .refine(
        (data) => data.salePriceMinor === null || data.regularPriceMinor === null || data.salePriceMinor < data.regularPriceMinor,
        {
            message: "sale_price_must_be_below_regular",
            path: ["salePriceMinor"],
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
        isDigital: false,
        regularPriceMinor: null,
        salePriceMinor: null,
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
        customAttributes: [],
        defaultVariationId: null,
    };
}

/**
 * Collapse duplicate `attributeLinks` entries by `attribute_id`. The DB enforces a unique
 * `(product_id, attribute_id)` pair, so any save with two rows pointing at the same attribute
 * blows up with a `23505` violation. We keep the LAST entry as the canonical row (it carries
 * the operator's most recent flip of `visible` / `usedForVariation` / `displayType`) and union
 * its `termIds` with the earlier dupes so a value the operator already picked doesn't vanish
 * silently if the same attribute was added twice.
 */
function dedupeAttributeLinks(links: ProductDetailFormValues["attributeLinks"]): ProductDetailFormValues["attributeLinks"] {
    const indexByAttribute = new Map<number, number>();
    const result: ProductDetailFormValues["attributeLinks"] = [];
    for (const link of links) {
        const existingIndex = indexByAttribute.get(link.attributeId);
        if (existingIndex === undefined) {
            indexByAttribute.set(link.attributeId, result.length);
            result.push({ ...link, termIds: [...link.termIds] });
            continue;
        }
        const previous = result[existingIndex]!;
        const mergedTermIds: number[] = [];
        const seen = new Set<number>();
        for (const id of [...previous.termIds, ...link.termIds]) {
            if (seen.has(id)) continue;
            seen.add(id);
            mergedTermIds.push(id);
        }
        result[existingIndex] = { ...link, termIds: mergedTermIds };
    }
    return result;
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
 * falls back to the first available row, then to empty strings. Prices stay in BASE minor units.
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
        isDigital: p.virtual || p.downloadable,
        regularPriceMinor: p.regularPriceMinor,
        salePriceMinor: p.salePriceMinor,
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
        customAttributes: (p.customAttributes ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            values: row.values,
            position: row.position,
            visible: row.visible,
        })),
        defaultVariationId: p.defaultVariationId,
    };
}

/**
 * Map form values to the wire payload the API understands. Prices are already BASE minor. The content fields
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
        virtual: values.isDigital,
        downloadable: values.isDigital,
        regular_price: values.regularPriceMinor,
        sale_price: values.salePriceMinor,
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
        /**
         * `position` mirrors the array index after every drag-reorder, instead of round-tripping
         * the server-side value. The form's array order IS the canonical order; the dedicated
         * `position` column on the wire is what the storefront and admin lists read, so reorders
         * have to write through every save or the new order silently disappears on reload.
         *
         * Dedupe by `attribute_id` before sending. The DB has a unique `(product_id,
         * attribute_id)` constraint, so duplicates introduced by a UI race (e.g. clicking a
         * promote-to-choice while a stale field-array snapshot is in flight) or by bad legacy
         * seed data would otherwise crash the save with a 500 instead of going through. When a
         * dupe shows up, we keep the LAST entry (the operator's most recent edit) and union its
         * term_ids with the earlier one's so no chosen value silently disappears.
         */
        attribute_links: dedupeAttributeLinks(values.attributeLinks).map((link, i) => ({
            attribute_id: link.attributeId,
            position: i,
            visible: link.visible,
            used_for_variation: link.usedForVariation,
            display_type: link.displayType,
            term_ids: link.termIds,
        })),
        custom_attributes: values.customAttributes.map((row, i) => ({
            ...(row.id !== undefined ? { id: row.id } : {}),
            name: row.name,
            values: row.values,
            position: i,
            visible: row.visible,
        })),
        default_variation_id: values.defaultVariationId,
    };
}
