import type { AdminSchemas } from "@calibra/sdk";

import type { AdminProduct, LocalizedString, MoneyMinor, ProductStatus } from "#/lib/types";

type Schemas = AdminSchemas["schemas"];
type SdkAdminProduct = Schemas["AdminProduct"];

const VIEW_PRODUCT_STATUS_MAP: Record<string, ProductStatus> = {
    draft: "draft",
    published: "publish",
    archived: "draft",
};

function dup(value: string | null | undefined): LocalizedString {
    const safe = typeof value === "string" ? value : "";
    return { fa: safe, en: safe };
}

/**
 * SDK `AdminProduct` (list shape) → admin view `AdminProduct`. The list endpoint doesn't return
 * relations (categories, brands, tags, dimensions); detail-only fields fall back to empty/default.
 */
export function toAdminProduct(p: SdkAdminProduct): AdminProduct {
    const status = VIEW_PRODUCT_STATUS_MAP[p.status] ?? "draft";
    const type = (p.type === "virtual" || p.type === "downloadable" ? "simple" : p.type) as AdminProduct["type"];
    return {
        id: p.id,
        sku: p.sku ?? "",
        type,
        status,
        name: dup(p.name),
        slug: dup(p.slug),
        shortDescription: dup(p.short_description),
        regularPrice: Number(p.regular_price ?? 0) as MoneyMinor,
        salePrice: p.sale_price === null || p.sale_price === undefined ? null : (Number(p.sale_price) as MoneyMinor),
        stockQuantity: null,
        stockStatus: "instock",
        manageStock: false,
        featured: Boolean(p.featured),
        categoryIds: [],
        brandId: null,
        tagIds: [],
        imageUrl: p.featured_image_url ?? null,
        weightGrams: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
