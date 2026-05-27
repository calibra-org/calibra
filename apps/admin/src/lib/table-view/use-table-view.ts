"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import type { DateFilterValue } from "#/components/ui/date-picker/types";
import { usePathname, useRouter } from "#/lib/i18n/navigation";

import { dateFilterValueToTableViewFilter } from "./date-adapter";
import { parseTableViewQuery, serializeTableViewQuery } from "./serialize";
import type { TableViewFilter, TableViewQuery, TableViewSort } from "./types";

/**
 * URL-backed state hook for a {@link TableViewQuery}. Every list page that migrates to the
 * unified TableView grammar pulls its filter / sort / pagination through this hook.
 *
 * The hook is intentionally a thin wrapper around `useSearchParams` + `router.replace`:
 *
 *  - Reads the current `URLSearchParams` and parses them into a `TableViewQuery` via the
 *    canonical {@link parseTableViewQuery} so the deep-link grammar matches the server's.
 *  - Writes back by re-serialising via {@link serializeTableViewQuery} and calling
 *    `router.replace` with the encoded query string. No history pollution per keystroke (we use
 *    `replace`, not `push`).
 *  - Resets `page` to `1` on every predicate change. The operator never expects the page index
 *    to survive a filter toggle.
 *  - Optional `extras` carry the endpoint's bespoke top-level params (`q`, `tab`, `trashed`,
 *    etc.) — declared as a `nuqs` parser map, the hook reads + writes them alongside the
 *    TableView keys and returns typed accessors (`q`, `setQ`, `tab`, `setTab`, …).
 *
 * Consumers receive the parsed `query` plus a small set of mutators (`setFilter`, `setSort`,
 * `setPage`, …) and a `setQuery` for one-shot full-state writes.
 */
/**
 * A nuqs parser shape that includes a default value. We require callers to pass parsers built
 * with `.withDefault(...)` so we can safely read + strip default-equal values when serialising
 * the URL back. Loose typing on `parse` / `serialize` keeps the variance simple.
 */
interface ExtraParser<TValue> {
    parse(value: string): TValue | null;
    serialize(value: TValue): string;
    defaultValue: TValue;
}

type ExtraParsers = Record<string, ExtraParser<unknown>>;

type ExtraValueFor<P> = P extends ExtraParser<infer V> ? V : never;

type ExtrasValues<E extends ExtraParsers | undefined> = E extends ExtraParsers
    ? { [K in keyof E]: ExtraValueFor<E[K]> }
    : Record<string, never>;

/**
 * Setter map keyed by the same names as {@link ExtrasValues} with each entry typed as
 * `(value: ExtraValue | null) => void`. The null branch clears the URL key entirely.
 */
type ExtrasSetters<E extends ExtraParsers | undefined> = E extends ExtraParsers
    ? { [K in keyof E as `set${Capitalize<string & K>}`]: (value: ExtraValueFor<E[K]> | null) => void }
    : Record<string, never>;

export interface UseTableViewOptions<E extends ExtraParsers | undefined = undefined> {
    /** Optional initial query applied when the URL is empty. */
    initial?: Partial<TableViewQuery>;
    /**
     * Endpoint-specific top-level extras. Each entry is a `nuqs` parser. The hook reads + writes
     * the URL key alongside the TableView grammar; setters reset `page` to `1` on every change.
     *
     * @example
     * ```ts
     * const tv = useTableView({
     *     extras: {
     *         q: parseAsString.withDefault(""),
     *         trashed: parseAsBoolean.withDefault(false),
     *     },
     * });
     * tv.q;          // string
     * tv.setQ("…");  // writes ?q=… and resets page=1
     * ```
     */
    extras?: E;
}

export interface UseTableViewBase {
    query: TableViewQuery;
    /** Replace the entire query. Caller is responsible for `page: 1` on predicate changes. */
    setQuery(next: TableViewQuery): void;
    /** Replace `filter`. Resets `page` to `1`. */
    setFilter(filter: TableViewFilter[]): void;
    /** Replace `filterOr`. Resets `page` to `1`. */
    setFilterOr(filterOr: TableViewFilter[]): void;
    /** Replace `sort`. Resets `page` to `1`. */
    setSort(sort: TableViewSort[]): void;
    setPage(page: number): void;
    setLimit(limit: number): void;
    /** Adapter for a date-picker {@link DateFilterValue}: upserts a single `filter[]` on `field`. */
    upsertDateFilter(field: string, value: DateFilterValue | null): void;
    /** Clear every predicate but keep limit + sort. */
    clearFilters(): void;
}

export type UseTableViewReturn<E extends ExtraParsers | undefined = undefined> = UseTableViewBase &
    ExtrasValues<E> &
    ExtrasSetters<E>;

