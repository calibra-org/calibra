import cache from "@adonisjs/cache/services/main";

import { CacheTags } from "#services/cache_keys";
import { recordCacheInvalidate } from "#services/metrics/domain_metrics";

/**
 * Acting tenant id, required on every invalidation. The tags it deletes are tenant-namespaced
 * (`tenantSegment(tenantId):…`), so a write must invalidate **its own** tenant's tags — a global or
 * wrong-tenant delete would leave another tenant serving stale data. Every write path here runs
 * under `tenant_context_middleware`, so callers pass `currentTenantId()`.
 */
type TenantId = number | string | bigint;

/**
 * Thin wrappers around `cache.deleteByTag` named for the *intent* of the write. Centralising
 * here keeps every controller's mental model "I wrote a product, so I invalidate the product
 * cache" without each controller needing to remember which tags it owns. Update the mapping in
 * one place and every caller catches up.
 *
 * Each call also ticks the `calibra_cache_operations_total{outcome="invalidate"}` counter so
 * the cache-and-queue dashboard panels reflect write-driven evictions. We do this here rather
 * than at the Bentocache-event layer because `cache:deleted` fires per-key (after fan-out from
 * a tag delete), which would over-count by 10–100× per write.
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
    productChanged: async (tenantId: TenantId, productId: bigint | number): Promise<void> => {
        const tags = [CacheTags.catalogProducts(tenantId), CacheTags.catalogProduct(tenantId, Number(productId))];
        await cache.deleteByTag({ tags });
        recordCacheInvalidate(tags);
    },

    /** Batch product write — invalidate the list once + each per-id tag. */
    productsChanged: async (tenantId: TenantId, productIds: ReadonlyArray<bigint | number>): Promise<void> => {
        const tags = [
            CacheTags.catalogProducts(tenantId),
            ...productIds.map((id) => CacheTags.catalogProduct(tenantId, Number(id))),
        ];
        if (tags.length === 0) return;
        await cache.deleteByTag({ tags });
        recordCacheInvalidate(tags);
    },

    /**
     * Taxonomy write (category, tag, brand, attribute, attribute term). The blast radius is fine
     * here — these change rarely, hitting every cached taxonomy response on a single write is
     * cheaper than maintaining per-resource keys.
     */
    taxonomyChanged: async (tenantId: TenantId): Promise<void> => {
        const tags = [CacheTags.catalogTaxonomy(tenantId), CacheTags.catalogCategories(tenantId)];
        await cache.deleteByTag({ tags });
        recordCacheInvalidate(tags);
    },

    /** Customer write (admin CRUD, order state transitions, refunds). */
    customerChanged: async (tenantId: TenantId, customerId: bigint | number | null | undefined): Promise<void> => {
        const tags: string[] = [
            CacheTags.adminCustomers(tenantId),
            CacheTags.adminReports(tenantId),
            CacheTags.regionalProvinces(tenantId),
        ];
        if (customerId !== null && customerId !== undefined) {
            tags.push(CacheTags.adminCustomer(tenantId, Number(customerId)));
        }
        await cache.deleteByTag({ tags });
        recordCacheInvalidate(tags);
    },

    /** Shipping zone / method / rate write. */
    shippingZonesChanged: async (tenantId: TenantId): Promise<void> => {
        const tags = [CacheTags.shippingZones(tenantId)];
        await cache.deleteByTag({ tags });
        recordCacheInvalidate(tags);
    },
} as const;
