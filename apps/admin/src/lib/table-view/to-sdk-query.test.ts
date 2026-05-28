import { describe, expect, test } from "vitest";

import { EMPTY_TABLE_VIEW_QUERY, serializeTableViewQuery } from "./serialize";
import { tableViewQueryToSdkQuery } from "./to-sdk-query";
import type { TableViewQuery } from "./types";

/**
 * The contract: the object handed to the SDK is byte-for-byte what the URL holds. Both derive from
 * {@link serializeTableViewQuery}, so the flattening here must reproduce that pair-list exactly —
 * scalars stay scalars, repeated keys (`filter[]` / `filterOr[]` / `sort[]`) become arrays in URL
 * order. The reference oracle is `URLSearchParams` built from the same serializer.
 */

/** Rebuild the canonical wire query string the URL would carry, sorted for order-independent compare. */
function urlFromSerializer(query: TableViewQuery): string[] {
    const params = new URLSearchParams();
    for (const [k, v] of serializeTableViewQuery(query)) params.append(k, v);
    return params.toString().split("&").sort();
}

/** Rebuild the wire query string the SDK record would produce through buildUrl's array expansion. */
function urlFromSdkQuery(record: Record<string, string | number | boolean | string[] | undefined>): string[] {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(record)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
            for (const item of v) params.append(k, String(item));
            continue;
        }
        params.set(k, String(v));
    }
    return params.toString().split("&").sort();
}

const cases: ReadonlyArray<readonly [string, TableViewQuery]> = [
    ["empty query", EMPTY_TABLE_VIEW_QUERY],
    ["page + limit", { ...EMPTY_TABLE_VIEW_QUERY, page: 3, limit: 50 }],
    ["single filter", { ...EMPTY_TABLE_VIEW_QUERY, filter: [{ field: "status", op: "eq", value: "paid" }] }],
    [
        "multiple filters on different fields",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "status", op: "in", value: ["active", "disabled"] },
                { field: "free_shipping", op: "eq", value: true },
            ],
        },
    ],
    [
        "filter + filterOr + sort + page",
        {
            page: 2,
            limit: 20,
            filter: [{ field: "type", op: "in", value: ["simple", "variable"] }],
            filterOr: [{ field: "sku", op: "ilike", value: "abc%" }],
            sort: [{ field: "created_at", dir: "desc" }],
        },
    ],
];

describe("tableViewQueryToSdkQuery", () => {
    test.each(cases)("URL query == SDK query for %s", (_label, query) => {
        const sdk = tableViewQueryToSdkQuery(query);
        expect(urlFromSdkQuery(sdk)).toEqual(urlFromSerializer(query));
    });

    test("repeated keys flatten into arrays in URL order", () => {
        const sdk = tableViewQueryToSdkQuery({
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "a", op: "eq", value: "1" },
                { field: "b", op: "eq", value: "2" },
            ],
            sort: [{ field: "created_at", dir: "desc" }],
        });
        expect(sdk["filter[]"]).toEqual(["a:eq:1", "b:eq:2"]);
        expect(sdk["sort[]"]).toBe("created_at:desc");
    });

    test("a lone repeated key stays a scalar, not a one-element array", () => {
        const sdk = tableViewQueryToSdkQuery({
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "status", op: "eq", value: "paid" }],
        });
        expect(sdk["filter[]"]).toBe("status:eq:paid");
    });

    test("extras ride under their literal wire keys", () => {
        const sdk = tableViewQueryToSdkQuery(EMPTY_TABLE_VIEW_QUERY, {
            q: "shoes",
            trashed: true,
            tab: "active",
            page: undefined,
        });
        expect(sdk).toEqual({ q: "shoes", trashed: true, tab: "active" });
    });

    test("empty-string and undefined extras are dropped", () => {
        const sdk = tableViewQueryToSdkQuery(EMPTY_TABLE_VIEW_QUERY, {
            q: "",
            tab: undefined,
            include: "facet_counts",
        });
        expect(sdk).toEqual({ include: "facet_counts" });
    });

    test("false and zero extras are kept (only empty-string/undefined drop)", () => {
        const sdk = tableViewQueryToSdkQuery(EMPTY_TABLE_VIEW_QUERY, {
            featured: false,
            limit_override: 0,
        });
        expect(sdk).toEqual({ featured: false, limit_override: 0 });
    });
});
