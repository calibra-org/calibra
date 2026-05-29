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

/** Tag constants. Use these — never inline string tags in controllers or write paths. */
export const CacheTags = {
    catalogProducts: "catalog:products",
    catalogProduct: (productId: number | string | bigint): `catalog:product:${string}` => `catalog:product:${String(productId)}`,
    catalogCategories: "catalog:categories",
    catalogTaxonomy: "catalog:taxonomy",
    shippingZones: "shipping:zones",
    settingsGroup: (group: string): `settings:${string}` => `settings:${group}`,
    currency: "currency:config",
    adminReports: "admin:reports",
    adminCustomers: "admin:customers",
    adminCustomer: (customerId: number | string | bigint): `admin:customer:${string}` => `admin:customer:${String(customerId)}`,
    regionalProvinces: "regional:provinces",
    regionalProvince: (code: string): `regional:province:${string}` => `regional:province:${code}`,
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
        productList: (filters: Record<string, unknown>, locale: string): string =>
            `catalog:products:list:${hashFilters(filters)}:${locale}`,
        productDetail: (slugOrId: string | number | bigint, locale: string): string =>
            `catalog:products:detail:${String(slugOrId)}:${locale}`,
        productVariations: (productId: number | string | bigint, locale: string): string =>
            `catalog:products:variations:${String(productId)}:${locale}`,
        categoriesFlat: (parentId: string | null | undefined, locale: string): string =>
            `catalog:categories:flat:${parentId === null ? "null" : (parentId ?? "any")}:${locale}`,
        categoriesTree: (locale: string): string => `catalog:categories:tree:${locale}`,
        categoryDetail: (slug: string, locale: string): string => `catalog:categories:detail:${slug}:${locale}`,
        tags: (locale: string): string => `catalog:taxonomy:tags:${locale}`,
        brands: (locale: string): string => `catalog:taxonomy:brands:${locale}`,
        attributes: (locale: string): string => `catalog:taxonomy:attributes:${locale}`,
        attributeTerms: (attributeId: number | string | bigint, locale: string): string =>
            `catalog:taxonomy:attribute_terms:${String(attributeId)}:${locale}`,
    },
    shipping: {
        rates: (params: {
            country: string;
            regionId: number | null;
            postcode: string | null;
            itemsTotalBucket: string;
        }): string => {
            const country = params.country.toUpperCase();
            const region = params.regionId === null ? "-" : String(params.regionId);
            const postcode = params.postcode === null || params.postcode === "" ? "-" : params.postcode;
            return `shipping:rates:${country}:${region}:${postcode}:${params.itemsTotalBucket}`;
        },
    },
    settings: {
        group: (group: string): string => `settings:group:${group}`,
    },
    currency: {
        config: (locale: string): string => `currency:config:${locale}`,
    },
    admin: {
        topProducts: (days: number, limit: number, locale: string): string =>
            `admin:reports:top-products:${days}:${limit}:${locale}`,
        /**
         * Most-used ranking for the admin taxonomy pickers (categories / tags / brands sidebar
         * cards on `/products/{id}`). Hashes the full filter object so `?perPage=10&sort=-used_count`
         * and `?sort=-used_count&perPage=10` collide. Locale-scoped because the resolved name /
         * slug fields differ per locale.
         */
        taxonomyUsedCount: (
            resource: "categories" | "tags" | "brands",
            filters: Record<string, unknown>,
            locale: string,
        ): string => `admin:taxonomy:used-count:${resource}:${hashFilters(filters)}:${locale}`,
        customerCounts: (): string => "admin:customers:counts",
        customerInsights: (): string => "admin:insights:customers",
        customerStats: (customerId: number | string | bigint): string => `admin:customers:stats:${String(customerId)}`,
        customerAggregate: (customerId: number | string | bigint): string => `admin:customers:aggregate:${String(customerId)}`,
        regionalProvinces: (filters: Record<string, unknown>, locale: string): string =>
            `admin:insights:regional:provinces:${hashFilters(filters)}:${locale}`,
        regionalProvinceDetail: (code: string, filters: Record<string, unknown>, locale: string): string =>
            `admin:insights:regional:province:${code}:${hashFilters(filters)}:${locale}`,
    },
} as const;
