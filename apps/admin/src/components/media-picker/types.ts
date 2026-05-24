import type { AdminMedia } from "#/lib/types";

/**
 * Picker selection mode. Image fields use `"single"` and emit one row on confirm; product galleries
 * use `"multiple"` and emit the ordered array. The mode flips the tile affordance from a focus-ring
 * to a check-badge and switches the footer counter on.
 */
export type MediaPickerMode = "single" | "multiple";

/**
 * Toggle a media id in the current selection. Single-mode either replaces with `[id]` or clears to
 * `[]` when the same id is tapped twice; multi-mode adds or removes the id from the set.
 */
export function toggleSelection(current: readonly number[], id: number, mode: MediaPickerMode): number[] {
    if (mode === "single") {
        if (current[0] === id && current.length === 1) return [];
        return [id];
    }
    if (current.includes(id)) return current.filter((value) => value !== id);
    return [...current, id];
}

/** True when the picker has at least one media row selected — drives the Select button's disabled state. */
export function hasSelection(current: readonly number[]): boolean {
    return current.length > 0;
}

/**
 * Map a flat id set back to a hydrated row list, preserving the order the operator selected the
 * rows in. Rows the picker hasn't loaded yet (cache miss across pages) are silently dropped — the
 * caller can refetch through {@link useMedia} if it needs the missing ones.
 */
export function selectionToRows(ids: readonly number[], pool: readonly AdminMedia[]): AdminMedia[] {
    const byId = new Map<number, AdminMedia>();
    for (const row of pool) byId.set(row.id, row);
    const out: AdminMedia[] = [];
    for (const id of ids) {
        const row = byId.get(id);
        if (row !== undefined) out.push(row);
    }
    return out;
}

/** Seed the initial selection from a value the inspector is currently displaying. */
export function selectionFromValue(value: number | number[] | null | undefined): number[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return [...value];
    return [value];
}
