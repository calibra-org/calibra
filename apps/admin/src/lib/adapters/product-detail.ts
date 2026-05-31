import type { AdminSchemas } from "@calibra/sdk";

import type { AdminMediaVariants } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminProductDetail = Schemas["AdminProductDetail"];

export interface ProductTranslationView {
    locale: string;
    name: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    purchaseNote: string | null;
    externalButtonText: string | null;
}

export interface ProductDownloadView {
    id?: number;
    mediaId: number;
    fileLabel: string;
    downloadLimit: number | null;
    downloadExpiryDays: number | null;
    position: number;
    url: string | null;
}

export interface ProductImageView {
    id: number;
    mediaId: number;
    position: number;
    url: string | null;
    alt: string | null;
    variants: AdminMediaVariants | null;
}

export interface ProductInventoryLocationView {
    id: number;
    locationId: number | null;
    stockQuantity: number;
    manageStock: boolean;
    lowStockThreshold: number | null;
    backorders: "no" | "notify" | "yes";
    stockStatus: "instock" | "outofstock" | "onbackorder";
}

export interface AdminProductDetailView {
    id: number;
    type: "simple" | "variable" | "grouped" | "external";
    sku: string | null;
    gtin: string | null;
    status: "draft" | "publish" | "pending" | "private";
    catalogVisibility: "visible" | "catalog" | "search" | "hidden";
    featured: boolean;
    virtual: boolean;
    downloadable: boolean;
    regularPriceMinor: number | null;
    salePriceMinor: number | null;
    saleStartsAt: string | null;
    saleEndsAt: string | null;
    taxClassId: number | null;
    taxStatus: "taxable" | "shipping" | "none";
    shippingClassId: number | null;
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    soldIndividually: boolean;
    reviewsAllowed: boolean;
    externalUrl: string | null;
    menuOrder: number;
    posAvailable: boolean;
    images: ProductImageView[];
    galleryImageUrls: string[];
    inventoryLocations: ProductInventoryLocationView[];
    inventoryTotal: number;
    lowStock: boolean;
    defaultLowStockThreshold: number;
    translations: ProductTranslationView[];
    categoryIds: number[];
    tagIds: number[];
    brandId: number | null;
    upsellIds: number[];
    crossSellIds: number[];
    groupedMemberIds: number[];
    downloads: ProductDownloadView[];
    attributeLinks: {
        attributeId: number;
        position: number;
        visible: boolean;
        usedForVariation: boolean;
        displayType: "dropdown" | "pills" | "color_swatch" | "image_swatch";
        termIds: number[];
    }[];
    customAttributes: {
        id: number;
        position: number;
        name: string;
        values: string[];
        visible: boolean;
    }[];
    defaultVariationId: number | null;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

const PRODUCT_TYPES = new Set(["simple", "variable", "grouped", "external"]);

/**
 * SDK `AdminProductDetail` → admin view shape. Keeps Rial minor units on the wire and only
 * normalises shape (snake_case → camelCase, nullable narrowing). The form layer is where
 * Toman conversion happens, so the adapter stays a pure rename.
 */
export function toAdminProductDetail(p: SdkAdminProductDetail): AdminProductDetailView {
    const type = PRODUCT_TYPES.has(p.type) ? (p.type as AdminProductDetailView["type"]) : "simple";
    const inventory = p.inventory as
        | undefined
        | {
              total?: number;
              low_stock?: boolean;
              default_low_stock_threshold?: number;
              locations?: {
                  id: number;
                  location_id: number | null;
                  stock_quantity: number;
                  manage_stock: boolean;
                  low_stock_threshold: number | null;
                  backorders: "no" | "notify" | "yes";
                  stock_status: "instock" | "outofstock" | "onbackorder";
              }[];
          };
    return {
        id: Number(p.id),
        type,
        sku: p.sku ?? null,
        gtin: (p as { gtin?: string | null }).gtin ?? null,
        status: ((p as { status?: string }).status ?? "draft") as AdminProductDetailView["status"],
        catalogVisibility: ((p as { catalog_visibility?: string }).catalog_visibility ??
            "visible") as AdminProductDetailView["catalogVisibility"],
        featured: Boolean(p.featured),
        virtual: Boolean((p as { virtual?: boolean }).virtual),
        downloadable: Boolean((p as { downloadable?: boolean }).downloadable),
        regularPriceMinor: p.regular_price === null || p.regular_price === undefined ? null : Number(p.regular_price),
        salePriceMinor: p.sale_price === null || p.sale_price === undefined ? null : Number(p.sale_price),
        saleStartsAt: (p as { sale_starts_at?: string | null }).sale_starts_at ?? null,
        saleEndsAt: (p as { sale_ends_at?: string | null }).sale_ends_at ?? null,
        taxClassId:
            (p as { tax_class_id?: number | null }).tax_class_id === null ||
            (p as { tax_class_id?: number | null }).tax_class_id === undefined
                ? null
                : Number((p as { tax_class_id: number }).tax_class_id),
        taxStatus: ((p as { tax_status?: string }).tax_status ?? "taxable") as AdminProductDetailView["taxStatus"],
        shippingClassId:
            (p as { shipping_class_id?: number | null }).shipping_class_id === null ||
            (p as { shipping_class_id?: number | null }).shipping_class_id === undefined
                ? null
                : Number((p as { shipping_class_id: number }).shipping_class_id),
        weightGrams: (p as { weight_grams?: number | null }).weight_grams ?? null,
        lengthMm: (p as { length_mm?: number | null }).length_mm ?? null,
        widthMm: (p as { width_mm?: number | null }).width_mm ?? null,
        heightMm: (p as { height_mm?: number | null }).height_mm ?? null,
        soldIndividually: Boolean((p as { sold_individually?: boolean }).sold_individually),
        reviewsAllowed: (p as { reviews_allowed?: boolean }).reviews_allowed ?? true,
        externalUrl: (p as { external_url?: string | null }).external_url ?? null,
        menuOrder: Number((p as { menu_order?: number }).menu_order ?? 0),
        posAvailable: (p as { pos_available?: boolean }).pos_available ?? true,
        images: ((p as { images?: SdkAdminProductDetail["images"] }).images ?? []).map((img) => ({
            id: Number(img.id),
            mediaId: Number(img.media_id),
            position: Number(img.position),
            url: img.url ?? null,
            alt: (img as { alt?: string | null }).alt ?? null,
            variants: ((img as { variants?: unknown }).variants ?? null) as AdminMediaVariants | null,
        })),
        galleryImageUrls: (p as { gallery_image_urls?: string[] }).gallery_image_urls ?? [],
        inventoryLocations: (inventory?.locations ?? []).map((loc) => ({
            id: Number(loc.id),
            locationId: loc.location_id === null ? null : Number(loc.location_id),
            stockQuantity: Number(loc.stock_quantity),
            manageStock: Boolean(loc.manage_stock),
            lowStockThreshold: loc.low_stock_threshold === null ? null : Number(loc.low_stock_threshold),
            backorders: loc.backorders,
            stockStatus: loc.stock_status,
        })),
        inventoryTotal: Number(inventory?.total ?? 0),
        lowStock: Boolean(inventory?.low_stock),
        defaultLowStockThreshold: Number(inventory?.default_low_stock_threshold ?? 5),
        translations: ((p as { translations?: SdkAdminProductDetail["translations"] }).translations ?? []).map((t) => ({
            locale: t.locale ?? "fa",
            name: t.name ?? "",
            slug: t.slug ?? "",
            description: t.description ?? null,
            shortDescription: t.short_description ?? null,
            purchaseNote: t.purchase_note ?? null,
            externalButtonText: t.external_button_text ?? null,
        })),
        categoryIds: ((p as { categories?: { id: number }[] }).categories ?? []).map((c) => Number(c.id)),
        tagIds: ((p as { tags?: { id: number }[] }).tags ?? []).map((t) => Number(t.id)),
        brandId: (() => {
            const brands = (p as { brands?: { id: number }[] }).brands ?? [];
            return brands.length > 0 ? Number(brands[0]!.id) : null;
        })(),
        upsellIds: (p as { upsell_ids?: number[] }).upsell_ids ?? [],
        crossSellIds: (p as { cross_sell_ids?: number[] }).cross_sell_ids ?? [],
        groupedMemberIds: (p as { grouped_member_ids?: number[] }).grouped_member_ids ?? [],
        attributeLinks: (
            (
                p as {
                    attribute_links?: {
                        attribute_id: number;
                        position: number;
                        visible: boolean;
                        used_for_variation: boolean;
                        display_type?: "dropdown" | "pills" | "color_swatch" | "image_swatch";
                        term_ids: number[];
                    }[];
                }
            ).attribute_links ?? []
        ).map((row) => ({
            attributeId: Number(row.attribute_id),
            position: Number(row.position),
            visible: Boolean(row.visible),
            usedForVariation: Boolean(row.used_for_variation),
            displayType: row.display_type ?? "dropdown",
            termIds: (row.term_ids ?? []).map((id) => Number(id)),
        })),
        customAttributes: (
            (
                p as {
                    custom_attributes?: {
                        id: number;
                        position: number;
                        name: string;
                        values: string[];
                        visible: boolean;
                    }[];
                }
            ).custom_attributes ?? []
        ).map((row) => ({
            id: Number(row.id),
            position: Number(row.position),
            name: row.name,
            values: Array.isArray(row.values) ? row.values.map((v) => String(v)) : [],
            visible: Boolean(row.visible),
        })),
        defaultVariationId:
            (p as { default_variation_id?: number | null }).default_variation_id === null ||
            (p as { default_variation_id?: number | null }).default_variation_id === undefined
                ? null
                : Number((p as { default_variation_id: number }).default_variation_id),
        downloads: (
            (
                p as {
                    downloads?: {
                        id: number;
                        media_id: number;
                        file_label: string;
                        download_limit?: number | null;
                        download_expiry_days?: number | null;
                        position: number;
                        url?: string | null;
                    }[];
                }
            ).downloads ?? []
        ).map((d) => ({
            id: Number(d.id),
            mediaId: Number(d.media_id),
            fileLabel: d.file_label,
            downloadLimit: d.download_limit ?? null,
            downloadExpiryDays: d.download_expiry_days ?? null,
            position: Number(d.position),
            url: d.url ?? null,
        })),
        createdAt: p.created_at ?? new Date().toISOString(),
        updatedAt: p.updated_at ?? p.created_at ?? new Date().toISOString(),
        deletedAt: (p as { deleted_at?: string | null }).deleted_at ?? null,
    };
}
