"use client";

import { LABEL_GROUPS, TEXT_LABELS } from "#/vendor/iran-map/labels";

interface ProvinceLabelsProps {
    fill?: string;
}

/**
 * Static province-name overlay for the country map. Renders the 32 upstream `<g>` glyph groups
 * + the single `<text>` label (Qom) verbatim from `react-iran-map` so labels match the upstream
 * positioning exactly. Always rendered above the province polygons with `pointer-events: none`
 * so hover / click on the provinces still work.
 */
export function ProvinceLabels({ fill = "#0f172a" }: ProvinceLabelsProps) {
    return (
        <g style={{ pointerEvents: "none" }}>
            {LABEL_GROUPS.map((paths, i) => (
                <g key={`label-${i.toString()}`} fill={fill}>
                    {paths.map((d, j) => (
                        <path key={`label-${i.toString()}-${j.toString()}`} d={d} />
                    ))}
                </g>
            ))}
            {TEXT_LABELS.map((entry) => (
                <text
                    key={entry.label}
                    transform={`matrix(${entry.matrix})`}
                    fill={fill}
                    style={{ fontSize: 16, fontWeight: 500 }}
                >
                    {entry.label}
                </text>
            ))}
        </g>
    );
}
