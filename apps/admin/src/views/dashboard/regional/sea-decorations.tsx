"use client";

import type { Locale } from "@calibra/shared/i18n";

/**
 * Decorative sea bodies rendered BEHIND the province polygons in the country map. The shapes are
 * organic blobs (not geographic outlines) sized to sit alongside the relevant coasts inside the
 * `0 0 1080 1080` country viewBox:
 *
 *   - دریای خزر / Caspian Sea — north coast (above Gilan / Mazandaran / Golestan).
 *   - خلیج فارس / Persian Gulf — south-west coast (alongside Khuzestan / Bushehr).
 *   - دریای عمان / Sea of Oman — south-east coast (alongside Hormozgan / Sistan & Baluchestan).
 */
const SEA_FILL = "#dbeafe";
const SEA_STROKE = "#93c5fd";
const SEA_LABEL_FILL = "#1d4ed8";

interface SeaBody {
    key: string;
    fa: string;
    en: string;
    path: string;
    labelX: number;
    labelY: number;
    labelSize: number;
}

const SEAS: SeaBody[] = [
    {
        key: "caspian",
        fa: "دریای خزر",
        en: "Caspian Sea",
        path: "M 200 60 Q 300 20 460 50 Q 600 80 640 160 Q 580 220 460 230 Q 320 240 220 200 Q 150 150 200 60 Z",
        labelX: 410,
        labelY: 140,
        labelSize: 22,
    },
    {
        key: "persianGulf",
        fa: "خلیج فارس",
        en: "Persian Gulf",
        path: "M 120 880 Q 220 830 380 850 Q 520 870 620 930 Q 540 1010 360 1020 Q 200 1010 130 970 Q 80 930 120 880 Z",
        labelX: 360,
        labelY: 940,
        labelSize: 20,
    },
    {
        key: "omanSea",
        fa: "دریای عمان",
        en: "Sea of Oman",
        path: "M 660 940 Q 760 910 920 930 Q 1040 950 1040 1020 Q 940 1060 800 1050 Q 700 1040 660 1010 Q 630 970 660 940 Z",
        labelX: 830,
        labelY: 1000,
        labelSize: 20,
    },
];

interface SeaDecorationsProps {
    locale: Locale;
}

export function SeaDecorations({ locale }: SeaDecorationsProps) {
    return (
        <g>
            {SEAS.map((sea) => (
                <g key={sea.key}>
                    <path d={sea.path} fill={SEA_FILL} stroke={SEA_STROKE} strokeWidth={0.8} />
                    <text
                        x={sea.labelX}
                        y={sea.labelY}
                        textAnchor="middle"
                        fill={SEA_LABEL_FILL}
                        style={{ fontSize: sea.labelSize, fontWeight: 600, fontStyle: "italic", pointerEvents: "none" }}
                    >
                        {locale === "fa" ? sea.fa : sea.en}
                    </text>
                </g>
            ))}
        </g>
    );
}
