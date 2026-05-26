import type { AdminSchemas } from "@calibra/sdk";

import type { AdminProduct, LocalizedString, MoneyMinor, ProductStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminProduct = Schemas["AdminProduct"];

const VIEW_PRODUCT_STATUS_MAP: Record<string, ProductStatus> = {
    draft: "draft",
    publish: "publish",
    published: "publish",
    pending: "pending",
    private: "private",
    archived: "draft",
};

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

/**
 * SDK `AdminProduct` → admin view `AdminProduct`. The list endpoint now exposes the full set of
 * extended fields (catalog_visibility, sale schedule, dimensions, inventory aggregate, gallery
 * URLs, gtin, deleted_at) so the view-side struct mirrors them 1:1.
 */
export function toAdminProduct(p: SdkAdminProduct): AdminProduct {
    const status = VIEW_PRODUCT_STATUS_MAP[p.status] ?? "draft";
    const type = (p.type === "virtual" || p.type === "downloadable" ? "simple" : p.type) as AdminProduct["type"];
    const inventory = (p as { inventory?: { total?: number; low_stock?: boolean } }).inventory;
    const galleryUrls = (p as { gallery_image_urls?: string[] }).gallery_image_urls ?? [];
    const gtin = (p as { gtin?: string | null }).gtin ?? null;
    const catalogVisibility = (p as { catalog_visibility?: string }).catalog_visibility ?? "visible";
    const saleStartsAt = (p as { sale_starts_at?: string | null }).sale_starts_at ?? null;
    const saleEndsAt = (p as { sale_ends_at?: string | null }).sale_ends_at ?? null;
    const createdAt = (p as { created_at?: string }).created_at ?? new Date().toISOString();
    const updatedAt = (p as { updated_at?: string }).updated_at ?? createdAt;
    const deletedAt = (p as { deleted_at?: string | null }).deleted_at ?? null;
    return {
        id: p.id,
        sku: p.sku ?? "",
        gtin,
        type,
        status,
        catalogVisibility: catalogVisibility as AdminProduct["catalogVisibility"],
        name: dup(p.name),
        slug: dup(p.slug),
        shortDescription: dup(p.short_description),
        regularPrice: Number(p.regular_price ?? 0) as MoneyMinor,
        salePrice: p.sale_price === null || p.sale_price === undefined ? null : (Number(p.sale_price) as MoneyMinor),
        saleStartsAt,
        saleEndsAt,
        stockQuantity: inventory?.total ?? null,
        stockStatus: "instock",
        manageStock: false,
        lowStock: inventory?.low_stock === true,
        featured: Boolean(p.featured),
        categoryIds: [],
        brandId: null,
        tagIds: [],
        imageUrl: p.featured_image_url ?? null,
        galleryImageUrls: galleryUrls,
        weightGrams: null,
        createdAt,
        updatedAt,
        deletedAt,
    };
}
