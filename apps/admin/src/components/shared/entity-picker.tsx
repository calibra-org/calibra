"use client";

import { type ReactNode, useCallback } from "react";

import { type ComboboxOption, MultiCombobox } from "#/components/ui/combobox";

export type { ComboboxOption as EntityOption };

export interface EntityPickerProps {
    /** Selected entity ids, displayed as chips. */
    selectedIds: number[];
    onSelectionChange: (next: number[]) => void;
    /** Async loader — called with the user's typed query (debounced). */
    onSearch: (query: string) => Promise<ComboboxOption[]>;
    /** Resolver for selected ids → chip metadata. Falls back to `#${id}` when not provided. */
    onResolve?: (ids: number[]) => Promise<ComboboxOption[]>;
    /** Trigger button label when nothing is selected. */
    placeholder: string;
    /** Translation tokens — kept on the prop surface so a single picker can render in either locale. */
    labels: {
        search: string;
        empty: string;
        loading: string;
        clearAll: string;
        remove: string;
    };
    /** Disabled mode renders chips read-only without the trigger button. */
    disabled?: boolean;
    /** Optional render override for each chip. */
    renderChip?: (option: ComboboxOption) => ReactNode;
}

/**
 * Thin wrapper around the shared {@link MultiCombobox} primitive that keeps the older
 * `EntityPicker` API surface for product / category / brand pickers (they pre-date the
 * promotion to a `ui/` primitive). New consumers should reach for `MultiCombobox` directly —
 * see `components/ui/combobox.tsx`.
 */
export function EntityPicker({
    selectedIds,
    onSelectionChange,
    onSearch,
    onResolve,
    placeholder,
    labels,
    disabled = false,
    renderChip,
}: EntityPickerProps) {
    /**
     * The legacy `renderChip` signature didn't pass the `remove` callback through. Bridge it
     * by remembering the current `selectedIds` closure and re-deriving the toggle inside.
     */
    const wrappedRenderChip = useCallback(
        (opt: ComboboxOption, _remove: () => void) => renderChip?.(opt) ?? null,
        [renderChip],
    );

    return (
        <MultiCombobox
            selectedIds={selectedIds}
            onSelectionChange={(next) => onSelectionChange(next.map((id) => Number(id)))}
            onSearch={onSearch}
            onResolve={onResolve === undefined ? undefined : (ids) => onResolve(ids.map((id) => Number(id)))}
            labels={{
                placeholder,
                search: labels.search,
                empty: labels.empty,
                remove: labels.remove,
                clearAll: labels.clearAll,
            }}
            disabled={disabled}
            renderChip={renderChip !== undefined ? wrappedRenderChip : undefined}
        />
    );
}
