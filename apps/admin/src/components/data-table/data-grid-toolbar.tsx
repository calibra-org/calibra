"use client";

import { type ReactNode, useMemo } from "react";

import { ActiveFilterChips, DataTableToolbar } from "#/components/data-table/data-table-toolbar";
import { DataTableViewOptions } from "#/components/data-table/data-table-view-options";
import type { DataTableDensity, FacetedFilterDef, ToggleFilterDef } from "#/components/data-table/types";

export interface ColumnVisibilityItem {
    id: string;
    label: ReactNode;
    canHide: boolean;
}

export interface DataGridToolbarLabels {
    searchPlaceholder: string;
    refresh: string;
    clearAll: string;
    clearFilter: string;
    selectedCount: (n: number) => string;
    viewOptions: string;
    columnsHeading: string;
    densityHeading: string;
    density: Record<DataTableDensity, string>;
}

export interface DataGridToolbarProps {
    /** Bound search input value + setter. */
    q: string;
    onQChange: (next: string) => void;

    /** Faceted filter defs (multi-select chips). */
    facets: FacetedFilterDef[];
    facetValues: Record<string, string[]>;
    onFacetValuesChange: (paramKey: string, values: string[]) => void;

    /** Single-toggle filters (booleans). */
    toggles?: ToggleFilterDef[];
    toggleValues?: Record<string, boolean>;
    onToggleChange?: (paramKey: string, value: boolean) => void;

    /** Columns the operator can show / hide from the view-options popover. */
    columns: ColumnVisibilityItem[];
    columnVisibility: Record<string, boolean>;
    onColumnVisibilityChange: (next: Record<string, boolean>) => void;

    /** Row-padding density preset, persisted by the parent table. */
    density: DataTableDensity;
    onDensityChange: (next: DataTableDensity) => void;

    onRefresh?: () => void;

    /** Single labels namespace — one i18n bag per list page. */
    labels: DataGridToolbarLabels;

    /** Optional extra trigger rendered before the view-options button (e.g. saved-filter dropdown). */
    leadingRightSlot?: ReactNode;

    /** Optional callback fired by the chip-row's `×` next to each individual filter pill. */
    onClearFacetValue?: (paramKey: string, value: string) => void;
}

/**
 * Toolbar for any list page. Composes the existing primitives (`DataTableToolbar` for the
 * search/facets/toggles row, `DataTableViewOptions` for the columns + density popover, and
 * `ActiveFilterChips` for the chip strip) behind a single props surface so a list page never
 * re-wires the same labels + computed state. The `hasActiveFilters` flag and the active-chip
 * derivation are computed internally from the facet + toggle state — consumers pass state,
 * not derived flags.
 *
 * Convention: every list page uses one `[Entity].toolbar.*` i18n namespace that maps to
 * `DataGridToolbarLabels`. See `DETAIL_PAGE.md` and `DATA_GRID.md` next to this file.
 */
export function DataGridToolbar({
    q,
    onQChange,
    facets,
    facetValues,
    onFacetValuesChange,
    toggles = [],
    toggleValues = {},
    onToggleChange,
    columns,
    columnVisibility,
    onColumnVisibilityChange,
    density,
    onDensityChange,
    onRefresh,
    labels,
    leadingRightSlot,
    onClearFacetValue,
}: DataGridToolbarProps) {
    const hasActiveFilters =
        q.length > 0 ||
        Object.values(facetValues).some((arr) => Array.isArray(arr) && arr.length > 0) ||
        Object.values(toggleValues).some((v) => v === true);

    const chips = useMemo(() => {
        const out: { key: string; value: string; label: ReactNode }[] = [];
        for (const facet of facets) {
            const values = facetValues[facet.paramKey] ?? [];
            for (const v of values) {
                const opt = facet.options.find((o) => o.value === v);
                out.push({ key: facet.paramKey, value: v, label: opt?.label ?? v });
            }
        }
        return out;
    }, [facets, facetValues]);

    const removeChip = (key: string, value: string) => {
        if (onClearFacetValue !== undefined) {
            onClearFacetValue(key, value);
            return;
        }
        const next = (facetValues[key] ?? []).filter((v) => v !== value);
        onFacetValuesChange(key, next);
    };

    const clearAll = () => {
        onQChange("");
        for (const facet of facets) onFacetValuesChange(facet.paramKey, []);
        if (onToggleChange !== undefined) {
            for (const toggle of toggles) onToggleChange(toggle.paramKey, false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <DataTableToolbar
                searchPlaceholder={labels.searchPlaceholder}
                q={q}
                onQChange={onQChange}
                facets={facets}
                facetValues={facetValues}
                onFacetValuesChange={onFacetValuesChange}
                toggles={toggles}
                toggleValues={toggleValues}
                onToggleChange={onToggleChange ?? (() => undefined)}
                hasActiveFilters={hasActiveFilters}
                onClearAll={clearAll}
                onRefresh={onRefresh}
                labels={{
                    clearAll: labels.clearAll,
                    refresh: labels.refresh,
                    selectedCount: labels.selectedCount,
                    clearFilter: labels.clearFilter,
                }}
                rightSlot={
                    <div className="flex items-center gap-2">
                        {leadingRightSlot}
                        <DataTableViewOptions
                            columns={columns}
                            visibility={columnVisibility}
                            onVisibilityChange={onColumnVisibilityChange}
                            density={density}
                            onDensityChange={onDensityChange}
                            labels={{
                                trigger: labels.viewOptions,
                                columnsHeading: labels.columnsHeading,
                                densityHeading: labels.densityHeading,
                                density: labels.density,
                            }}
                        />
                    </div>
                }
            />
            <ActiveFilterChips chips={chips} onRemove={removeChip} />
        </div>
    );
}

/**
 * Helper that turns a flat translation namespace (`Coupons.toolbar`) into a
 * `DataGridToolbarLabels` bag. Pass it the `t` function and the search placeholder string;
 * everything else is pulled from the same namespace by convention. Used by every list page
 * so the i18n surface stays uniform — see `DATA_GRID.md`.
 */
export function buildDataGridToolbarLabels(
    t: (key: string, values?: Record<string, string | number>) => string,
    searchPlaceholder: string,
): DataGridToolbarLabels {
    return {
        searchPlaceholder,
        refresh: t("refresh"),
        clearAll: t("toolbar.clearAll"),
        clearFilter: t("toolbar.clearFilter"),
        selectedCount: (n: number) => t("bulk.selectedCount", { count: n }),
        viewOptions: t("toolbar.viewOptions"),
        columnsHeading: t("toolbar.columns"),
        densityHeading: t("toolbar.density"),
        density: {
            comfortable: t("toolbar.densityComfortable"),
            cozy: t("toolbar.densityCozy"),
            compact: t("toolbar.densityCompact"),
        },
    };
}
