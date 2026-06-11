import type { TopSellersReport } from "#/lib/types";

/**
 * Top-sellers report fixture. There is no first-party top-sellers endpoint yet, so the screen renders
 * a static, instantly-available shape — relocated verbatim from the deleted `server-repos.ts`
 * `getTopSellersReport`. The range is a rolling 30-day window resolved at call time; rows are empty
 * until a real report operation lands. Client-importable (no server imports).
 */
export function getTopSellersFixture(): TopSellersReport {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
        range: { startDate: thirtyDaysAgo, endDate: today },
        rows: [],
    };
}
