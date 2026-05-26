"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";

export interface ComboboxOption {
    id: number | string;
    label: string;
    sublabel?: string;
    /** Optional thumbnail URL rendered as a 32px square inside the list row + chip when present. */
    imageUrl?: string | null;
    /** Disabled rows can't be selected (e.g. items the operator already used elsewhere). */
    disabled?: boolean;
}

export interface MultiComboboxLabels {
    /** Placeholder rendered inside the trigger button when nothing is selected. */
    placeholder: string;
    /** Placeholder rendered inside the popup's search input. */
    search: string;
    /** Empty-state message when the search returned no rows. */
    empty: string;
    /** Aria label for the per-chip remove button. */
    remove: string;
    /** "Clear all" link rendered above the chip strip when 2+ items are selected. */
    clearAll: string;
}

interface BaseProps {
    selectedIds: (number | string)[];
    onSelectionChange: (next: (number | string)[]) => void;
    /**
     * Optional callback fired when an option is added to the selection. Receives the full
     * option (label, sublabel, imageUrl) so callers that need to render rich selection rows
     * (thumbnail + name + sku) can capture metadata at pick-time without re-fetching.
     */
    onAdd?: (option: ComboboxOption) => void;
    /** Optional callback fired when an option is removed; receives the option id. */
    onRemove?: (id: number | string) => void;
    /** Async loader called with the debounced search query. Returns the option list to render. */
    onSearch: (query: string) => Promise<ComboboxOption[]>;
    /**
     * Optional resolver used to fetch chip labels for ids that were never in a search-result
     * list (initial hydration of a saved record). When omitted, chips fall back to `#${id}`
     * until the operator opens the popup and the search loader fills the cache.
     */
    onResolve?: (ids: (number | string)[]) => Promise<ComboboxOption[]>;
    labels: MultiComboboxLabels;
    /** Read-only mode renders chips without the trigger button. */
    disabled?: boolean;
    /** Pre-load the option list once on mount (open + empty query). Useful for small taxonomies. */
    preload?: boolean;
    /** Optional chip renderer override. */
    renderChip?: (option: ComboboxOption, remove: () => void) => ReactNode;
}

/**
 * Multi-select async combobox — the high-quality reusable primitive for "select N entities
 * from a searchable list" interactions across the admin. Wraps Base UI's `Combobox` parts:
 *  - Popup goes through `Combobox.Portal` so it floats above any Sheet / Dialog the trigger
 *    sits in (the previous bespoke implementation rendered inline and visibly overflowed).
 *  - `Positioner` runs collision detection with 16px padding so the popup flips or shifts to
 *    fit the viewport regardless of where the trigger lives.
 *  - Items truncate long text via `min-w-0 truncate` so a 200-char product name doesn't blow
 *    the popup out horizontally.
 *  - The chip list above the trigger reuses the same `Badge` primitive every other selection
 *    UI in the admin uses, so it composes inside sheets / cards without one-off styling.
 *  - RTL-aware: `align="start"` resolves to the right edge under `dir="rtl"` automatically.
 *
 * Use this for product / category / brand pickers, the email allow-list autocomplete, the
 * customer search field on the test-runner, etc. — anywhere the spec says "pick one or more
 * entities from a remote search."
 */
