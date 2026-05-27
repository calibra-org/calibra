"use client";

import { useCallback, useState } from "react";

/**
 * In-memory selection state for a list page. Selection is intentionally NOT mirrored to the URL
 * — selecting rows across pages must survive pagination but should not leak into shareable
 * links. Companion to {@link useColumnState} (persisted UI state) and {@link useTableView} (URL
 * state). Together they replace the older monolithic `useDataTable`.
 */
export function useSelectionState() {
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
    const setSelected = useCallback((next: ReadonlySet<string>) => setSelectedIds(next), []);
    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
    return { selectedIds, setSelected, clearSelection };
}

/**
 * Derive whether `selectedIds` covers every visible row of the current page — used by the
 * "select all visible" checkbox in the table header.
 */
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
