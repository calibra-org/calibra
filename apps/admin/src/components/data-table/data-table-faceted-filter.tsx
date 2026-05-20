"use client";

import { PlusCircle } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { Badge } from "#/components/ui/badge";
import { Checkbox } from "#/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";

import type { FacetedFilterDef } from "./types";

interface DataTableFacetedFilterProps {
    facet: FacetedFilterDef;
    selected: string[];
    onChange: (values: string[]) => void;
    /** Translated `Clear` label rendered as a destructive link at the bottom of the popover. */
    clearLabel: string;
    /** Translated `Selected (n)` label suffix shown when ≥1 option is checked. */
    selectedLabelFormat: (count: number) => string;
}

/**
 * Trigger + popover combo modelled on shadcn's faceted filter: a small outline button that opens
 * a Command-style list with checkboxes. Selected counts surface inline as a Badge next to the
 * label so the toolbar reads at-a-glance without opening every popover.
 */
export function DataTableFacetedFilter({
    facet,
    selected,
    onChange,
    clearLabel,
    selectedLabelFormat,
}: DataTableFacetedFilterProps) {
    const selectedSet = useMemo(() => new Set(selected), [selected]);

    const toggle = (value: string) => {
        const next = new Set(selectedSet);
        if (next.has(value)) {
            next.delete(value);
        } else if (facet.multiple === false) {
            next.clear();
            next.add(value);
        } else {
            next.add(value);
        }
        onChange(Array.from(next));
    };

    const icon: ReactNode = facet.icon ?? <PlusCircle className="size-3.5" aria-hidden="true" />;

    return (
        <Popover>
            <PopoverTrigger
                render={(props) => (
                    <button
                        type="button"
                        {...props}
                        className={cn(
                            "inline-flex h-8 items-center gap-2 rounded-md border border-input border-dashed bg-background px-2.5 text-sm outline-none transition-colors",
                            "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            selectedSet.size > 0 && "border-solid",
                        )}
                    >
                        {icon}
                        <span>{facet.label}</span>
                        {selectedSet.size > 0 && (
                            <>
                                <span className="h-4 w-px bg-border" aria-hidden="true" />
                                <Badge variant="secondary" className="rounded-sm px-1 tabular-nums text-[10px]">
                                    {selectedLabelFormat(selectedSet.size)}
                                </Badge>
                            </>
                        )}
                    </button>
                )}
            />
            <PopoverContent className="min-w-[14rem] p-0" align="start">
                <ScrollArea viewportClassName="max-h-72">
                    {facet.options.length === 0 ? (
                        <p className="px-3 py-4 text-center text-muted-foreground text-xs">—</p>
                    ) : (
                        <ul className="flex flex-col py-1">
                            {facet.options.map((option) => {
                                const isSelected = selectedSet.has(option.value);
                                return (
                                    <li key={option.value}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(option.value)}
                                            className={cn(
                                                "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-sm outline-none",
                                                "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                                            )}
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                tabIndex={-1}
                                                onCheckedChange={() => {
                                                    /** Handled by the surrounding button. */
                                                }}
                                            />
                                            {option.icon !== undefined && <span aria-hidden="true">{option.icon}</span>}
                                            <span className="flex-1 truncate">{option.label}</span>
                                            {option.count !== undefined && (
                                                <span className="tabular-nums text-muted-foreground text-xs">{option.count}</span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </ScrollArea>
                {selectedSet.size > 0 && (
                    <>
                        <hr className="border-border" />
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="block w-full px-3 py-2 text-center text-muted-foreground text-xs hover:text-foreground"
                        >
                            {clearLabel}
                        </button>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
