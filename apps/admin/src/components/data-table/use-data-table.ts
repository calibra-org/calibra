"use client";

import { parseAsArrayOf, parseAsBoolean, parseAsInteger, parseAsString, useQueryState, useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DateFilterValue } from "#/components/ui/date-picker/types";
import { parseDateFilter, serializeDateFilter } from "#/components/ui/date-picker/url";

import type { DataTableDensity, DateFacetDef, FacetedFilterDef, PaginationMeta, SortState, ToggleFilterDef } from "./types";

/**
 * Default per-page selectable steps shown in the pagination footer. Callers may override via
 * {@link UseDataTableOptions.perPageOptions}.
 */
export const DEFAULT_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Shape of every key nuqs writes to the URL. We keep these literal so the test suite can
 * round-trip them without depending on the table's internals.
 */
export interface UseDataTableUrlKeys {
    page: string;
    perPage: string;
    sort: string;
    q: string;
}

const DEFAULT_KEYS: UseDataTableUrlKeys = { page: "page", perPage: "perPage", sort: "sort", q: "q" };

export interface UseDataTableOptions {
    /**
     * Stable id used to namespace `localStorage` keys for density and column visibility. Keep
     * this unique across pages so two tables on different routes don't share state.
     */
    id: string;
    /** Faceted filters whose values are mirrored to the URL. */
    facets?: FacetedFilterDef[];
    /** Boolean toggles whose value is mirrored to a single URL key. */
    toggles?: ToggleFilterDef[];
    /** Date-picker filters; each renders as a chip in the toolbar. URL-syncs the picked value. */
    dateFacets?: DateFacetDef[];
    /** Items per page allowed in the selector. Defaults to {@link DEFAULT_PER_PAGE_OPTIONS}. */
    perPageOptions?: readonly number[];
    /** Initial per-page when the URL doesn't yet specify one. Defaults to `20`. */
    defaultPerPage?: number;
    /** Override URL keys when two tables coexist on the same page. */
    urlKeys?: Partial<UseDataTableUrlKeys>;
    /** Initial column visibility per column id. Stored in `localStorage` afterwards. */
    defaultColumnVisibility?: Record<string, boolean>;
}

/**
 * Parses `?sort=name` or `?sort=-name` into {@link SortState}. Returns `undefined` for an empty
 * or missing value so the underlying query stays unsorted on first paint.
 */
export function parseSort(value: string | null): SortState | undefined {
    if (value === null || value === "") return undefined;
    if (value.startsWith("-")) return { id: value.slice(1), direction: "desc" };
    return { id: value, direction: "asc" };
}

/** Serializes a {@link SortState} back to its URL representation. */
export function serializeSort(state: SortState | undefined): string {
    if (state === undefined) return "";
    return state.direction === "desc" ? `-${state.id}` : state.id;
}

/**
 * The single hook that powers every {@link DataTable}: maintains pagination, sort, search, facet
 * filters, toggles, density, column visibility, and selection — all reconciled with the URL so
 * deep links and the back button work out of the box.
 *
 * Selection is intentionally tracked locally (in-memory) because selecting across pages must
 * survive pagination but should not leak into shareable URLs.
 */
