"use client";

import { RefreshCw, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { DateFilterChip, type DateFilterValue } from "#/components/ui/date-picker";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";

import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import type { DateFacetDef, FacetedFilterDef, ToggleFilterDef } from "./types";

interface DataTableToolbarProps {
    searchPlaceholder: string;
    q: string;
    onQChange: (value: string) => void;
    facets?: FacetedFilterDef[];
    facetValues: Record<string, string[]>;
    onFacetValuesChange: (key: string, values: string[]) => void;
    toggles?: ToggleFilterDef[];
    toggleValues: Record<string, boolean>;
    onToggleChange: (key: string, value: boolean) => void;
    /** Date-picker filter chips. Renders one {@link DateFilterChip} per entry. */
    dateFacets?: DateFacetDef[];
    dateFacetValues?: Record<string, DateFilterValue | null>;
    onDateFacetChange?: (key: string, value: DateFilterValue | null) => void;
    /** Locale forwarded to the date chips (operator labels + calendar selection). */
    locale?: "fa" | "en";
    hasActiveFilters: boolean;
    onClearAll: () => void;
    onRefresh?: () => void;
    rightSlot?: ReactNode;
    labels: {
        clearAll: string;
        refresh: string;
        selectedCount: (n: number) => string;
        clearFilter: string;
    };
    /**
     * Debounce in ms before `onQChange` fires. Keystrokes inside the window are coalesced into a
     * single update so each character doesn't kick off a new network round-trip.
     */
    searchDebounceMs?: number;
}

/**
 * Toolbar band that sits above the table body. Contains the debounced search box, the faceted
 * filter row, the active-filter chips, and an end-aligned right slot (typically the view options
 * popover + refresh button). The component is uncontrolled internally for the search input
 * only — every other piece of state is driven by props so the consumer stays the source of truth.
 */
export function DataTableToolbar({
    searchPlaceholder,
    q,
    onQChange,
    facets = [],
    facetValues,
    onFacetValuesChange,
    toggles = [],
    toggleValues,
    onToggleChange,
    dateFacets = [],
    dateFacetValues = {},
    onDateFacetChange,
    locale = "fa",
    hasActiveFilters,
    onClearAll,
    onRefresh,
    rightSlot,
    labels,
    searchDebounceMs = 250,
}: DataTableToolbarProps) {
    const [localQ, setLocalQ] = useState(q);

    useEffect(() => {
        setLocalQ(q);
    }, [q]);

    useEffect(() => {
        if (localQ === q) return;
        const timer = window.setTimeout(() => onQChange(localQ), searchDebounceMs);
        return () => window.clearTimeout(timer);
    }, [localQ, q, onQChange, searchDebounceMs]);

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1 basis-64">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    type="search"
                    value={localQ}
                    onChange={(event) => setLocalQ(event.target.value)}
                    placeholder={searchPlaceholder}
                    className="h-9 ps-9"
                    aria-label={searchPlaceholder}
                />
            </div>

            {facets.map((facet) => (
                <DataTableFacetedFilter
                    key={facet.paramKey}
                    facet={facet}
                    selected={facetValues[facet.paramKey] ?? []}
                    onChange={(next) => onFacetValuesChange(facet.paramKey, next)}
                    clearLabel={labels.clearFilter}
                    selectedLabelFormat={labels.selectedCount}
                />
            ))}

            {dateFacets.map((facet) => (
                <DateFilterChip
                    key={facet.paramKey}
                    fieldLabel={facet.label}
                    value={dateFacetValues[facet.paramKey] ?? null}
                    onChange={(next) => onDateFacetChange?.(facet.paramKey, next)}
                    locale={locale}
                    calendar={facet.calendar === "auto" ? undefined : facet.calendar}
                    allowedOperators={facet.allowedOperators}
                    allowedGranularities={facet.allowedGranularities}
                />
            ))}

            {toggles.map((toggle) => {
                const active = toggleValues[toggle.paramKey] === true;
                return (
                    <button
                        key={toggle.paramKey}
                        type="button"
                        onClick={() => onToggleChange(toggle.paramKey, !active)}
                        className={cn(
                            "inline-flex h-8 items-center gap-2 rounded-md border border-input border-dashed bg-background px-2.5 text-sm outline-none transition-colors",
                            "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            active && "border-warning/60 bg-warning/60 text-warning dark:bg-warning/10 dark:text-warning",
                        )}
                        aria-pressed={active}
                    >
                        {toggle.icon}
                        <span>{toggle.label}</span>
                    </button>
                );
            })}

            {hasActiveFilters && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearAll}
                    className="h-8 px-2 text-muted-foreground text-xs hover:text-foreground"
                >
                    <X className="size-3.5" aria-hidden="true" />
                    {labels.clearAll}
                </Button>
            )}

            <div className="ms-auto flex items-center gap-1.5">
                {rightSlot}
                {onRefresh !== undefined && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={onRefresh}
                        aria-label={labels.refresh}
                        title={labels.refresh}
                    >
                        <RefreshCw className="size-4" aria-hidden="true" />
                    </Button>
                )}
            </div>
        </div>
    );
}

/**
 * Renders one removable chip per selected facet value. Caller resolves option metadata
 * (label + tone) so the chip stays presentation-only.
 */
export function ActiveFilterChips({
    chips,
    onRemove,
}: {
    chips: { key: string; value: string; label: ReactNode }[];
    onRemove: (key: string, value: string) => void;
}) {
    if (chips.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
                <Badge key={`${chip.key}:${chip.value}`} variant="secondary" className="gap-1 ps-2 pe-1">
                    <span>{chip.label}</span>
                    <button
                        type="button"
                        onClick={() => onRemove(chip.key, chip.value)}
                        className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                        aria-label="Remove"
                    >
                        <X className="size-3" aria-hidden="true" />
                    </button>
                </Badge>
            ))}
        </div>
    );
}
