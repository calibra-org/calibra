import { createHash } from "node:crypto";

/**
 * Single source of truth for every Bentocache key and tag the API touches. Centralising the
 * shape lets a write path stay honest with its read path — when a new endpoint adds a tag, the
 * matching invalidation call has somewhere obvious to land, instead of an inline string template
 * in a controller that nobody can grep for at refactor time.
 *
 * Key shape: `<domain>:<resource>:<scope>:<hash-of-params>:<locale>`. Every key includes the
 * locale segment because Persian and English responses are different bytes and must not share
 * a slot. Filter params are run through {@link hashFilters} which **sorts and normalises** them
 * first — `?category=shoes&page=1` and `?page=1&category=shoes` collide on the same key.
 */

/**
 * Tenant cache-key namespace. Every per-tenant cache key + tag must be prefixed with this so two
 * tenants never share a cache slot (a stale read across tenants is a data leak, not just staleness).
 * `null`/`undefined` (a global or un-tenanted path) collapses to `"global"`. Phase 2 threads this
 * through every remaining per-tenant cache caller; Phase 1 wires it into `settings_service`.
 */
export function tenantSegment(tenantId: number | string | bigint | null | undefined): string {
    return tenantId === null || tenantId === undefined ? "global" : `t${String(tenantId)}`;
}

/**
 * A tenant id is required everywhere a per-tenant cache key/tag is built. It is **not** nullable:
 * every cached read/write in this codebase runs under `tenant_context_middleware` (request) or a
 * `runWithTenant` block (job/seeder), so `currentTenantId()` is always available at the call site.
 * Making it required turns a forgotten argument into a compile error instead of a silent
 * cross-tenant cache leak.
 */
type TenantId = number | string | bigint;

/** Tag constants. Use these — never inline string tags in controllers or write paths. */
export const CacheTags = {
    /** Tenant registry / host→tenant resolution map. Invalidated when a tenant or domain changes (Phase 5). */
    tenants: "tenant:registry",
    catalogProducts: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:catalog:products`,
    catalogProduct: (tenantId: TenantId, productId: number | string | bigint): string =>
        `${tenantSegment(tenantId)}:catalog:product:${String(productId)}`,
    catalogCategories: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:catalog:categories`,
    catalogTaxonomy: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:catalog:taxonomy`,
    shippingZones: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:shipping:zones`,
    settingsGroup: (group: string, tenantId?: number | string | bigint | null): string =>
        `${tenantSegment(tenantId)}:settings:${group}`,
    currency: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:currency:config`,
    adminReports: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:admin:reports`,
    adminCustomers: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:admin:customers`,
    adminCustomer: (tenantId: TenantId, customerId: number | string | bigint): string =>
        `${tenantSegment(tenantId)}:admin:customer:${String(customerId)}`,
    regionalProvinces: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:regional:provinces`,
    regionalProvince: (tenantId: TenantId, code: string): string => `${tenantSegment(tenantId)}:regional:province:${code}`,
} as const;

/**
 * Stable hash of a filter object. Keys are sorted, values normalised (numbers coerced from
 * numeric strings, strings lowercased+trimmed, booleans coerced, nullish dropped) before
 * stringification, so the same filter shape always produces the same hash regardless of how
 * the caller assembled the inputs.
 *
 * Returns the first 12 hex chars of a sha1 — collisions are not a correctness risk (a collision
 * just means two distinct filter shapes share a cache slot, which surfaces as one of them
 * appearing stale until TTL expiry; never a data-leak). 12 chars over the space of expected
 * filter shapes (low thousands) is comfortably safe.
 */
export function hashFilters(filters: Record<string, unknown>): string {
    const normalised: Array<[string, unknown]> = [];
    for (const rawKey of Object.keys(filters).sort()) {
        const value = normaliseValue(filters[rawKey]);
        if (value === undefined) continue;
        normalised.push([rawKey, value]);
    }
    return createHash("sha1").update(JSON.stringify(normalised)).digest("hex").slice(0, 12);
}

/**
 * Drop a value into a deterministic bucket so two requests with marginally different inputs
 * still share a key. Used by shipping rate enumeration to collapse small cart-total variations.
 * Returns a string suffix safe to embed in a cache key (no colons).
 */
export function bucketMinor(amount: number, bucketSize: number): string {
    if (!Number.isFinite(amount) || amount <= 0) return "0";
    return String(Math.floor(amount / bucketSize) * bucketSize);
}

function normaliseValue(value: unknown): unknown {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return undefined;
        if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
        if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
        if (trimmed === "true" || trimmed === "false") return trimmed === "true";
        return trimmed.toLowerCase();
    }
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        const items = value.map(normaliseValue).filter((v) => v !== undefined);
        if (items.length === 0) return undefined;
        items.sort();
        return items;
    }
    if (typeof value === "object") {
        const inner: Array<[string, unknown]> = [];
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
            const v = normaliseValue((value as Record<string, unknown>)[k]);
            if (v !== undefined) inner.push([k, v]);
        }
        return inner.length === 0 ? undefined : inner;
    }
    return undefined;
}

