"use client";

import { LABEL_GROUPS, TEXT_LABELS } from "#/vendor/iran-map/labels";

import { OUTLINED_LABEL_STYLE } from "./contrast";

/**
 * Static province-name overlay for the country map. Renders the 32 upstream `<g>` glyph groups
 * + the single `<text>` label (Qom) verbatim from `react-iran-map`. The upstream glyphs include
 * province names AND sea names mixed together with no per-label tagging, so we can't compute a
 * per-glyph contrast colour. Instead, every label gets a white halo (paint-order stroke) under
 * a dark fill — readable on any colour underneath, including the dark-blue seas and the dark
 * choropleth bins.
 *
 * The whole group is shrunk by `transform="scale(0.85)"` so labels read at a comfortable size
 * without crowding small provinces.
 */
export function ProvinceLabels() {
    return (
        <g style={{ pointerEvents: "none" }}>
            {LABEL_GROUPS.map((paths, i) => (
                <g key={`label-${i.toString()}`} style={OUTLINED_LABEL_STYLE}>
                    {paths.map((d, j) => (
                        <path key={`label-${i.toString()}-${j.toString()}`} d={d} />
                    ))}
                </g>
            ))}
            {TEXT_LABELS.map((entry) => (
                <text
                    key={entry.label}
                    transform={`matrix(${entry.matrix})`}
                    style={{ ...OUTLINED_LABEL_STYLE, fontSize: 14, fontWeight: 500 }}
                >
                    {entry.label}
                </text>
            ))}
        </g>
    );
}
