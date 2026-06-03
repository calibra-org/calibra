import cache from "@adonisjs/cache/services/main";
import db from "@adonisjs/lucid/services/db";

import Region from "#models/region";
import type ShippingZone from "#models/shipping_zone";
import { bucketMinor, CacheKeys, CacheTags } from "#services/cache_keys";
import { matchShippingZone } from "#services/shipping_zone_match";
import { currentTenantId } from "#services/tenant_context";

/**
 * Address keys that drive shipping-zone matching. `country` is the only required field; the rest
 * sharpen the match — specificity order is postcode > state > country > continent. The
 * `regionId` is the country-agnostic FK to `regions` — the service resolves it to its `code` for
 * the matcher.
 */
export interface ShippingRateAddress {
    country: string;
    regionId: number | null;
    postcode: string | null;
}

export interface ShippingRateOption {
    /** PK on `shipping_zone_methods` — the value `POST /cart/shipping-rate` accepts. */
    id: number;
    /** Stable code of the underlying registered method (`flat_rate`, `tipax`, …). */
    methodCode: string;
    title: string;
    /** Final cost in minor units after eligibility checks (free_shipping → 0 when min_amount met). */
    cost: number;
    /** Tax behavior on the carrier line. `taxable=true` lets the tax pipeline pick this up. */
    taxable: boolean;
    /** `id` of the matched `shipping_zones` row. */
    zoneId: number;
}

/**
 * Cart subtotal bucket width (in minor units) used by the cache key for {@link enumerateShippingRates}.
 * Two carts whose subtotals share a bucket share a cache slot — the price the storefront shows
 * is identical between them. The cache wrap deliberately uses `grace: undefined` (no graced
 * stale serve) because shipping cost is checkout-critical: better to fail loudly than to charge
 * the wrong amount.
 *
 * **Threshold invariant**: `free_shipping.min_amount` MUST be a multiple of this bucket width.
 * The current configured `free_shipping` rows in the seed are configured per Iranian retail
 * convention (whole-Rial thresholds), so 10,000 minor units (≈100 Rial) is well below any
 * realistic free-shipping threshold and the floor-bucket can never drift the `itemsTotal < min`
 * decision. If a future operator sets `min_amount` to a non-multiple, the bucket can produce a
 * cart that sees free-shipping when it shouldn't; the {@link bucketShippingTotal} comment is the
 * place to revisit when that day comes.
 */
const SHIPPING_TOTAL_BUCKET_MINOR = 10_000;

/**
 * Enumerate every shipping rate the storefront should show for `address`. Returns an empty array
 * when no matching zone (and no fallback) is configured — the controller should surface this as
 * "no shipping options available" rather than treating it as a system error.
 *
 * `itemsTotal` (cart subtotal in minor units, pre-discount) is required because `free_shipping`
 * eligibility checks against its `min_amount` setting; passing `0` is safe and matches the
 * "before any items are added" UX where free_shipping should not appear yet.
 *
 * Cached 5 minutes, tagged `shipping:zones`, **no grace** — see {@link SHIPPING_TOTAL_BUCKET_MINOR}
 * for why. Any shipping zone / method / rate write must `cache.deleteByTag({ tags: [shipping:zones] })`.
 */
export async function enumerateShippingRates(address: ShippingRateAddress, itemsTotal: number): Promise<ShippingRateOption[]> {
    const key = CacheKeys.shipping.rates(currentTenantId(), {
        country: address.country,
        regionId: address.regionId,
        postcode: address.postcode,
        itemsTotalBucket: bucketShippingTotal(itemsTotal),
    });
    return cache.getOrSet({
        key,
        ttl: "5m",
        grace: undefined,
        tags: [CacheTags.shippingZones(currentTenantId())],
        factory: async () => {
            const zone = await resolveZone(address);
            if (!zone) return [];

            const rows = await db
                .from("shipping_zone_methods as szm")
                .innerJoin("shipping_methods as sm", "sm.id", "szm.method_id")
                .where("szm.zone_id", Number(zone.id))
                .where("szm.enabled", true)
                .select(
                    "szm.id as id",
                    "szm.title_override as title_override",
                    "szm.settings as settings",
                    "szm.ordering as ordering",
                    "sm.code as code",
                    "sm.title_default as title_default",
                )
                .orderBy("szm.ordering", "asc");

            const options: ShippingRateOption[] = [];
            for (const row of rows) {
                const settings = parseSettings(row.settings);
                const resolved = resolveMethodCost(row.code, settings, itemsTotal);
                if (!resolved) continue;
                options.push({
                    id: Number(row.id),
                    methodCode: row.code,
                    title: (row.title_override ?? row.title_default) as string,
                    cost: resolved.cost,
                    taxable: resolved.taxable,
                    zoneId: Number(zone.id),
                });
            }
            return options;
        },
    });
}

function bucketShippingTotal(itemsTotal: number): string {
    return bucketMinor(itemsTotal, SHIPPING_TOTAL_BUCKET_MINOR);
}

/**
 * Look up a single rate by id and confirm it's eligible for `address` + `itemsTotal`. Used by
 * `POST /cart/shipping-rate` to validate the selection before saving it on the cart. Returns the
 * option when valid; returns `null` when the rate is disabled, belongs to a different zone, or
 * fails its min-amount check.
 */
export async function findEligibleRate(
    address: ShippingRateAddress,
    shippingZoneMethodId: number,
    itemsTotal: number,
): Promise<ShippingRateOption | null> {
    const eligible = await enumerateShippingRates(address, itemsTotal);
    return eligible.find((option) => option.id === shippingZoneMethodId) ?? null;
}

async function resolveZone(address: ShippingRateAddress): Promise<ShippingZone | null> {
    const regionCode = address.regionId === null ? null : await loadRegionCode(address.regionId);
    return matchShippingZone({
        country: address.country.toUpperCase(),
        regionCode,
        postcode: address.postcode,
        continent: null,
    });
}

async function loadRegionCode(regionId: number): Promise<string | null> {
    const region = await Region.find(regionId);
    return region?.code ?? null;
}

interface ResolvedMethodCost {
    cost: number;
    taxable: boolean;
}

/**
 * Translate a method's settings JSONB into a final delivered cost given the cart's running items
 * total. Returns `null` when the method is conditionally unavailable (e.g. `free_shipping` whose
 * `min_amount` is not met) so the enumerator filters it out cleanly. The default `taxable=true`
 * matches the Woo convention — operators flip it off through `taxable: false` in the settings
 * blob; the cart respects the shipping tax line only when `tax_rates.applies_to_shipping=true`.
 */
function resolveMethodCost(code: string, settings: Record<string, unknown>, itemsTotal: number): ResolvedMethodCost | null {
    const taxable = settings.taxable === undefined ? true : Boolean(settings.taxable);
    if (code === "free_shipping") {
        const minAmount = toNumber(settings.min_amount, 0);
        if (itemsTotal < minAmount) return null;
        return { cost: 0, taxable };
    }
    const cost = toNumber(settings.cost, 0);
    return { cost, taxable };
}

function parseSettings(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return {};
}

function toNumber(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}
