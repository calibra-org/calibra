"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persisted column visibility + order + density for one list page. The state lives in
 * `localStorage` (namespaced by the caller-supplied `id` so two tables on different routes
 * don't share state) and is SSR-safe: the initial render uses the supplied defaults; the
 * persisted value rehydrates after mount.
 *
 * Companion to {@link useSelectionState} (in-memory only) and {@link useTableView} (URL state).
 * Together they replace the older monolithic `useDataTable`.
 */
export type DataTableDensity = "compact" | "comfortable" | "spacious";

export interface UseColumnStateOptions {
    /** Stable id used to namespace `localStorage` keys. */
    id: string;
    /** Initial visibility per column id. Stored in `localStorage` afterwards. */
    defaultColumnVisibility?: Record<string, boolean>;
    /** Initial density. Defaults to `"comfortable"`. */
    defaultDensity?: DataTableDensity;
}

export function useColumnState(options: UseColumnStateOptions) {
    const [density, setDensity] = useLocalStorageState<DataTableDensity>(
        `admin.dataTable.${options.id}.density`,
        options.defaultDensity ?? "comfortable",
    );

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

    return {
        density,
        setDensity,
        columnVisibility,
        setColumnVisibility,
        columnOrder,
        setColumnOrder,
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
