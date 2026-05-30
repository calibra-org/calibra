import type { ReportCouponsStats, ReportSalesStats } from "#/lib/queries/analytics";

import type { SeriesPoint } from "../components/report-series-chart";

type SalesIntervalKey = keyof ReportSalesStats["intervals"][number];
type CouponsIntervalKey = keyof ReportCouponsStats["intervals"][number];

/** Project a sales-stats interval series onto one metric, merging the comparison window by index. */
export function salesSeries(stats: ReportSalesStats | undefined, metric: SalesIntervalKey): SeriesPoint[] {
    if (stats === undefined) return [];
    const compare = stats.comparison?.intervals ?? [];
    return stats.intervals.map((point, index) => ({
        date: point.date,
        value: Number(point[metric] ?? 0),
        compare: compare[index] === undefined ? undefined : Number(compare[index]![metric] ?? 0),
    }));
}

/** Project a coupons-stats interval series onto one metric, merging the comparison window by index. */
export function couponsSeries(stats: ReportCouponsStats | undefined, metric: CouponsIntervalKey): SeriesPoint[] {
    if (stats === undefined) return [];
    const compare = stats.comparison?.intervals ?? [];
    return stats.intervals.map((point, index) => ({
        date: point.date,
        value: Number(point[metric] ?? 0),
        compare: compare[index] === undefined ? undefined : Number(compare[index]![metric] ?? 0),
    }));
}
