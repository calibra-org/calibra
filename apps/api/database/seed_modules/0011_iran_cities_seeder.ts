import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

import Region from "#models/region";
import { normalizeIranText } from "#services/iran_text_normalize";

interface IranCitiesBlock {
    provinceCode: string;
    cities: Array<{ fa: string; en: string | null }>;
}

/**
 * Phase 11 seed data — Iranian cities seeded as child `regions` rows under each ISO-3166-2:IR
 * province. Source dataset is bundled at `database/data/iran_cities.json` (built from
 * sajaddp/list-of-cities-in-Iran; see `iran_cities.ATTRIBUTION.md`). Every city carries:
 *
 *   - `country_code = 'IR'`
 *   - `parent_id   = <province region.id>`
 *   - `code        = 'IR-<NN>-<seq3>'` where `<seq3>` is the alphabetical position of the
 *                    city's Persian name within its province (zero-padded to 3 chars).
 *   - `attributes.normalizedName` — the `normalizeIranText(fa)` key used at query time to
 *                    bucket `order_addresses.city` snapshot text into the matching city Region.
 *
 * Idempotent: every write is `updateOrCreate` / `onConflict.merge()`. Re-running the seeder
 * with the same dataset produces the same row set; a city dropped from upstream stays in the
 * database as an orphan rather than getting deleted (deletes are explicit follow-up work).
 *
 * Lives under `database/seed_modules/` (outside Lucid's auto-discovery path) so it runs only
 * when the orchestrating `MainSeeder` imports it explicitly.
 */
export default class IranCitiesSeeder extends BaseSeeder {
    async run() {
        const blocks = this.loadDataset();

        const provincesByCode = await this.loadProvinceLookup();

        const cityRegionRows: Array<{
            countryCode: string;
            code: string;
            parentId: number | bigint;
            ordering: number;
            attributes: Record<string, unknown>;
        }> = [];

        const translationRows: Array<{ provinceCode: string; code: string; fa: string; en: string | null }> = [];

        for (const block of blocks) {
            const province = provincesByCode.get(block.provinceCode);
            if (!province) {
                console.warn(`Skipping ${block.provinceCode} — province region not found`);
                continue;
            }

            block.cities.forEach((city, index) => {
                const seq = String(index + 1).padStart(3, "0");
                const code = `${block.provinceCode}-${seq}`;

                cityRegionRows.push({
                    countryCode: "IR",
                    code,
                    parentId: province.id,
                    ordering: index + 1,
                    attributes: { normalizedName: normalizeIranText(city.fa) },
                });

                translationRows.push({
                    provinceCode: block.provinceCode,
                    code,
                    fa: city.fa,
                    en: city.en,
                });
            });
        }

        await Region.updateOrCreateMany(["countryCode", "code"], cityRegionRows, { client: this.client });

        const inserted = await Region.query({ client: this.client }).where("country_code", "IR").whereNotNull("parent_id");

        const byCode = new Map<string, Region>();
        for (const region of inserted) byCode.set(region.code, region);

        const now = DateTime.utc().toSQL();
        const translations: Array<{
            region_id: bigint | number;
            locale: string;
            name: string;
            created_at: string | null;
            updated_at: string | null;
        }> = [];

        for (const row of translationRows) {
            const region = byCode.get(row.code);
            if (!region) continue;
            translations.push({
                region_id: region.id,
                locale: "fa",
                name: row.fa,
                created_at: now,
                updated_at: now,
            });
            if (row.en !== null && row.en.length > 0) {
                translations.push({
                    region_id: region.id,
                    locale: "en",
                    name: row.en,
                    created_at: now,
                    updated_at: now,
                });
            }
        }

        if (translations.length > 0) {
            await this.client
                .table("region_translations")
                .insert(translations)
                .onConflict(["region_id", "locale"])
                .merge(["name", "updated_at"]);
        }

        const provinceCount = new Set(cityRegionRows.map((r) => r.code.slice(0, 5))).size;
        console.log(`Seeded ${cityRegionRows.length} cities under ${provinceCount} provinces`);
    }

    private loadDataset(): IranCitiesBlock[] {
        const path = resolve(import.meta.dirname, "../data/iran_cities.json");
        const raw = readFileSync(path, "utf8");
        return JSON.parse(raw) as IranCitiesBlock[];
    }

    private async loadProvinceLookup(): Promise<Map<string, Region>> {
        const provinces = await Region.query({ client: this.client }).where("country_code", "IR").whereNull("parent_id");

        const byCode = new Map<string, Region>();
        for (const province of provinces) byCode.set(province.code, province);
        return byCode;
    }
}
