import { describe, expect, test } from "vitest";

import {
    EMPTY_TABLE_VIEW_QUERY,
    parseTableViewQuery,
    serializeTableViewQuery,
    toUrlSearchParams,
} from "./serialize";
import type { TableViewQuery } from "./types";

/**
 * Round-trip identity is the contract here: for every legal {@link TableViewQuery},
 * `parse(serialize(q))` must equal `q`. The wire grammar matches the server's VineJS rule, so
 * any drift between the two parsers shows up as a failing case here OR as a 422 response from
 * the API integration tests.
 */

const roundTripCases: ReadonlyArray<readonly [string, TableViewQuery]> = [
    [
        "empty query",
        EMPTY_TABLE_VIEW_QUERY,
    ],
    [
        "page + limit set together",
        { ...EMPTY_TABLE_VIEW_QUERY, page: 3, limit: 50 },
    ],
    [
        "single eq filter",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "status", op: "eq", value: "paid" }],
        },
    ],
    [
        "single neq filter",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "status", op: "neq", value: "paid" }],
        },
    ],
    [
        "gt / gte / lt / lte preserve numeric type",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "total", op: "gt", value: 1000 },
                { field: "total", op: "gte", value: 5000 },
                { field: "items", op: "lt", value: 100 },
                { field: "items", op: "lte", value: 50 },
            ],
        },
    ],
    [
        "like / ilike / nlike / nilike preserve % wildcards",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "email", op: "like", value: "%@calibra.dev" },
                { field: "first_name", op: "ilike", value: "ali%" },
                { field: "first_name", op: "nlike", value: "test%" },
                { field: "first_name", op: "nilike", value: "%spam%" },
            ],
        },
    ],
    [
        "inc / iinc / ninc / niinc encode the user's substring literally",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "email", op: "inc", value: "@calibra" },
                { field: "email", op: "iinc", value: "@CaLiBrA" },
                { field: "email", op: "ninc", value: "@spam" },
                { field: "email", op: "niinc", value: "@SPAM" },
            ],
        },
    ],
    [
        "in / nin preserve element types in order",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "status", op: "in", value: ["pending", "paid", "completed"] },
                { field: "country", op: "nin", value: ["IR", "AE"] },
            ],
        },
    ],
    [
        "between with numeric bounds",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "total", op: "between", value: [1000, 5000] }],
        },
    ],
    [
        "between with string date bounds",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "created_at", op: "between", value: ["2026-01-01", "2026-12-31T23:59:59.999Z"] },
            ],
        },
    ],
    [
        "isnull / notnull as void ops",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "deleted_at", op: "isnull", value: null },
                { field: "billing_email", op: "notnull", value: null },
            ],
        },
    ],
    [
        "filterOr group composes with filter",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "country_default", op: "eq", value: "IR" }],
            filterOr: [
                { field: "status", op: "eq", value: "active" },
                { field: "is_paying_customer", op: "eq", value: true },
            ],
        },
    ],
    [
        "single sort ascending",
        { ...EMPTY_TABLE_VIEW_QUERY, sort: [{ field: "created_at", dir: "asc" }] },
    ],
    [
        "multiple sort entries chain in order",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            sort: [
                { field: "status", dir: "asc" },
                { field: "id", dir: "desc" },
            ],
        },
    ],
    [
        "boolean values survive coercion",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "is_paying_customer", op: "eq", value: true }],
        },
    ],
    [
        "null literal survives coercion",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "customer_id", op: "eq", value: null }],
        },
    ],
    [
        "decimal numeric values survive",
        {
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "weight", op: "gte", value: 1.5 }],
        },
    ],
    [
        "everything combined",
        {
            page: 4,
            limit: 50,
            filter: [
                { field: "status", op: "in", value: ["pending", "paid"] },
                { field: "created_at", op: "between", value: ["2026-01-01", "2026-12-31T23:59:59.999Z"] },
                { field: "deleted_at", op: "isnull", value: null },
            ],
            filterOr: [
                { field: "billing_email", op: "ilike", value: "%@calibra.dev" },
                { field: "total", op: "gte", value: 100000 },
            ],
            sort: [
                { field: "created_at", dir: "desc" },
                { field: "id", dir: "desc" },
            ],
        },
    ],
];

