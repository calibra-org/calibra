import { z } from "zod";

import type { AdminProductDetailView } from "#/lib/adapters/product-detail";

/**
 * Zod schema for the full product detail form. Money is kept as Toman MAJOR units (the input
 * layer renders Toman; the submit adapter multiplies ×10 to convert back to Rial minor units).
 * Dates are ISO strings (UTC); the Jalali date input handles display conversion.
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
        translations: z.object({
            fa: z.object({
                name: z.string().min(1, "name_required").max(300),
                slug: z.string().min(1).max(320),
                description: z.string().nullable(),
                shortDescription: z.string().max(500).nullable(),
                purchaseNote: z.string().max(2000).nullable(),
                externalButtonText: z.string().max(120).nullable(),
            }),
            en: z.object({
                name: z.string().max(300),
                slug: z.string().max(320),
                description: z.string().nullable(),
                shortDescription: z.string().max(500).nullable(),
                purchaseNote: z.string().max(2000).nullable(),
                externalButtonText: z.string().max(120).nullable(),
            }),
        }),
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
    })
    .refine(
        (data) => data.salePriceToman === null || data.regularPriceToman === null || data.salePriceToman < data.regularPriceToman,
        {
            message: "sale_price_must_be_below_regular",
            path: ["salePriceToman"],
        },
    );

export type ProductDetailFormValues = z.infer<typeof productDetailSchema>;

/** Default values for the New Product flow. Persian-first; ready for the operator to fill in. */
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
        translations: {
            fa: { name: "", slug: "", description: null, shortDescription: null, purchaseNote: null, externalButtonText: null },
            en: { name: "", slug: "", description: null, shortDescription: null, purchaseNote: null, externalButtonText: null },
        },
        categoryIds: [],
        tagIds: [],
        brandId: null,
        imageMediaIds: [],
        upsellIds: [],
        crossSellIds: [],
        groupedMemberIds: [],
        downloads: [],
    };
}

/**
 * Maps the loaded server-side product into form values. Rial-minor prices become Toman major
 * via /10. Translations get bucketed by locale (fa/en); a missing locale becomes empty strings.
 */
export function productToFormValues(p: AdminProductDetailView): ProductDetailFormValues {
    const fa = p.translations.find((t) => t.locale === "fa");
    const en = p.translations.find((t) => t.locale === "en");
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
        translations: {
            fa: {
                name: fa?.name ?? "",
                slug: fa?.slug ?? "",
                description: fa?.description ?? null,
                shortDescription: fa?.shortDescription ?? null,
                purchaseNote: fa?.purchaseNote ?? null,
                externalButtonText: fa?.externalButtonText ?? null,
            },
            en: {
                name: en?.name ?? "",
                slug: en?.slug ?? "",
                description: en?.description ?? null,
                shortDescription: en?.shortDescription ?? null,
                purchaseNote: en?.purchaseNote ?? null,
                externalButtonText: en?.externalButtonText ?? null,
            },
        },
        categoryIds: p.categoryIds,
        tagIds: p.tagIds,
        brandId: p.brandId,
        imageMediaIds: p.images.map((img) => img.mediaId),
        upsellIds: p.upsellIds,
        crossSellIds: p.crossSellIds,
        groupedMemberIds: p.groupedMemberIds,
        downloads: p.downloads.map((d) => ({
            id: d.id,
            mediaId: d.mediaId,
            fileLabel: d.fileLabel,
            downloadLimit: d.downloadLimit,
            downloadExpiryDays: d.downloadExpiryDays,
            position: d.position,
        })),
    };
}

/**
 * Map form values to the wire payload the API understands. Toman → Rial. Translations packed
 * into the array shape `[{ locale: "fa", … }, { locale: "en", … }]` (English is skipped when
 * empty so the API doesn't create an empty translation row).
 */
export function formValuesToPayload(values: ProductDetailFormValues): Record<string, unknown> {
    const translations: Record<string, unknown>[] = [];
    if (values.translations.fa.name.length > 0) {
        translations.push({
            locale: "fa",
            name: values.translations.fa.name,
            slug: values.translations.fa.slug,
            description: values.translations.fa.description,
            short_description: values.translations.fa.shortDescription,
            purchase_note: values.translations.fa.purchaseNote,
            external_button_text: values.translations.fa.externalButtonText,
        });
    }
    if (values.translations.en.name.length > 0) {
        translations.push({
            locale: "en",
            name: values.translations.en.name,
            slug: values.translations.en.slug,
            description: values.translations.en.description,
            short_description: values.translations.en.shortDescription,
            purchase_note: values.translations.en.purchaseNote,
            external_button_text: values.translations.en.externalButtonText,
        });
    }

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
        translations,
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
    };
}