export function MultiCombobox({
    selectedIds,
    onSelectionChange,
    onAdd,
    onRemove,
    onSearch,
    onResolve,
    labels,
    disabled = false,
    preload = false,
    renderChip,
}: BaseProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [resolved, setResolved] = useState<Map<number | string, ComboboxOption>>(new Map());
    const lastRequest = useRef(0);
    const id = useId();

    /** Resolve chip metadata for the currently-selected ids. */
    useEffect(() => {
        if (onResolve === undefined || selectedIds.length === 0) return;
        const missing = selectedIds.filter((sid) => !resolved.has(sid));
        if (missing.length === 0) return;
        let cancelled = false;
        onResolve(missing).then((opts) => {
            if (cancelled) return;
            setResolved((prev) => {
                const next = new Map(prev);
                for (const opt of opts) next.set(opt.id, opt);
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [onResolve, selectedIds, resolved]);

    /** Debounced search; `requestId` guards against stale responses from earlier keystrokes. */
    useEffect(() => {
        if (!open && !preload) return;
        const handle = setTimeout(async () => {
            const requestId = ++lastRequest.current;
            setIsSearching(true);
            try {
                const next = await onSearch(query);
                if (requestId !== lastRequest.current) return;
                setOptions(next);
                setResolved((prev) => {
                    const map = new Map(prev);
                    for (const opt of next) map.set(opt.id, opt);
                    return map;
                });
            } finally {
                if (requestId === lastRequest.current) setIsSearching(false);
            }
        }, 250);
        return () => clearTimeout(handle);
    }, [open, query, onSearch, preload]);

    const toggle = (entityId: number | string) => {
        if (selectedIds.includes(entityId)) {
            onSelectionChange(selectedIds.filter((existing) => existing !== entityId));
            onRemove?.(entityId);
        } else {
            onSelectionChange([...selectedIds, entityId]);
            const option = options.find((opt) => opt.id === entityId) ?? resolved.get(entityId);
            if (option !== undefined) onAdd?.(option);
        }
    };

    const removeAll = () => {
        for (const id of selectedIds) onRemove?.(id);
        onSelectionChange([]);
    };

    const selectedChips = selectedIds.map((sid) => resolved.get(sid) ?? { id: sid, label: `#${sid}` });

    return (
        <div className="flex flex-col gap-2">
            {selectedChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" id={`${id}-chips`}>
                    {selectedChips.map((opt) => {
                        const remove = () => toggle(opt.id);
                        if (renderChip !== undefined) return renderChip(opt, remove);
                        return (
                            <Badge key={String(opt.id)} variant="secondary" className="ps-2 pe-1 gap-1">
                                <span className="truncate max-w-[12rem]">{opt.label}</span>
                                {!disabled && (
                                    <button
                                        type="button"
                                        aria-label={labels.remove}
                                        onClick={remove}
                                        className="ms-1 grid size-4 place-items-center rounded hover:bg-foreground/10"
                                    >
                                        <X className="size-3" aria-hidden="true" />
                                    </button>
                                )}
                            </Badge>
                        );
                    })}
                    {!disabled && selectedChips.length > 1 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={removeAll}
                        >
                            {labels.clearAll}
                        </Button>
                    )}
                </div>
            )}
            {!disabled && (
                <BaseCombobox.Root
                    open={open}
                    onOpenChange={setOpen}
                    /**
                     * **Do not pass `items`** here. When `items` is supplied, Base UI runs its own
                     * local filter against `inputValue` using `itemToStringLabel`, and that filter
                     * runs *on top of* the parent's `onSearch` results — typing in the input then
                     * looks like "all rows still showing" because Base UI doesn't know our results
                     * came back pre-filtered from the server. Render `Combobox.Item` children
                     * directly from the resolved list and skip the items prop entirely.
                     */
                    multiple
                    inputValue={query}
                    onInputValueChange={(next) => setQuery(next)}
                    /** Selection is owned externally — Combobox just emits highlights + Enter intent. */
                    value={[]}
                    onValueChange={() => undefined}
                >
                    <BaseCombobox.Trigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit justify-start gap-2 text-muted-foreground"
                            >
                                <Search className="size-3.5" aria-hidden="true" />
                                <span>{labels.placeholder}</span>
                                <ChevronsUpDown className="ms-auto size-3.5 opacity-60" aria-hidden="true" />
                            </Button>
                        )}
                    />
                    <BaseCombobox.Portal>
                        <BaseCombobox.Positioner
                            sideOffset={4}
                            align="start"
                            side="bottom"
                            collisionPadding={16}
                            className="z-50"
                        >
                            <BaseCombobox.Popup
                                className={cn(
                                    "w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)]",
                                    "overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none",
                                    "data-[ending-style]:scale-95 data-[starting-style]:scale-95",
                                    "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                                    "transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
                                )}
                            >
                                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                                    <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    <BaseCombobox.Input
                                        placeholder={labels.search}
                                        className="h-7 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                        autoFocus
                                    />
                                    {isSearching && (
                                        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                                    )}
                                </div>
                                <ScrollArea className="max-h-[min(15rem,60vh)]">
                                    <BaseCombobox.List className="flex flex-col py-1">
                                        {options.length === 0 && !isSearching ? (
                                            <BaseCombobox.Empty className="px-3 py-4 text-center text-muted-foreground text-sm">
                                                {labels.empty}
                                            </BaseCombobox.Empty>
                                        ) : (
                                            options.map((opt) => {
                                                const isSelected = selectedIds.includes(opt.id);
                                                return (
                                                    <BaseCombobox.Item
                                                        key={String(opt.id)}
                                                        value={opt}
                                                        disabled={opt.disabled}
                                                        className={cn(
                                                            "flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-start text-sm outline-none",
                                                            "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                                                            "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                                                            isSelected && "bg-accent/40",
                                                        )}
                                                        onPointerDown={(event) => {
                                                            /** Prevent Base UI's default single-select behavior — we own selection. */
                                                            event.preventDefault();
                                                            toggle(opt.id);
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                toggle(opt.id);
                                                            }
                                                        }}
                                                    >
                                                        <span
                                                            className={cn(
                                                                "grid size-4 shrink-0 place-items-center rounded border border-border",
                                                                isSelected && "border-primary bg-primary text-primary-foreground",
                                                            )}
                                                            aria-hidden="true"
                                                        >
                                                            {isSelected && <Check className="size-3" aria-hidden="true" />}
                                                        </span>
                                                        {opt.imageUrl !== undefined && opt.imageUrl !== null && (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={opt.imageUrl}
                                                                alt=""
                                                                className="size-8 shrink-0 rounded border border-border bg-muted object-cover"
                                                                loading="lazy"
                                                            />
                                                        )}
                                                        <span className="flex min-w-0 flex-col">
                                                            <span className="truncate">{opt.label}</span>
                                                            {opt.sublabel !== undefined && (
                                                                <span className="truncate text-muted-foreground text-xs">
                                                                    {opt.sublabel}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </BaseCombobox.Item>
                                                );
                                            })
                                        )}
                                    </BaseCombobox.List>
                                </ScrollArea>
                            </BaseCombobox.Popup>
                        </BaseCombobox.Positioner>
                    </BaseCombobox.Portal>
                </BaseCombobox.Root>
            )}
        </div>
    );
}
