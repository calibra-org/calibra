import cache from "@adonisjs/cache/services/main";

import { CacheTags } from "#services/cache_keys";

/**
 * Thin wrappers around `cache.deleteByTag` named for the *intent* of the write. Centralising
 * here keeps every controller's mental model "I wrote a product, so I invalidate the product
 * cache" without each controller needing to remember which tags it owns. Update the mapping in
 * one place and every caller catches up.
 *
 * Listed alphabetically by domain to make grep-driven audits ("which tags fire when X changes?")
 * a one-look exercise.
 */
export const CacheInvalidation = {
    /**
     * Catalog write touched one product (admin product CRUD, variation CRUD). Invalidates both
     * the broad list tag (every paginated product list response) and the per-id tag (product
     * detail + variations endpoints).
     */
    productChanged: async (productId: bigint | number): Promise<void> => {
        await cache.deleteByTag({
            tags: [CacheTags.catalogProducts, CacheTags.catalogProduct(Number(productId))],
        });
    },

    /** Batch product write — invalidate the list once + each per-id tag. */
    productsChanged: async (productIds: ReadonlyArray<bigint | number>): Promise<void> => {
        const tags = [CacheTags.catalogProducts, ...productIds.map((id) => CacheTags.catalogProduct(Number(id)))];
        if (tags.length === 0) return;
        await cache.deleteByTag({ tags });
    },

    /**
     * Taxonomy write (category, tag, brand, attribute, attribute term). The blast radius is fine
     * here — these change rarely, hitting every cached taxonomy response on a single write is
     * cheaper than maintaining per-resource keys.
     */
    taxonomyChanged: async (): Promise<void> => {
        await cache.deleteByTag({ tags: [CacheTags.catalogTaxonomy, CacheTags.catalogCategories] });
    },

    /** Customer write (admin CRUD, order state transitions, refunds). */
    customerChanged: async (customerId: bigint | number | null | undefined): Promise<void> => {
        const tags: string[] = [CacheTags.adminCustomers, CacheTags.adminReports];
        if (customerId !== null && customerId !== undefined) {
            tags.push(CacheTags.adminCustomer(Number(customerId)));
        }
        await cache.deleteByTag({ tags });
    },

    /** Shipping zone / method / rate write. */
    shippingZonesChanged: async (): Promise<void> => {
        await cache.deleteByTag({ tags: [CacheTags.shippingZones] });
    },
} as const;
