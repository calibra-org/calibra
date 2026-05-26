"use client";

import type { Locale } from "@calibra/shared/i18n";

import { COUNTRY_WATER_PATHS, PROVINCE_WATER_PATHS } from "#/vendor/iran-map/water";

/**
 * Decorative water bodies for the country and province maps. Geometry vendored from
 * `react-iran-map` (country-level) and `react-iran-provinces-map` (per-province) — see
 * `vendor/iran-map/water.ts`. We don't render text labels on top because the upstream paths
 * include both the open-water area and the coastline detail, and labels collide with the
 * heatmap chrome on smaller widths.
 */

const SEA_FILL = "#7bdaff";
const SEA_STROKE = "#4cb6e0";

interface SeaDecorationsProps {
    locale: Locale;
}

export function SeaDecorations({ locale: _locale }: SeaDecorationsProps) {
    return (
        <g>
            {COUNTRY_WATER_PATHS.map((d, i) => (
                <path
                    key={`country-water-${i.toString()}`}
                    data-region-sea=""
                    d={d}
                    fill={SEA_FILL}
                    stroke={SEA_STROKE}
                    strokeWidth={0.6}
                />
            ))}
        </g>
    );
}

export { SEA_FILL };

interface ProvinceSeaProps {
    code: string;
}

/** Renders the water polygon(s) for a single province if upstream ships one. */
export function ProvinceSea({ code }: ProvinceSeaProps) {
    const paths = PROVINCE_WATER_PATHS[code];
    if (!paths || paths.length === 0) return null;
    return (
        <g>
            {paths.map((d, i) => (
                <path
                    key={`province-water-${code}-${i.toString()}`}
                    d={d}
                    fill={SEA_FILL}
                    stroke={SEA_STROKE}
                    strokeWidth={0.6}
                />
            ))}
        </g>
    );
}