export function useDataTable(options: UseDataTableOptions) {
    const keys = { ...DEFAULT_KEYS, ...options.urlKeys };
    const perPageOptions = options.perPageOptions ?? DEFAULT_PER_PAGE_OPTIONS;
    const defaultPerPage = options.defaultPerPage ?? 20;

    const [page, setPage] = useQueryState(keys.page, parseAsInteger.withDefault(1));
    const [perPage, setPerPage] = useQueryState(keys.perPage, parseAsInteger.withDefault(defaultPerPage));
    const [sortRaw, setSortRaw] = useQueryState(keys.sort, parseAsString.withDefault(""));
    const [q, setQ] = useQueryState(keys.q, parseAsString.withDefault(""));

    const sort = useMemo(() => parseSort(sortRaw), [sortRaw]);
    const setSort = useCallback(
        (next: SortState | undefined) => {
            void setSortRaw(serializeSort(next));
            void setPage(1);
        },
        [setSortRaw, setPage],
    );

    /**
     * Builders are intentionally untyped here — `useQueryStates` carries a generic parser map and
     * we drive its shape dynamically from the caller's facet list. The downstream getters cast
     * the values back to the expected runtime shape so consumers stay strongly typed.
     */
    const facetParsers = useMemo(() => {
        const entries: Record<string, ReturnType<ReturnType<typeof parseAsArrayOf<string>>["withDefault"]>> = {};
        for (const facet of options.facets ?? []) {
            entries[facet.paramKey] = parseAsArrayOf(parseAsString, ",").withDefault([]);
        }
        return entries;
    }, [options.facets]);

    const toggleParsers = useMemo(() => {
        const entries: Record<string, ReturnType<typeof parseAsBoolean.withDefault>> = {};
        for (const toggle of options.toggles ?? []) {
            entries[toggle.paramKey] = parseAsBoolean.withDefault(false);
        }
        return entries;
    }, [options.toggles]);

    const dateFacetParsers = useMemo(() => {
        const entries: Record<string, ReturnType<typeof parseAsString.withDefault>> = {};
        for (const facet of options.dateFacets ?? []) {
            entries[facet.paramKey] = parseAsString.withDefault("");
        }
        return entries;
    }, [options.dateFacets]);

    const [facetValuesRaw, setFacetValuesRaw] = useQueryStates(facetParsers);
    const [toggleValuesRaw, setToggleValuesRaw] = useQueryStates(toggleParsers);
    const [dateFacetValuesRaw, setDateFacetValuesRaw] = useQueryStates(dateFacetParsers);

    const facetValues = facetValuesRaw as Record<string, string[]>;
    const toggleValues = toggleValuesRaw as Record<string, boolean>;
    const dateFacetRawStrings = dateFacetValuesRaw as Record<string, string>;

    const setFacetValues = useCallback(
        (key: string, values: string[]) => {
            void setFacetValuesRaw({ [key]: values.length === 0 ? null : values });
            void setPage(1);
        },
        [setFacetValuesRaw, setPage],
    );

    const setToggleValue = useCallback(
        (key: string, value: boolean) => {
            void setToggleValuesRaw({ [key]: value ? true : null });
            void setPage(1);
        },
        [setToggleValuesRaw, setPage],
    );

    const dateFacetValues = useMemo<Record<string, DateFilterValue | null>>(() => {
        const out: Record<string, DateFilterValue | null> = {};
        for (const facet of options.dateFacets ?? []) {
            const raw = dateFacetRawStrings[facet.paramKey] ?? "";
            const calendar = facet.calendar === "auto" || facet.calendar === undefined ? "gregorian" : facet.calendar;
            out[facet.paramKey] = parseDateFilter(raw === "" ? null : raw, calendar);
        }
        return out;
    }, [options.dateFacets, dateFacetRawStrings]);

    const setDateFilterValue = useCallback(
        (key: string, value: DateFilterValue | null) => {
            const main = value === null ? null : serializeDateFilter(value).main;
            void setDateFacetValuesRaw({ [key]: main });
            void setPage(1);
        },
        [setDateFacetValuesRaw, setPage],
    );

    const clearAllFilters = useCallback(() => {
        for (const facet of options.facets ?? []) {
            void setFacetValuesRaw({ [facet.paramKey]: null });
        }
        for (const toggle of options.toggles ?? []) {
            void setToggleValuesRaw({ [toggle.paramKey]: null });
        }
        for (const facet of options.dateFacets ?? []) {
            void setDateFacetValuesRaw({ [facet.paramKey]: null });
        }
        void setQ("");
        void setPage(1);
    }, [
        options.dateFacets,
        options.facets,
        options.toggles,
        setDateFacetValuesRaw,
        setFacetValuesRaw,
        setToggleValuesRaw,
        setQ,
        setPage,
    ]);

    const hasActiveFilters =
        Object.values(facetValues).some((v) => Array.isArray(v) && v.length > 0) ||
        Object.values(toggleValues).some((v) => v === true) ||
        Object.values(dateFacetValues).some((v) => v !== null) ||
        q.length > 0;

    const [density, setDensity] = useLocalStorageState<DataTableDensity>(`admin.dataTable.${options.id}.density`, "comfortable");

    const [columnVisibility, setColumnVisibility] = useLocalStorageState<Record<string, boolean>>(
        `admin.dataTable.${options.id}.cols`,
        options.defaultColumnVisibility ?? {},
    );

    /**
     * Persisted column order. Empty array means "follow the column definition order"; the
     * consumer wires this up via TanStack's `onColumnOrderChange` so drag-reorder + the
     * column-settings popover both feed the same key.
     */
    const [columnOrder, setColumnOrder] = useLocalStorageState<string[]>(`admin.dataTable.${options.id}.order`, []);

    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
    const setSelected = useCallback((next: ReadonlySet<string>) => setSelectedIds(next), []);
    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    return {
        keys,
        page,
        perPage,
        perPageOptions,
        setPage: (next: number) => void setPage(next),
        setPerPage: (next: number) => {
            void setPerPage(next);
            void setPage(1);
        },
        sort,
        setSort,
        q,
        setQ: (next: string) => {
            void setQ(next);
            void setPage(1);
        },
        facetValues,
        setFacetValues,
        toggleValues,
        setToggleValue,
        dateFacetValues,
        setDateFilterValue,
        clearAllFilters,
        hasActiveFilters,
        density,
        setDensity,
        columnVisibility,
        setColumnVisibility,
        columnOrder,
        setColumnOrder,
        selectedIds,
        setSelected,
        clearSelection,
    };
}

/**
 * Tiny SSR-safe `localStorage` hook. We avoid pulling in usehooks-ts / zustand for one shape and
 * keep behavior tightly scoped: read on mount (so SSR hydrates with the default), write on every
 * update, swallow `JSON.parse` failures, fall back to the default when the slot is empty.
 */
function useLocalStorageState<T>(key: string, defaultValue: T): [T, (next: T) => void] {
    const [value, setValue] = useState<T>(defaultValue);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return;
            const parsed = JSON.parse(raw) as T;
            setValue(parsed);
        } catch {
            /** ignored — leave the default in place. */
        }
    }, [key]);

    const update = useCallback(
        (next: T) => {
            setValue(next);
            if (typeof window === "undefined") return;
            try {
                window.localStorage.setItem(key, JSON.stringify(next));
            } catch {
                /** ignored — quota / safari private mode. */
            }
        },
        [key],
    );

    return [value, update];
}

/** Convenience: derive whether `selectedIds` covers every visible row of the current page. */
export function isAllVisibleSelected<TData>(
    visibleRows: TData[],
    getRowId: (row: TData) => string,
    selectedIds: ReadonlySet<string>,
): "none" | "some" | "all" {
    if (visibleRows.length === 0) return "none";
    let matched = 0;
    for (const row of visibleRows) {
        if (selectedIds.has(getRowId(row))) matched += 1;
    }
    if (matched === 0) return "none";
    if (matched === visibleRows.length) return "all";
    return "some";
}

/** Convenience: produce the empty {@link PaginationMeta} shape when no data has arrived yet. */
export function emptyPaginationMeta(perPage: number): PaginationMeta {
    return { page: 1, perPage, total: 0, lastPage: 1 };
}
