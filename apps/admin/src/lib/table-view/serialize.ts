import {
    TABLE_VIEW_OPERATORS,
    TABLE_VIEW_SORT_DIRS,
    type TableViewOperator,
    type TableViewSortDir,
    VOID_OPERATORS,
} from "./constants";
import {
    EMPTY_TABLE_VIEW_QUERY,
    type TableViewFilter,
    type TableViewPrimitive,
    type TableViewQuery,
    type TableViewSort,
} from "./types";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Serialize a {@link TableViewQuery} into a list of `[name, value]` URL pairs ready to feed into
 * `URLSearchParams`. Keeps the wire grammar identical to the server: `filter[]=field:op:value`
 * (repeated), `filterOr[]=…`, `sort[]=field:dir`. Page + limit are emitted only when non-default.
 *
 * The reverse `parseTableViewQuery(URLSearchParams)` is round-trip stable for well-formed
 * inputs: `parse(serialize(q))` equals `q` for every legal value combination.
 */
export function serializeTableViewQuery(query: TableViewQuery): Array<[string, string]> {
    const out: Array<[string, string]> = [];

    if (query.page !== DEFAULT_PAGE) out.push(["page", String(query.page)]);
    if (query.limit !== DEFAULT_LIMIT) out.push(["limit", String(query.limit)]);

    for (const filter of query.filter) out.push(["filter[]", encodeFilter(filter)]);
    for (const filter of query.filterOr) out.push(["filterOr[]", encodeFilter(filter)]);
    for (const sort of query.sort) out.push(["sort[]", encodeSort(sort)]);

    return out;
}

/**
 * Same shape, returned as a `URLSearchParams` for callers that want to merge it into an
 * existing fetch URL or pass it to `nuqs` directly. Each repeated key produces a separate entry
 * — `URLSearchParams.toString()` emits `filter%5B%5D=...&filter%5B%5D=...` correctly.
 */
export function toUrlSearchParams(query: TableViewQuery): URLSearchParams {
    const params = new URLSearchParams();
    for (const [k, v] of serializeTableViewQuery(query)) params.append(k, v);
    return params;
}

/**
 * Parse a `URLSearchParams` (or any `{ getAll(name: string): string[] }`-shaped subset) into a
 * normalised {@link TableViewQuery}. Unknown / malformed entries are dropped silently — the
 * server is the source of truth for what's *legal*; this function only needs to recover the
 * shape so the UI can rehydrate from a deep link.
 *
 * Always returns a populated `TableViewQuery` (defaults applied for missing keys). Never throws.
 */
export function parseTableViewQuery(input: URLSearchParams | { getAll(name: string): string[] }): TableViewQuery {
    const params = input;
    const pageRaw = "get" in params ? params.get("page") : (params.getAll("page")[0] ?? null);
    const limitRaw = "get" in params ? params.get("limit") : (params.getAll("limit")[0] ?? null);

    const page = parsePositiveInt(pageRaw, DEFAULT_PAGE);
    const limit = parsePositiveInt(limitRaw, DEFAULT_LIMIT);

    const filter = params.getAll("filter[]").map(decodeFilter).filter(notNull);
    const filterOr = params.getAll("filterOr[]").map(decodeFilter).filter(notNull);
    const sort = params.getAll("sort[]").map(decodeSort).filter(notNull);

    return { page, limit, filter, filterOr, sort };
}

/**
 * Convenience: collapse a partial update into the existing query and return the next snapshot.
 * Setting `page` is the responsibility of the caller — usually `1` on any predicate change.
 */
export function applyTableViewPatch(query: TableViewQuery, patch: Partial<TableViewQuery>): TableViewQuery {
    return { ...query, ...patch };
}

/* ----------------------------- filter encoding ----------------------------- */

function encodeFilter(filter: TableViewFilter): string {
    if (isVoidOp(filter.op)) return `${filter.field}:${filter.op}`;
    return `${filter.field}:${filter.op}:${encodeValue(filter.op, filter.value)}`;
}

function encodeSort(sort: TableViewSort): string {
    return `${sort.field}:${sort.dir}`;
}

function decodeFilter(raw: string): TableViewFilter | null {
    if (raw.length === 0) return null;
    /** Split into at most 3 parts but preserve any trailing colons in the value slot — values
     * like ISO datetimes (`2026-12-31T23:59:59.999Z`) contain colons too. JS `split(":", 3)`
     * silently drops the tail, so we hand-split instead. */
    const firstColon = raw.indexOf(":");
    if (firstColon === -1) return null;
    const field = raw.slice(0, firstColon);
    if (field.length === 0) return null;
    const rest = raw.slice(firstColon + 1);

    const secondColon = rest.indexOf(":");
    if (secondColon === -1) {
        if (isVoidOp(rest as TableViewOperator)) {
            return { field, op: rest as TableViewOperator, value: null };
        }
        return { field, op: "eq", value: decodeValue("eq", rest) };
    }

    const opCandidate = rest.slice(0, secondColon).toLowerCase() as TableViewOperator;
    if (!isOperator(opCandidate)) return null;
    const valueRaw = rest.slice(secondColon + 1);
    return { field, op: opCandidate, value: decodeValue(opCandidate, valueRaw) };
}

function decodeSort(raw: string): TableViewSort | null {
    const colon = raw.indexOf(":");
    if (colon === -1) return null;
    const field = raw.slice(0, colon);
    if (field.length === 0) return null;
    const dir = raw.slice(colon + 1).toLowerCase();
    if (!isSortDir(dir)) return null;
    return { field, dir };
}

function encodeValue(op: TableViewOperator, value: TableViewFilter["value"]): string {
    if (op === "between" || op === "in" || op === "nin") {
        if (!Array.isArray(value)) return "";
        return value.map((v) => encodeScalar(v)).join(",");
    }
    return encodeScalar(value as TableViewPrimitive);
}

function decodeValue(op: TableViewOperator, raw: string): TableViewFilter["value"] {
    if (op === "between" || op === "in" || op === "nin") {
        return raw
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
            .map(coerce);
    }
    return coerce(raw);
}

function encodeScalar(v: TableViewPrimitive): string {
    if (v === null) return "null";
    return String(v);
}

/**
 * Recover the primitive type a scalar token represents. Same rules the server applies post-URL-
 * decode: integers, floats, `true` / `false`, `null` — anything else stays a string. Dates stay
 * strings; the server doesn't auto-Date-parse and the round-trip identity property would break
 * if we did here.
 */
function coerce(raw: string): TableViewPrimitive {
    if (raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (/^-?\d+$/.test(raw)) return Number(raw);
    if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
    return raw;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return fallback;
    return n;
}

function isOperator(value: string): value is TableViewOperator {
    return (TABLE_VIEW_OPERATORS as ReadonlyArray<string>).includes(value);
}

function isSortDir(value: string): value is TableViewSortDir {
    return (TABLE_VIEW_SORT_DIRS as ReadonlyArray<string>).includes(value);
}

function isVoidOp(op: TableViewOperator): boolean {
    return (VOID_OPERATORS as ReadonlyArray<TableViewOperator>).includes(op);
}

function notNull<T>(value: T | null): value is T {
    return value !== null;
}

export { DEFAULT_LIMIT as TABLE_VIEW_DEFAULT_LIMIT, DEFAULT_PAGE as TABLE_VIEW_DEFAULT_PAGE, EMPTY_TABLE_VIEW_QUERY };
