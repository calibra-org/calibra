"use client";

import { Loader2, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";

export interface EntityOption {
    id: number;
    label: string;
    sublabel?: string;
    imageUrl?: string;
}

export interface EntityPickerProps {
    /** Selected entity ids, displayed as chips. */
    selectedIds: number[];
    onSelectionChange: (next: number[]) => void;
    /** Async loader — called with the user's typed query (debounced). */
    onSearch: (query: string) => Promise<EntityOption[]>;
    /** Resolver for selected ids → chip metadata. Falls back to `#${id}` when not provided. */
    onResolve?: (ids: number[]) => Promise<EntityOption[]>;
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
    renderChip?: (option: EntityOption) => ReactNode;
}

/**
 * Generic async combobox + chip list. The chip list is rendered inline above the trigger; the
 * trigger opens a popover with a debounced search input and the result list. Selection is
 * toggle-on-click — adding an already-selected entity removes it, so the same option list works
 * as both add and remove. Backed by Base UI's Popover so it inherits the existing accessibility
 * + RTL handling.
 *
 * Used by Product / Category / Brand pickers under `apps/admin/src/views/coupons/shared/`.
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
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<EntityOption[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [resolved, setResolved] = useState<Map<number, EntityOption>>(new Map());
    const lastRequest = useRef(0);
    const id = useId();

    /** Resolve chip metadata for the currently-selected ids on first render and whenever ids change. */
    useEffect(() => {
        if (onResolve === undefined || selectedIds.length === 0) return;
        let cancelled = false;
        onResolve(selectedIds).then((opts) => {
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
    }, [onResolve, selectedIds]);

    /** Debounced search. The `requestId` guard skips stale responses from earlier keystrokes. */
    useEffect(() => {
        if (!open) return;
        const handle = setTimeout(async () => {
            const requestId = ++lastRequest.current;
            setIsSearching(true);
            try {
                const next = await onSearch(query);
                if (requestId !== lastRequest.current) return;
                setOptions(next);
                /** Cache the loaded options into the resolver map so chip labels resolve immediately
                 * after selection without a second round trip. */
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
    }, [open, query, onSearch]);

    const toggle = (entityId: number) => {
        if (selectedIds.includes(entityId)) {
            onSelectionChange(selectedIds.filter((id) => id !== entityId));
        } else {
            onSelectionChange([...selectedIds, entityId]);
        }
    };

    const selectedChips = useMemo(
        () =>
            selectedIds.map((id) => {
                const option = resolved.get(id) ?? { id, label: `#${id}` };
                return option;
            }),
        [selectedIds, resolved],
    );

    return (
        <div className="flex flex-col gap-2">
            {selectedChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" id={`${id}-chips`}>
                    {selectedChips.map((opt) =>
                        renderChip !== undefined ? (
                            renderChip(opt)
                        ) : (
                            <Badge key={opt.id} variant="secondary" className="gap-1 ps-2 pe-1">
                                <span className="truncate max-w-[12rem]">{opt.label}</span>
                                {!disabled && (
                                    <button
                                        type="button"
                                        aria-label={labels.remove}
                                        onClick={() => toggle(opt.id)}
                                        className="ms-1 grid size-4 place-items-center rounded hover:bg-foreground/10"
                                    >
                                        <X className="size-3" aria-hidden="true" />
                                    </button>
                                )}
                            </Badge>
                        ),
                    )}
                    {!disabled && selectedChips.length > 1 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => onSelectionChange([])}
                        >
                            {labels.clearAll}
                        </Button>
                    )}
                </div>
            )}
            {!disabled && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger
                        render={(props) => (
                            <Button
                                {...props}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-fit justify-start gap-2"
                            >
                                <Search className="size-3.5" aria-hidden="true" />
                                {placeholder}
                            </Button>
                        )}
                    />
                    <PopoverContent align="start" className="w-80 p-0">
                        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                            <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={labels.search}
                                className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                                autoFocus
                            />
                            {isSearching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
                        </div>
                        <ScrollArea className="max-h-60">
                            {options.length === 0 && !isSearching ? (
                                <p className="px-3 py-4 text-center text-muted-foreground text-sm">{labels.empty}</p>
                            ) : (
                                <ul className="flex flex-col py-1">
                                    {options.map((opt) => {
                                        const isSelected = selectedIds.includes(opt.id);
                                        return (
                                            <li key={opt.id}>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-accent",
                                                        isSelected && "bg-accent/50",
                                                    )}
                                                    onClick={() => toggle(opt.id)}
                                                >
                                                    <span
                                                        className={cn(
                                                            "grid size-4 place-items-center rounded border border-border",
                                                            isSelected && "border-primary bg-primary text-primary-foreground",
                                                        )}
                                                        aria-hidden="true"
                                                    >
                                                        {isSelected ? "✓" : ""}
                                                    </span>
                                                    <span className="flex min-w-0 flex-col">
                                                        <span className="truncate">{opt.label}</span>
                                                        {opt.sublabel !== undefined && (
                                                            <span className="truncate text-muted-foreground text-xs">
                                                                {opt.sublabel}
                                                            </span>
                                                        )}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </ScrollArea>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
