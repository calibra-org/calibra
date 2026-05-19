import db from "@adonisjs/lucid/services/db";

import ShippingZone from "#models/shipping_zone";

/**
 * Address keys the matcher uses to find a shipping zone. `country` is required (ISO-3166-1 alpha-2);
 * everything else is optional and is matched at the level it's present at.
 */
export interface ShippingAddressForMatch {
    country: string;
    regionCode?: string | null;
    postcode?: string | null;
    continent?: string | null;
}

/** Specificity ranks used to break ties when a single address matches multiple zones: postcode > state > country > continent. */
export const SHIPPING_LOCATION_SPECIFICITY = {
    postcode: 4,
    state: 3,
    country: 2,
    continent: 1,
} as const;

export type ShippingLocationType = keyof typeof SHIPPING_LOCATION_SPECIFICITY;

/**
 * Resolve the shipping zone for an address by matching against `shipping_zone_locations`. Ranks the
 * candidate locations by specificity (postcode > state > country > continent) and breaks ties by
 * ascending `zone_id` so two zones declaring the same postcode resolve deterministically.
 *
 * Falls through to the `is_fallback=true` zone when nothing matches. Returns `null` only when no
 * fallback zone exists, which is a seed-data invariant the test suite enforces — production code
 * should treat `null` as a misconfiguration.
 */
export async function matchShippingZone(address: ShippingAddressForMatch): Promise<ShippingZone | null> {
    const conditions: Array<{ type: ShippingLocationType; code: string }> = [];

    if (address.postcode) {
        conditions.push({ type: "postcode", code: address.postcode });
    }
    if (address.regionCode) {
        conditions.push({ type: "state", code: address.regionCode });
    }
    if (address.country) {
        conditions.push({ type: "country", code: address.country });
    }
    if (address.continent) {
        conditions.push({ type: "continent", code: address.continent });
    }

    if (conditions.length > 0) {
        const matched = await db
            .from("shipping_zone_locations")
            .select("zone_id")
            .select(
                db.raw(
                    `CASE type
                       WHEN 'postcode'  THEN ${SHIPPING_LOCATION_SPECIFICITY.postcode}
                       WHEN 'state'     THEN ${SHIPPING_LOCATION_SPECIFICITY.state}
                       WHEN 'country'   THEN ${SHIPPING_LOCATION_SPECIFICITY.country}
                       WHEN 'continent' THEN ${SHIPPING_LOCATION_SPECIFICITY.continent}
                       ELSE 0
                     END AS specificity`,
                ),
            )
            .where((query) => {
                for (const { type, code } of conditions) {
                    query.orWhere((sub) => sub.where("type", type).where("code", code));
                }
            })
            .orderBy([
                { column: "specificity", order: "desc" },
                { column: "zone_id", order: "asc" },
            ])
            .first();

        if (matched) {
            return ShippingZone.findOrFail(matched.zone_id);
        }
    }

    return ShippingZone.query().where("is_fallback", true).first();
}
