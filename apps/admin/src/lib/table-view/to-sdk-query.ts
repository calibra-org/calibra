import { serializeTableViewQuery } from "./serialize";
import type { TableViewQuery } from "./types";

/**
 * A value the SDK `query` object can carry. Scalars become a single `?key=value`; string arrays
 * become repeated `?key=a&key=b` entries via {@link apiGet}'s `buildUrl`. `undefined` is dropped.
 */
export type SdkQueryValue = string | number | boolean | string[] | undefined;

/** A bespoke top-level extra. Keys are the EXACT wire keys the controller's `compileStrict` declares. */
export type TableViewExtras = Record<string, string | number | boolean | undefined>;

/**
 * Turn a {@link TableViewQuery} plus its endpoint extras into the exact object handed to
 * `apiGet(path, { query })`. The result is byte-for-byte what the URL holds: the TableView portion
 * flows through the canonical {@link serializeTableViewQuery} (so `filter[]` / `filterOr[]` / `sort[]`
 * accumulate into arrays that `buildUrl` re-expands into repeated keys), and each extra rides under
 * its literal wire key.
 *
 * This is the single codec every list-query hook uses — there is no bespoke per-list `buildQuery`.
 * The URL query string and the SDK query string are guaranteed identical because they derive from
 * the same serializer.
 *
 * Empty-string and `undefined` extras are stripped so the request stays clean; the TableView
 * serializer already omits default page/limit and never emits empty predicates.
 */
export function tableViewQueryToSdkQuery(query: TableViewQuery, extras: TableViewExtras = {}): Record<string, SdkQueryValue> {
    const out: Record<string, SdkQueryValue> = {};
    for (const [k, v] of serializeTableViewQuery(query)) {
        const existing = out[k];
        if (existing === undefined) {
            out[k] = v;
        } else if (Array.isArray(existing)) {
            existing.push(v);
        } else {
            out[k] = [existing as string, v];
        }
    }
    for (const [k, v] of Object.entries(extras)) {
        if (v === undefined || v === "") continue;
        out[k] = v;
    }
    return out;
}