export function useTableView<E extends ExtraParsers | undefined = undefined>(
    options: UseTableViewOptions<E> = {},
): UseTableViewReturn<E> {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const query = useMemo<TableViewQuery>(() => {
        const parsed = parseTableViewQuery(searchParams);
        if (options.initial !== undefined && isFreshUrl(searchParams)) {
            return { ...parsed, ...options.initial };
        }
        return parsed;
    }, [searchParams, options.initial]);

    /** Read every declared extra value once per render. Each parser receives the raw URL string
     * (or null when absent) and yields its typed value plus the default. */
    const extraValues = useMemo<Record<string, unknown>>(() => {
        const out: Record<string, unknown> = {};
        if (options.extras !== undefined) {
            for (const [key, parser] of Object.entries(options.extras)) {
                const raw = searchParams.get(key);
                out[key] = parser.parse(raw === null ? "" : raw) ?? parser.defaultValue;
            }
        }
        return out;
    }, [searchParams, options.extras]);

    /** Single write path: re-encode the TableView wire keys via the canonical serialiser, then
     * write the extras as plain `?key=value` entries. Empty / default extras are stripped so the
     * URL stays clean. */
    const writeAll = useCallback(
        (nextQuery: TableViewQuery, nextExtras: Record<string, unknown>) => {
            const params = new URLSearchParams();
            for (const [k, v] of serializeTableViewQuery(nextQuery)) params.append(k, v);
            if (options.extras !== undefined) {
                for (const [key, parser] of Object.entries(options.extras)) {
                    const value = nextExtras[key];
                    if (value === null || value === undefined || value === parser.defaultValue) continue;
                    const serialized = parser.serialize(value);
                    if (serialized === "" || serialized === null) continue;
                    params.set(key, serialized);
                }
            }
            const qs = params.toString();
            router.replace(qs.length === 0 ? pathname : `${pathname}?${qs}`);
        },
        [options.extras, pathname, router],
    );

    const writeQuery = useCallback((next: TableViewQuery) => writeAll(next, extraValues), [extraValues, writeAll]);

    const setQuery = useCallback((next: TableViewQuery) => writeQuery(next), [writeQuery]);

    const setFilter = useCallback((filter: TableViewFilter[]) => writeQuery({ ...query, filter, page: 1 }), [query, writeQuery]);

    const setFilterOr = useCallback(
        (filterOr: TableViewFilter[]) => writeQuery({ ...query, filterOr, page: 1 }),
        [query, writeQuery],
    );

    const setSort = useCallback((sort: TableViewSort[]) => writeQuery({ ...query, sort, page: 1 }), [query, writeQuery]);

    const setPage = useCallback((page: number) => writeQuery({ ...query, page }), [query, writeQuery]);

    const setLimit = useCallback((limit: number) => writeQuery({ ...query, limit, page: 1 }), [query, writeQuery]);

    const upsertDateFilter = useCallback(
        (field: string, value: DateFilterValue | null) => {
            const remaining = query.filter.filter((f) => f.field !== field);
            if (value === null) {
                writeQuery({ ...query, filter: remaining, page: 1 });
                return;
            }
            const mapped = dateFilterValueToTableViewFilter(field, value);
            if (mapped === null) {
                writeQuery({ ...query, filter: remaining, page: 1 });
                return;
            }
            writeQuery({ ...query, filter: [...remaining, mapped], page: 1 });
        },
        [query, writeQuery],
    );

    const clearFilters = useCallback(() => writeQuery({ ...query, filter: [], filterOr: [], page: 1 }), [query, writeQuery]);

    /** Build the typed `setX` mutators for each declared extra. Each setter merges into the
     * current extras map then writes both the query and the extras in one router.replace, so
     * back-to-back filter toggles don't race on URL state. */
    const extraSetters = useMemo<Record<string, (value: unknown) => void>>(() => {
        const out: Record<string, (value: unknown) => void> = {};
        if (options.extras !== undefined) {
            for (const key of Object.keys(options.extras)) {
                const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                out[setterName] = (value: unknown) => {
                    writeAll({ ...query, page: 1 }, { ...extraValues, [key]: value });
                };
            }
        }
        return out;
    }, [options.extras, query, extraValues, writeAll]);

    return {
        query,
        setQuery,
        setFilter,
        setFilterOr,
        setSort,
        setPage,
        setLimit,
        upsertDateFilter,
        clearFilters,
        ...(extraValues as ExtrasValues<E>),
        ...(extraSetters as ExtrasSetters<E>),
    } as UseTableViewReturn<E>;
}

/** True when the URL has no TableView-shaped params yet — used to honour `initial` once on mount. */
function isFreshUrl(params: URLSearchParams): boolean {
    return (
        params.get("page") === null &&
        params.get("limit") === null &&
        params.getAll("filter[]").length === 0 &&
        params.getAll("filterOr[]").length === 0 &&
        params.getAll("sort[]").length === 0
    );
}
