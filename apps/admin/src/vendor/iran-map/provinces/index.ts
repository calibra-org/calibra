/**
 * Lazy loader for per-province county SVG geometry. Each province bundle holds the upstream
 * county polygons + viewBox vendored from `react-iran-provinces-map` (MIT) — kept in separate
 * files so the dashboard only pays the byte cost for the currently-selected province.
 */

import type { CountyPath } from "./IR-01";

export type { CountyPath } from "./IR-01";

export interface ProvinceGeometry {
    viewBox: string;
    counties: CountyPath[];
}

const LOADERS: Record<string, () => Promise<ProvinceGeometry>> = {
    "IR-01": () => import("./IR-01").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-02": () => import("./IR-02").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-03": () => import("./IR-03").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-04": () => import("./IR-04").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-05": () => import("./IR-05").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-06": () => import("./IR-06").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-07": () => import("./IR-07").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-08": () => import("./IR-08").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-09": () => import("./IR-09").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-10": () => import("./IR-10").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-11": () => import("./IR-11").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-12": () => import("./IR-12").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-13": () => import("./IR-13").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-14": () => import("./IR-14").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-15": () => import("./IR-15").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-16": () => import("./IR-16").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-17": () => import("./IR-17").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-18": () => import("./IR-18").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-19": () => import("./IR-19").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-20": () => import("./IR-20").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-21": () => import("./IR-21").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-22": () => import("./IR-22").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-23": () => import("./IR-23").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-24": () => import("./IR-24").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-25": () => import("./IR-25").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-26": () => import("./IR-26").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-27": () => import("./IR-27").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-28": () => import("./IR-28").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-29": () => import("./IR-29").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-30": () => import("./IR-30").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
    "IR-31": () => import("./IR-31").then((m) => ({ viewBox: m.VIEWBOX, counties: m.COUNTIES })),
};

export async function loadProvinceGeometry(code: string): Promise<ProvinceGeometry | null> {
    const loader = LOADERS[code];
    if (!loader) return null;
    return loader();
}
