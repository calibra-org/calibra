import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeIranText } from "#services/iran_text_normalize";

/**
 * Loads sajaddp's city→county lookup (built by `apps/api/scripts/build-iran-counties-data.ts`)
 * once at module import time. The regional insights endpoint uses this to roll order-address
 * city snapshots up to a county for choropleth fill — without it, sajaddp cities that aren't
 * also counties (e.g. درح in Darmian) would never appear on the SVG, which only renders
 * county polygons.
 *
 * The values are vendored from sajaddp/list-of-cities-in-Iran (GPL-3.0, treated as factual
 * data). Lookup is keyed by `normalizeIranText(cityOrCountyName)` so Yeh/Kaf variants,
 * tatweel, ZWNJ, etc. all collapse onto the same county.
 */

interface CityToCountyEntry {
    provinceCode: string;
    countyFa: string;
}

interface CountyListEntry {
    fa: string;
}

interface CountyListBlock {
    provinceCode: string;
    counties: CountyListEntry[];
}

let lookup: Map<string, CityToCountyEntry> | null = null;
let countiesByProvince: Map<string, ReadonlyArray<CountyListEntry>> | null = null;

function ensureLoaded(): Map<string, CityToCountyEntry> {
    if (lookup !== null) return lookup;
    const path = resolve(import.meta.dirname, "../../database/data/iran_city_to_county.json");
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as Record<string, CityToCountyEntry>;
    lookup = new Map(Object.entries(data));
    return lookup;
}

function ensureCountiesLoaded(): Map<string, ReadonlyArray<CountyListEntry>> {
    if (countiesByProvince !== null) return countiesByProvince;
    const path = resolve(import.meta.dirname, "../../database/data/iran_counties.json");
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as CountyListBlock[];
    const map = new Map<string, ReadonlyArray<CountyListEntry>>();
    for (const block of data) map.set(block.provinceCode, block.counties);
    countiesByProvince = map;
    return countiesByProvince;
}

/**
 * Returns the county that contains the given city / county snapshot name, or `null` if no
 * sajaddp entry matches. Empty / nullish input returns `null`.
 */
export function resolveCounty(cityOrCountyName: string | null | undefined): CityToCountyEntry | null {
    const key = normalizeIranText(cityOrCountyName);
    if (!key) return null;
    return ensureLoaded().get(key) ?? null;
}

/**
 * Returns every sajaddp county under the given `IR-NN` province (Persian-sorted, deduped).
 * Used by the regional insights endpoint to emit a row for EVERY county — not just the ones
 * with observed orders — so the sidebar list can mirror the country view's
 * "every-province-always-listed" behaviour.
 */
export function listCountiesForProvince(provinceCode: string): ReadonlyArray<CountyListEntry> {
    return ensureCountiesLoaded().get(provinceCode) ?? [];
}
