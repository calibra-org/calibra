"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Check, ChevronsUpDown, Search, Spinner, X } from "#/icons";
import { cn } from "#/lib/utils";

import type { ComboboxLabels, ComboboxOption } from "./combobox.types";

interface MultiComboboxProps {
    selectedIds: (number | string)[];
    onSelectionChange: (next: (number | string)[]) => void;
    /** Fired with the full option when an item is added — capture metadata at pick-time. */
    onAdd?: (option: ComboboxOption) => void;
    /** Fired with the id when an item is removed. */
    onRemove?: (id: number | string) => void;
    /** Async loader called with the debounced search query. Returns the option list to render. */
    onSearch: (query: string) => Promise<ComboboxOption[]>;
    /**
     * Optional resolver used to fetch chip labels for ids that were never in a search-result list
     * (initial hydration of a saved record). When omitted, chips fall back to `#${id}`.
     */
    onResolve?: (ids: (number | string)[]) => Promise<ComboboxOption[]>;
    labels: ComboboxLabels;
    /** Read-only mode renders chips without the trigger button. */
    disabled?: boolean;
    /** Pre-load the option list once on mount (open + empty query). Useful for small taxonomies. */
    preload?: boolean;
    /** Optional chip renderer override. */
    renderChip?: (option: ComboboxOption, remove: () => void) => ReactNode;
    /** Suppress the default chip strip — callers that render their own selection surface. */
    hideChips?: boolean;
}

/**
 * Multi-select async combobox. **Do not pass `items` to `Combobox.Root`** here — Base UI would run
 * its own local filter against the parent's already-server-filtered list, which makes typing
 * gibberish still show every option. Selection ownership is external too: this component owns the
 * displayed chip state via `selectedIds` and only emits highlight + Enter intent through Base UI.
 *
 * Used by every async multi-select interaction in the admin (product / category / brand / customer
 * pickers). Tier-4 wrappers map their domain shapes onto {@link ComboboxOption} so the underlying
 * primitive stays purely visual.
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
    hideChips = false,
}: MultiComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [resolved, setResolved] = useState<Map<number | string, ComboboxOption>>(new Map());
    const lastRequest = useRef(0);
    const id = useId();

    /**
     * Resolve chip metadata for currently-selected ids whose label hasn't been cached yet.
     *
     * Tracks every id we've already asked for in `attempted` so an `onResolve` that returns
     * zero rows for an unknown id doesn't loop: without this, `setResolved` would still emit
     * a fresh `Map` reference, retrigger this effect via the `resolved` dep, and the missing
     * id would never leave the `missing` list — runaway re-renders.
     */
    const attempted = useRef<Set<number | string>>(new Set());
    useEffect(() => {
        if (onResolve === undefined || selectedIds.length === 0) return;
        const missing = selectedIds.filter((sid) => !resolved.has(sid) && !attempted.current.has(sid));
        if (missing.length === 0) return;
        for (const sid of missing) attempted.current.add(sid);
        let cancelled = false;
        onResolve(missing).then((opts) => {
            if (cancelled || opts.length === 0) return;
            setResolved((prev) => {
                let next: Map<number | string, ComboboxOption> | null = null;
                for (const opt of opts) {
                    if (prev.get(opt.id) === opt) continue;
                    if (next === null) next = new Map(prev);
                    next.set(opt.id, opt);
                }
                return next ?? prev;
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
        for (const sid of selectedIds) onRemove?.(sid);
        onSelectionChange([]);
    };

    const selectedChips = selectedIds.map((sid) => resolved.get(sid) ?? { id: sid, label: `#${sid}` });

    return (
        <div className="flex flex-col gap-2">
            {!hideChips && selectedChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" id={`${id}-chips`}>
                    {selectedChips.map((opt) => {
                        const remove = () => toggle(opt.id);
                        if (renderChip !== undefined) return renderChip(opt, remove);
                        return (
                            <Badge key={String(opt.id)} variant="secondary" className="gap-1 ps-2 pe-1">
                                <span className="max-w-[12rem] truncate">{opt.label}</span>
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
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={removeAll}>
                            {labels.clearAll}
                        </Button>
                    )}
                </div>
            )}
            {!disabled && (
                <div className="flex flex-wrap items-center gap-2">
                    <BaseCombobox.Root
                        open={open}
                        onOpenChange={setOpen}
                        multiple
                        inputValue={query}
                        onInputValueChange={(next) => setQuery(next)}
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
                                    <div className="flex items-center gap-2 border-border border-b px-3 py-2">
                                        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        <BaseCombobox.Input
                                            placeholder={labels.search}
                                            className="h-7 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                            autoFocus
                                        />
                                        {isSearching && <Spinner size="sm" className="text-muted-foreground" />}
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
                                                                    isSelected &&
                                                                        "border-primary bg-primary text-primary-foreground",
                                                                )}
                                                                aria-hidden="true"
                                                            >
                                                                {isSelected && <Check className="size-3" aria-hidden="true" />}
                                                            </span>
                                                            {opt.imageUrl !== undefined && opt.imageUrl !== null && (
                                                                // biome-ignore lint/performance/noImgElement: lazy-loaded thumbnail of an arbitrary URL
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
                    {hideChips && selectedIds.length > 0 && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={removeAll}>
                            {labels.clearAll}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
MultiCombobox.displayName = "MultiCombobox";

export type { ComboboxLabels as MultiComboboxLabels, MultiComboboxProps };
