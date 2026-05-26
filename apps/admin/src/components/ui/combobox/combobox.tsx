"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Check, ChevronsUpDown, Search, Spinner } from "#/icons";
import { cn } from "#/lib/utils";

import type { ComboboxLabels, ComboboxOption } from "./combobox.types";

interface ComboboxProps {
    value: number | string | null;
    onValueChange: (next: number | string | null) => void;
    /** Async loader called with the debounced search query. Returns the option list to render. */
    onSearch: (query: string) => Promise<ComboboxOption[]>;
    /** Optional resolver to hydrate the trigger label when `value` is set but no search has run. */
    onResolve?: (ids: [number | string]) => Promise<ComboboxOption[]>;
    labels: Omit<ComboboxLabels, "remove" | "clearAll">;
    disabled?: boolean;
    /** Pre-load the option list once on mount (open + empty query). Useful for small taxonomies. */
    preload?: boolean;
    /** Optional renderer for the trigger label when a value is selected. Defaults to `option.label`. */
    renderTrigger?: (option: ComboboxOption | null) => React.ReactNode;
}

/**
 * Single-select async combobox. Shares the "do not pass `items`" rule with {@link MultiCombobox}
 * — the parent owns the search, this component owns the popup. The trigger displays the selected
 * label (or the placeholder); choosing a row sets the value and closes the popup.
 *
 * Use this for single-entity pickers (parent category, primary tag, default warehouse, …) where
 * the consumer needs to commit one selection. For multi-select use {@link MultiCombobox}.
 */
export function Combobox({
    value,
    onValueChange,
    onSearch,
    onResolve,
    labels,
    disabled = false,
    preload = false,
    renderTrigger,
}: ComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<ComboboxOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [resolved, setResolved] = useState<Map<number | string, ComboboxOption>>(new Map());
    const lastRequest = useRef(0);

    /** Resolve the trigger label for `value` if we haven't seen it via a search yet. */
    useEffect(() => {
        if (onResolve === undefined || value === null || resolved.has(value)) return;
        let cancelled = false;
        onResolve([value]).then((opts) => {
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
    }, [onResolve, value, resolved]);

    /** Debounced search; request-id guards against stale responses. */
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

    const selectedOption = value !== null ? (resolved.get(value) ?? null) : null;
    const triggerLabel =
        renderTrigger !== undefined ? renderTrigger(selectedOption) : (selectedOption?.label ?? labels.placeholder);

    const pick = (entityId: number | string) => {
        onValueChange(entityId);
        setOpen(false);
    };

    return (
        <BaseCombobox.Root
            open={open}
            onOpenChange={setOpen}
            inputValue={query}
            onInputValueChange={(next) => setQuery(next)}
            value=""
            onValueChange={() => undefined}
        >
            <BaseCombobox.Trigger
                render={(props) => (
                    <Button
                        {...props}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        className={cn("w-fit justify-start gap-2", selectedOption === null && "text-muted-foreground")}
                    >
                        <span className="truncate">{triggerLabel}</span>
                        <ChevronsUpDown className="ms-auto size-3.5 opacity-60" aria-hidden="true" />
                    </Button>
                )}
            />
            <BaseCombobox.Portal>
                <BaseCombobox.Positioner sideOffset={4} align="start" side="bottom" collisionPadding={16} className="z-50">
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
                                        const isSelected = value === opt.id;
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
                                                    pick(opt.id);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        pick(opt.id);
                                                    }
                                                }}
                                            >
                                                <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">
                                                    {isSelected && <Check className="size-3 text-primary" aria-hidden="true" />}
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
    );
}
Combobox.displayName = "Combobox";

export type { ComboboxProps };
