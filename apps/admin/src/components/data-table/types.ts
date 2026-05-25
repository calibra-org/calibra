import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import type { ReactNode } from "react";

import type { Calendar, Granularity, Operator } from "#/components/ui/date-picker";

/**
 * Comfort levels for row + cell padding, persisted per table id in `localStorage` under
 * `admin.dataTable.<id>.density`. Defaults to `comfortable`.
 */
export type DataTableDensity = "compact" | "cozy" | "comfortable";

/** Padding tuple `[row height class, cell padding class]` for a given density. */
export const DENSITY_CLASSES: Record<DataTableDensity, { row: string; cell: string }> = {
    comfortable: { row: "h-14", cell: "px-4 py-3" },
    cozy: { row: "h-12", cell: "px-3.5 py-2.5" },
    compact: { row: "h-10", cell: "px-3 py-2" },
};

/**
 * Sort direction the table emits to the server. `desc` is encoded as a leading hyphen in the
 * `?sort=` URL parameter (`?sort=-price` ⇒ price desc, `?sort=price` ⇒ asc) so a single key
 * round-trips both pieces of state.
 */
export type SortDirection = "asc" | "desc";

export interface SortState {
    id: string;
    direction: SortDirection;
}

/**
 * Definition for one entry in the toolbar's faceted filter row. The table is told *which* facets
 * exist; producing the option list (with counts) is the caller's job — pass them in via
 * `options`. Selected values are mirrored to the URL under `paramKey` as a comma-separated list.
 */
export interface FacetedFilterDef<TValue extends string = string> {
    /** Stable id; also the URL search-param key. */
    paramKey: string;
    /** Button label shown when nothing is selected. */
    label: string;
    /** When `true`, the popover allows multiple checkboxes — values are joined with `,`. */
    multiple?: boolean;
    /** Choices to render inside the popover. `count` is rendered as a trailing muted number. */
    options: { value: TValue; label: ReactNode; count?: number; icon?: ReactNode }[];
    /** Icon for the trigger button. Defaults to a PlusCircle. */
    icon?: ReactNode;
}

/**
 * Single-toggle filter (e.g. a `Favorites only` star). Behaves like a checkbox over a single
 * URL key — when on, `?<paramKey>=1`; when off, the key is removed.
 */
export interface ToggleFilterDef {
    paramKey: string;
    label: string;
    icon?: ReactNode;
}

/**
 * Configuration for a date filter facet — the date-picker counterpart to {@link FacetedFilterDef}.
 * Renders as a {@link DateFilterChip} in the toolbar; URL-syncs the picked value under
 * `paramKey`, and (when {@link legacyParamKeys} is set) also writes legacy `<after>` / `<before>`
 * keys so backends that haven't migrated to the unified shape still receive what they expect.
 */
export interface DateFacetDef {
    paramKey: string;
    label: string;
    allowedOperators?: Operator[];
    allowedGranularities?: Granularity[];
    defaultGranularity?: Granularity;
    /** Override the auto-derived calendar (default: pick from active locale). */
    calendar?: Calendar | "auto";
    /**
     * Legacy URL keys for back-compat. When set, the table writes the resolved `after` / `before`
     * Gregorian ISO date strings into these keys alongside the unified `paramKey`. Server-repos
     * that haven't migrated keep working untouched.
     */
    legacyParamKeys?: { after?: string; before?: string };
}

/** Card renderer used when the table collapses to a stacked mobile list. */
export type CardRenderer<TData> = (row: Row<TData>) => ReactNode;

/** Sub-row renderer (e.g. Quick Edit panel) used when a row is expanded. */
export type SubRowRenderer<TData> = (row: Row<TData>) => ReactNode;

export interface BulkActionContext<TData> {
    table: Table<TData>;
    selectedIds: ReadonlySet<string>;
    clearSelection: () => void;
}

export type BulkActionsRenderer<TData> = (ctx: BulkActionContext<TData>) => ReactNode;

/**
 * Lightweight echo of the API pagination envelope — passed straight from the caller's query
 * result. Used to drive the footer (current page, total pages, total rows).
 */
export interface PaginationMeta {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
}

export type { ColumnDef, Row, Table };
