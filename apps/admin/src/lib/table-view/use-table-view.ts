"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { usePathname, useRouter } from "#/lib/i18n/navigation";

import { dateFilterValueToTableViewFilter } from "./date-adapter";
import { parseTableViewQuery, serializeTableViewQuery } from "./serialize";
import type { TableViewFilter, TableViewQuery, TableViewSort } from "./types";

import type { DateFilterValue } from "#/components/ui/date-picker/types";

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
 *
 * Consumers receive the parsed `query` plus a small set of mutators (`setFilter`, `setSort`,
 * `setPage`, …) and a `setQuery` for one-shot full-state writes. There's intentionally no
 * facets / toggles / dateFacets abstraction layered above this — pages compose those at the
 * call site by mapping their UI state directly to `TableViewFilter[]` entries.
 */
export interface UseTableViewOptions {
    /** Optional initial query applied when the URL is empty. */
    initial?: Partial<TableViewQuery>;
}

export interface UseTableViewReturn {
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

export function useTableView(options: UseTableViewOptions = {}): UseTableViewReturn {
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

    const writeQuery = useCallback(
        (next: TableViewQuery) => {
            const params = new URLSearchParams();
            for (const [k, v] of serializeTableViewQuery(next)) params.append(k, v);
            const qs = params.toString();
            router.replace(qs.length === 0 ? pathname : `${pathname}?${qs}`);
        },
        [pathname, router],
    );

    const setQuery = useCallback((next: TableViewQuery) => writeQuery(next), [writeQuery]);

    const setFilter = useCallback(
        (filter: TableViewFilter[]) => writeQuery({ ...query, filter, page: 1 }),
        [query, writeQuery],
    );

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

    const clearFilters = useCallback(
        () => writeQuery({ ...query, filter: [], filterOr: [], page: 1 }),
        [query, writeQuery],
    );

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
    };
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