/** Typed key builders, grouped by domain. Use these from every caller. */
export const CacheKeys = {
    catalog: {
        productList: (tenantId: TenantId, filters: Record<string, unknown>, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:products:list:${hashFilters(filters)}:${locale}`,
        productDetail: (tenantId: TenantId, slugOrId: string | number | bigint, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:products:detail:${String(slugOrId)}:${locale}`,
        productVariations: (tenantId: TenantId, productId: number | string | bigint, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:products:variations:${String(productId)}:${locale}`,
        categoriesFlat: (tenantId: TenantId, parentId: string | null | undefined, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:categories:flat:${parentId === null ? "null" : (parentId ?? "any")}:${locale}`,
        categoriesTree: (tenantId: TenantId, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:categories:tree:${locale}`,
        categoryDetail: (tenantId: TenantId, slug: string, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:categories:detail:${slug}:${locale}`,
        tags: (tenantId: TenantId, locale: string): string => `${tenantSegment(tenantId)}:catalog:taxonomy:tags:${locale}`,
        brands: (tenantId: TenantId, locale: string): string => `${tenantSegment(tenantId)}:catalog:taxonomy:brands:${locale}`,
        attributes: (tenantId: TenantId, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:taxonomy:attributes:${locale}`,
        attributeTerms: (tenantId: TenantId, attributeId: number | string | bigint, locale: string): string =>
            `${tenantSegment(tenantId)}:catalog:taxonomy:attribute_terms:${String(attributeId)}:${locale}`,
    },
    shipping: {
        rates: (
            tenantId: TenantId,
            params: {
                country: string;
                regionId: number | null;
                postcode: string | null;
                itemsTotalBucket: string;
            },
        ): string => {
            const country = params.country.toUpperCase();
            const region = params.regionId === null ? "-" : String(params.regionId);
            const postcode = params.postcode === null || params.postcode === "" ? "-" : params.postcode;
            return `${tenantSegment(tenantId)}:shipping:rates:${country}:${region}:${postcode}:${params.itemsTotalBucket}`;
        },
    },
    settings: {
        group: (group: string, tenantId?: number | string | bigint | null): string =>
            `${tenantSegment(tenantId)}:settings:group:${group}`,
    },
    /** Host/slug → tenant resolution, used by tenant_context_middleware (short TTL, tag: CacheTags.tenants). */
    tenant: {
        byHost: (host: string): string => `tenant:host:${host.toLowerCase()}`,
        byRef: (ref: string | number | bigint): string => `tenant:ref:${String(ref).toLowerCase()}`,
    },
    currency: {
        config: (tenantId: TenantId, locale: string): string => `${tenantSegment(tenantId)}:currency:config:${locale}`,
    },
    admin: {
        topProducts: (tenantId: TenantId, days: number, limit: number, locale: string): string =>
            `${tenantSegment(tenantId)}:admin:reports:top-products:${days}:${limit}:${locale}`,
        topCategories: (tenantId: TenantId, days: number, limit: number, locale: string): string =>
            `${tenantSegment(tenantId)}:admin:reports:top-categories:${days}:${limit}:${locale}`,
        /**
         * Analytics report cache key. `scope` is the report id (`performance`, `revenue-stats`,
         * `orders-table`, …); `params` is the full window/sort/page object hashed into one slot so
         * `?date_from=…&date_to=…` and any reordering collide. Locale-scoped because category /
         * coupon / tax names resolve per locale.
         */
        report: (tenantId: TenantId, scope: string, params: Record<string, unknown>, locale: string): string =>
            `${tenantSegment(tenantId)}:admin:reports:${scope}:${hashFilters(params)}:${locale}`,
        /**
         * Most-used ranking for the admin taxonomy pickers (categories / tags / brands sidebar
         * cards on `/products/{id}`). Hashes the full filter object so `?perPage=10&sort=-used_count`
         * and `?sort=-used_count&perPage=10` collide. Locale-scoped because the resolved name /
         * slug fields differ per locale.
         */
        taxonomyUsedCount: (
            tenantId: TenantId,
            resource: "categories" | "tags" | "brands",
            filters: Record<string, unknown>,
            locale: string,
        ): string => `${tenantSegment(tenantId)}:admin:taxonomy:used-count:${resource}:${hashFilters(filters)}:${locale}`,
        customerCounts: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:admin:customers:counts`,
        customerInsights: (tenantId: TenantId): string => `${tenantSegment(tenantId)}:admin:insights:customers`,
        customerStats: (tenantId: TenantId, customerId: number | string | bigint): string =>
            `${tenantSegment(tenantId)}:admin:customers:stats:${String(customerId)}`,
        customerAggregate: (tenantId: TenantId, customerId: number | string | bigint): string =>
            `${tenantSegment(tenantId)}:admin:customers:aggregate:${String(customerId)}`,
        regionalProvinces: (tenantId: TenantId, filters: Record<string, unknown>, locale: string): string =>
            `${tenantSegment(tenantId)}:admin:insights:regional:provinces:${hashFilters(filters)}:${locale}`,
        regionalProvinceDetail: (tenantId: TenantId, code: string, filters: Record<string, unknown>, locale: string): string =>
            `${tenantSegment(tenantId)}:admin:insights:regional:province:${code}:${hashFilters(filters)}:${locale}`,
    },
} as const;
