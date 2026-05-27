import { useCallback, useMemo } from "react";

import type { DateFilterValue } from "#/components/ui/date-picker/types";

import { dateFilterValueToTableViewFilter } from "./date-adapter";
import { parseDateFilter, serializeDateFilter } from "#/components/ui/date-picker/url";

import type { TableViewFilter, TableViewPrimitive, TableViewQuery, TableViewSort } from "./types";

/**
 * Per-facet mapping from a toolbar `paramKey` to its underlying TableView column + operator.
 * Used by {@link useFacetValuesFromQuery} + {@link useSetFacetValue} to project a list page's
 * faceted filter UI onto the canonical TableView `filter[]` array.
 */
export interface FacetColumnSpec {
    /** Canonical TableView field name (e.g. `country_default`). */
    field: string;
    /** Operator the wire emits — usually `in` for multi-select facets, `eq` for single-value. */
    op: "in" | "eq";
    /** Optional value transform applied on writes (e.g. uppercase for ISO country codes). */
    transform?: (value: string) => string;
}

export type FacetColumnMap = Record<string, FacetColumnSpec>;

/**
 * Derive the toolbar's `facetValues: Record<string, string[]>` shape from a {@link TableViewQuery}.
 * For each declared facet, scans `query.filter` for an entry whose `field` matches the column
 * mapping and projects its values onto a string array.
 */
export function useFacetValuesFromQuery(query: TableViewQuery, facetMap: FacetColumnMap): Record<string, string[]> {
    return useMemo(() => {
        const out: Record<string, string[]> = {};
        for (const [paramKey, spec] of Object.entries(facetMap)) {
            const entry = query.filter.find((f) => f.field === spec.field);
            if (entry === undefined) {
                out[paramKey] = [];
                continue;
            }
            const raw = entry.value;
            out[paramKey] = Array.isArray(raw)
                ? raw.map((v) => String(v))
                : raw === null || raw === undefined
                  ? []
                  : [String(raw)];
        }
        return out;
    }, [query.filter, facetMap]);
}

/**
 * Write a facet value through to the underlying TableView `filter[]` array. Replaces the
 * facet's existing entry (if any) and resets page to 1 — same semantics as the legacy
 * `useDataTable.setFacetValues`. Empty arrays remove the entry entirely.
 */
export function useSetFacetValue(
    query: TableViewQuery,
    setFilter: (filter: TableViewFilter[]) => void,
    facetMap: FacetColumnMap,
) {
    return useCallback(
        (paramKey: string, values: string[]) => {
            const spec = facetMap[paramKey];
            if (spec === undefined) return;
            const others = query.filter.filter((f) => f.field !== spec.field);
            if (values.length === 0) {
                setFilter(others);
                return;
            }
            const transformed = spec.transform ? values.map(spec.transform) : (values as readonly TableViewPrimitive[]);
            const next: TableViewFilter = {
                field: spec.field,
                op: spec.op,
                value: spec.op === "in" ? transformed : transformed[0]!,
            };
            setFilter([...others, next]);
        },
        [query.filter, setFilter, facetMap],
    );
}

/**
 * Date-facet projection — maps toolbar paramKey → TableView column. The picker's
 * `DateFilterValue` flows through {@link dateFilterValueToTableViewFilter} to produce the
 * single TableView filter entry (`between`, `gte`, or `lte`).
 *
 * Returns the picker value the date-chip should render (parsed from the corresponding filter
 * entry's bounds — best-effort) and a setter that upserts the filter via the supplied
 * `upsertDateFilter` helper (from {@link useTableView}).
 */
export interface DateFacetColumnSpec {
    field: string;
    calendar: "auto" | "gregorian" | "jalali";
}

export type DateFacetColumnMap = Record<string, DateFacetColumnSpec>;

/**
 * Derive each date facet's URL-shaped string value (the legacy `<op>:<value>` form that the
 * date-chip primitive parses). Best-effort: reads a `serializeDateFilter`-style key from the
 * URL via {@link useSearchParams} on the caller side — we accept the raw key map here.
 */
export function useDateFacetValues(
    rawValues: Record<string, string>,
    facetMap: DateFacetColumnMap,
): Record<string, DateFilterValue | null> {
    return useMemo(() => {
        const out: Record<string, DateFilterValue | null> = {};
        for (const [paramKey, spec] of Object.entries(facetMap)) {
            const raw = rawValues[paramKey] ?? "";
            const calendar = spec.calendar === "auto" || spec.calendar === undefined ? "gregorian" : spec.calendar;
            out[paramKey] = parseDateFilter(raw === "" ? null : raw, calendar);
        }
        return out;
    }, [rawValues, facetMap]);
}

/**
 * Serialise the date-picker value back into the legacy `<op>:<value>` URL form (so the chip
 * can keep parsing/displaying it the same way) plus, separately, project it onto a
 * TableViewFilter the wire consumer cares about. Caller writes the legacy form to the
 * date-chip's nuqs key and the TableView filter to `tv.setFilter`.
 */
export function serializeDateFacetForUrl(value: DateFilterValue | null): string | null {
    if (value === null) return null;
    return serializeDateFilter(value).main;
}

/**
 * Translate a date-picker `DateFilterValue` to a single `TableViewFilter` entry on `field`.
 * Mirrors the {@link dateFilterValueToTableViewFilter} export but accepts `null` and forwards
 * `null` through — convenient for callers that want to remove the chip in one shot.
 */
export function dateFacetToTableViewFilter(field: string, value: DateFilterValue | null): TableViewFilter | null {
    if (value === null) return null;
    return dateFilterValueToTableViewFilter(field, value);
}

/**
 * Translate a single sort state ({@link DataTableColumnHeader} style — `{id, direction}`) to a
 * TableView sort entry. Returns an empty array when sort is undefined so callers can spread
 * directly into the query.
 */
export function singleSortToTableView(sort: { id: string; direction: "asc" | "desc" } | undefined): TableViewSort[] {
    if (sort === undefined) return [];
    return [{ field: sort.id, dir: sort.direction }];
}

/**
 * Inverse of {@link singleSortToTableView} — read the first sort entry from the TableView
 * query and project to the legacy `{id, direction}` shape that the column-header component
 * expects. Returns `undefined` when no sort is set (matches the legacy contract).
 */
export function tableViewToSingleSort(sort: TableViewSort[]): { id: string; direction: "asc" | "desc" } | undefined {
    const first = sort[0];
    if (first === undefined) return undefined;
    return { id: first.field, direction: first.dir };
}
