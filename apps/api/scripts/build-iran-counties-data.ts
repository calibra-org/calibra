/**
 * Builds two datasets from sajaddp/list-of-cities-in-Iran:
 *
 *   - `apps/api/database/data/iran_counties.json` — per-province list of shahrestan (county)
 *     names, in the same provinceCode-indexed shape as `iran_cities.json`.
 *   - `apps/api/database/data/iran_city_to_county.json` — a flat lookup that maps a
 *     normalised city name back to its county's Persian name. The regional insights API uses
 *     this to roll order_address.city snapshot text up to a county for choropleth fill.
 *
 * Upstream: https://github.com/sajaddp/list-of-cities-in-Iran (GPL-3.0). Treated as factual
 * data — see `iran_cities.ATTRIBUTION.md`.
 *
 * Usage:
 *   node --import=@poppinss/ts-exec apps/api/scripts/build-iran-counties-data.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeIranText } from "#services/iran_text_normalize";

const SAJADDP_BASE = "https://raw.githubusercontent.com/sajaddp/list-of-cities-in-Iran/main/dist/json";

interface SajaddpCounty {
    id: number;
    name: string;
    slug: string;
    province_id: number;
}

interface SajaddpCity {
    id: number;
    name: string;
    slug: string;
    province_id: number;
    county_id: number;
}

interface OutputCountyBlock {
    provinceCode: string;
    counties: Array<{ fa: string }>;
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return (await response.json()) as T;
}

function provinceCode(sajaddpProvinceId: number): string {
    const ordinal = sajaddpProvinceId - 99;
    if (ordinal < 1 || ordinal > 31) {
        throw new Error(`Unexpected sajaddp province id ${sajaddpProvinceId}`);
    }
    return `IR-${String(ordinal).padStart(2, "0")}`;
}

async function main() {
    const counties = await fetchJson<SajaddpCounty[]>(`${SAJADDP_BASE}/counties.json`);
    const cities = await fetchJson<SajaddpCity[]>(`${SAJADDP_BASE}/cities-filtered.json`);

    const countyById = new Map<number, SajaddpCounty>();
    for (const c of counties) countyById.set(c.id, c);

    /** Counties grouped by province for the seeder. */
    const byProvince = new Map<string, OutputCountyBlock>();
    for (let i = 1; i <= 31; i += 1) {
        const code = `IR-${String(i).padStart(2, "0")}`;
        byProvince.set(code, { provinceCode: code, counties: [] });
    }
    for (const c of counties) {
        const code = provinceCode(c.province_id);
        const block = byProvince.get(code);
        if (!block) continue;
        block.counties.push({ fa: c.name.trim() });
    }
    for (const block of byProvince.values()) {
        block.counties.sort((a, b) => a.fa.localeCompare(b.fa, "fa"));
    }
    const provinceBlocks: OutputCountyBlock[] = [];
    for (let i = 1; i <= 31; i += 1) {
        const code = `IR-${String(i).padStart(2, "0")}`;
        const block = byProvince.get(code);
        if (block) provinceBlocks.push(block);
    }

    /** City-name → county-name lookup, normalised key for stable matching. */
    const cityToCounty: Record<string, { provinceCode: string; countyFa: string }> = {};
    for (const city of cities) {
        const county = countyById.get(city.county_id);
        if (!county) continue;
        const key = normalizeIranText(city.name);
        if (!key) continue;
        if (cityToCounty[key] !== undefined) continue;
        cityToCounty[key] = {
            provinceCode: provinceCode(city.province_id),
            countyFa: county.name.trim(),
        };
    }
    /** Counties also resolve to themselves (a county's main town shares the county name). */
    for (const c of counties) {
        const key = normalizeIranText(c.name);
        if (!key) continue;
        if (cityToCounty[key] !== undefined) continue;
        cityToCounty[key] = {
            provinceCode: provinceCode(c.province_id),
            countyFa: c.name.trim(),
        };
    }

    const countiesOutPath = resolve(import.meta.dirname, "../database/data/iran_counties.json");
    writeFileSync(countiesOutPath, `${JSON.stringify(provinceBlocks, null, 2)}\n`, "utf8");

    const mapOutPath = resolve(import.meta.dirname, "../database/data/iran_city_to_county.json");
    writeFileSync(mapOutPath, `${JSON.stringify(cityToCounty, null, 2)}\n`, "utf8");

    const totalCounties = provinceBlocks.reduce((sum, b) => sum + b.counties.length, 0);
    process.stdout.write(
        `Wrote ${countiesOutPath}\n${provinceBlocks.length} provinces, ${totalCounties} counties total.\n`,
    );
    process.stdout.write(`Wrote ${mapOutPath}\n${Object.keys(cityToCounty).length} city→county mappings.\n`);
}

void main().catch((error) => {
    process.stderr.write(`build-iran-counties-data failed: ${String(error)}\n`);
    process.exitCode = 1;
});