describe("serializeTableViewQuery / parseTableViewQuery round-trip", () => {
    test.each(roundTripCases)("%s", (_label, original) => {
        const serialized = toUrlSearchParams(original);
        const parsed = parseTableViewQuery(serialized);
        expect(parsed).toEqual(original);
    });
});

describe("serializeTableViewQuery / wire shape", () => {
    test("omits default page + limit so URLs stay short", () => {
        const entries = serializeTableViewQuery(EMPTY_TABLE_VIEW_QUERY);
        expect(entries.find(([k]) => k === "page")).toBeUndefined();
        expect(entries.find(([k]) => k === "limit")).toBeUndefined();
    });

    test("emits page only when non-default", () => {
        const entries = serializeTableViewQuery({ ...EMPTY_TABLE_VIEW_QUERY, page: 2 });
        expect(entries).toContainEqual(["page", "2"]);
        expect(entries.find(([k]) => k === "limit")).toBeUndefined();
    });

    test("emits one `filter[]` entry per item", () => {
        const entries = serializeTableViewQuery({
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [
                { field: "status", op: "eq", value: "paid" },
                { field: "total", op: "gte", value: 1000 },
            ],
        });
        const filterEntries = entries.filter(([k]) => k === "filter[]");
        expect(filterEntries.map(([, v]) => v)).toEqual(["status:eq:paid", "total:gte:1000"]);
    });

    test("between produces a comma-separated value", () => {
        const entries = serializeTableViewQuery({
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "total", op: "between", value: [1000, 5000] }],
        });
        expect(entries).toContainEqual(["filter[]", "total:between:1000,5000"]);
    });

    test("void ops omit the value slot", () => {
        const entries = serializeTableViewQuery({
            ...EMPTY_TABLE_VIEW_QUERY,
            filter: [{ field: "deleted_at", op: "isnull", value: null }],
        });
        expect(entries).toContainEqual(["filter[]", "deleted_at:isnull"]);
    });
});

describe("parseTableViewQuery / robustness", () => {
    test("malformed filter entries are dropped silently", () => {
        const params = new URLSearchParams();
        params.append("filter[]", "garbage");
        params.append("filter[]", "status:notARealOp:foo");
        params.append("filter[]", "status:eq:paid");
        const parsed = parseTableViewQuery(params);
        expect(parsed.filter).toEqual([{ field: "status", op: "eq", value: "paid" }]);
    });

    test("malformed sort entries are dropped silently", () => {
        const params = new URLSearchParams();
        params.append("sort[]", "garbage");
        params.append("sort[]", "status:nope");
        params.append("sort[]", "created_at:desc");
        const parsed = parseTableViewQuery(params);
        expect(parsed.sort).toEqual([{ field: "created_at", dir: "desc" }]);
    });

    test("page / limit fall back to defaults on garbage input", () => {
        const params = new URLSearchParams();
        params.set("page", "abc");
        params.set("limit", "-1");
        const parsed = parseTableViewQuery(params);
        expect(parsed.page).toBe(1);
        expect(parsed.limit).toBe(20);
    });

    test("two-part shorthand `field:value` parses as `eq`", () => {
        const params = new URLSearchParams();
        params.append("filter[]", "status:paid");
        const parsed = parseTableViewQuery(params);
        expect(parsed.filter).toEqual([{ field: "status", op: "eq", value: "paid" }]);
    });

    test("uppercase op tokens round-trip via lowercase canonical form", () => {
        const params = new URLSearchParams();
        params.append("filter[]", "status:NEQ:paid");
        const parsed = parseTableViewQuery(params);
        expect(parsed.filter[0]?.op).toBe("neq");
    });

    test("uppercase sort tokens round-trip via lowercase canonical form", () => {
        const params = new URLSearchParams();
        params.append("sort[]", "created_at:DESC");
        const parsed = parseTableViewQuery(params);
        expect(parsed.sort[0]?.dir).toBe("desc");
    });
});
