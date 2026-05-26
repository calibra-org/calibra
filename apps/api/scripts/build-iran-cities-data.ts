/**
 * Builds `apps/api/database/data/iran_cities.json` from the sajaddp/list-of-cities-in-Iran
 * upstream dataset, transformed into the shape consumed by `0011_iran_cities_seeder.ts`.
 *
 * Upstream: https://github.com/sajaddp/list-of-cities-in-Iran (GPL-3.0).
 * The Persian/Latin name strings in that repository are treated as factual data; the
 * GPL obligation is documented in
 * `apps/api/database/data/iran_cities.ATTRIBUTION.md`.
 *
 * Province-id mapping: sajaddp uses 100..130; we map to ISO-3166-2:IR codes IR-01..IR-31
 * by ordinal — `IR-${(province_id - 99).padStart(2, "0")}`. Verified against the
 * province seeder in `apps/api/database/seed_modules/0001_foundation_seeder.ts` (Persian
 * names line up one-for-one).
 *
 * Usage:
 *   node --import=@poppinss/ts-exec apps/api/scripts/build-iran-cities-data.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SAJADDP_BASE = "https://raw.githubusercontent.com/sajaddp/list-of-cities-in-Iran/main/dist/json";

interface SajaddpProvince {
    id: number;
    name: string;
    slug: string;
    tel_prefix: string;
}

interface SajaddpCity {
    id: number;
    name: string;
    slug: string;
    province_id: number;
    county_id: number;
}

interface OutputProvinceBlock {
    provinceCode: string;
    cities: Array<{ fa: string; en: string | null }>;
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return (await response.json()) as T;
}

function provinceCode(sajaddpId: number): string {
    const ordinal = sajaddpId - 99;
    if (ordinal < 1 || ordinal > 31) {
        throw new Error(`Unexpected sajaddp province id ${sajaddpId} — out of IR-01..IR-31 range`);
    }
    return `IR-${String(ordinal).padStart(2, "0")}`;
}

async function main() {
    const provinces = await fetchJson<SajaddpProvince[]>(`${SAJADDP_BASE}/provinces.json`);
    const cities = await fetchJson<SajaddpCity[]>(`${SAJADDP_BASE}/cities-filtered.json`);

    const byProvince = new Map<string, OutputProvinceBlock>();
    for (const province of provinces) {
        const code = provinceCode(province.id);
        byProvince.set(code, { provinceCode: code, cities: [] });
    }

    const seen = new Map<string, Set<string>>();
    for (const city of cities) {
        const code = provinceCode(city.province_id);
        const block = byProvince.get(code);
        if (!block) continue;

        if (!seen.has(code)) seen.set(code, new Set());
        const inProvince = seen.get(code);
        if (inProvince === undefined) continue;
        const dedupeKey = city.name.trim();
        if (inProvince.has(dedupeKey)) continue;
        inProvince.add(dedupeKey);

        block.cities.push({ fa: dedupeKey, en: null });
    }

    for (const block of byProvince.values()) {
        block.cities.sort((a, b) => a.fa.localeCompare(b.fa, "fa"));
    }

    const output: OutputProvinceBlock[] = [];
    for (let i = 1; i <= 31; i++) {
        const code = `IR-${String(i).padStart(2, "0")}`;
        const block = byProvince.get(code);
        if (block) output.push(block);
    }

    const outputPath = resolve(import.meta.dirname, "../database/data/iran_cities.json");
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    const totalCities = output.reduce((sum, b) => sum + b.cities.length, 0);
    process.stdout.write(`Wrote ${outputPath}\n${output.length} provinces, ${totalCities} cities total.\n`);
}

void main().catch((error) => {
    process.stderr.write(`build-iran-cities-data failed: ${String(error)}\n`);
    process.exitCode = 1;
});
