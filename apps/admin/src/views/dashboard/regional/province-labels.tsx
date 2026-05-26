"use client";

import { LABEL_GROUPS, TEXT_LABELS } from "#/vendor/iran-map/labels";

/**
 * Static province-name overlay for the country map. Renders the 32 upstream `<g>` glyph groups
 * + the single `<text>` label (Qom) verbatim from `react-iran-map`. Each label is tagged with a
 * `data-region-label` attribute so the parent SVG can run a point-in-fill pass after mount and
 * flip each label's fill colour to whichever of black/white reads against the polygon
 * underneath. Initial fill is dark; the pass overwrites the unreadable ones to white.
 */
export function ProvinceLabels() {
    return (
        <g style={{ pointerEvents: "none" }} data-region-labels="">
            {LABEL_GROUPS.map((paths, i) => (
                <g key={`label-${i.toString()}`} data-region-label="" fill="#0f172a">
                    {paths.map((d, j) => (
                        <path key={`label-${i.toString()}-${j.toString()}`} d={d} />
                    ))}
                </g>
            ))}
            {TEXT_LABELS.map((entry) => (
                <text
                    key={entry.label}
                    /**
                     * Initial position from upstream — `MapSvg`'s effect re-centres these on
                     * the matching province polygon via `data-text-label-name`, so the matrix
                     * is just a placeholder until that pass runs.
                     */
                    transform={`matrix(${entry.matrix})`}
                    data-region-label=""
                    data-text-label-name={entry.label}
                    fill="#0f172a"
                    style={{ fontWeight: 500 }}
                >
                    {entry.label}
                </text>
            ))}
        </g>
    );
}
