"use client";

import { Settings2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Radio, RadioGroup } from "#/components/ui/radio";
import { ScrollArea } from "#/components/ui/scroll-area";
import { cn } from "#/lib/utils";

import type { DataTableDensity } from "./types";

interface ColumnVisibilityItem {
    id: string;
    label: ReactNode;
    /** Columns flagged as not hideable (e.g. select, actions) render in the list but are disabled. */
    canHide: boolean;
}

interface DataTableViewOptionsProps {
    columns: ColumnVisibilityItem[];
    visibility: Record<string, boolean>;
    onVisibilityChange: (next: Record<string, boolean>) => void;
    density: DataTableDensity;
    onDensityChange: (next: DataTableDensity) => void;
    labels: {
        trigger: string;
        columnsHeading: string;
        densityHeading: string;
        density: Record<DataTableDensity, string>;
    };
}

/**
 * View options popover: groups column visibility checkboxes and the density radio in one
 * surface so the toolbar's right shoulder stays at a single icon button.
 */
export function DataTableViewOptions({
    columns,
    visibility,
    onVisibilityChange,
    density,
    onDensityChange,
    labels,
}: DataTableViewOptionsProps) {
    const toggle = (id: string) => {
        onVisibilityChange({ ...visibility, [id]: visibility[id] === false });
    };

    return (
        <Popover>
            <PopoverTrigger
                render={(props) => (
                    <Button {...props} variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground">
                        <Settings2 className="size-4" aria-hidden="true" />
                        <span className="hidden sm:inline">{labels.trigger}</span>
                    </Button>
                )}
            />
            <PopoverContent align="end" className="w-64 p-0">
                <div className="flex flex-col gap-1 p-2">
                    <p className="px-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        {labels.columnsHeading}
                    </p>
                    <ScrollArea viewportClassName="max-h-72">
                        <ul className="flex flex-col">
                            {columns.map((column) => {
                                const checked = visibility[column.id] !== false;
                                return (
                                    <li key={column.id}>
                                        <button
                                            type="button"
                                            disabled={!column.canHide}
                                            onClick={() => column.canHide && toggle(column.id)}
                                            className={cn(
                                                "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm outline-none",
                                                "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                                                !column.canHide && "cursor-not-allowed opacity-50",
                                            )}
                                        >
                                            <Checkbox
                                                checked={checked}
                                                disabled={!column.canHide}
                                                tabIndex={-1}
                                                onCheckedChange={() => {
                                                    /** Handled by the surrounding button. */
                                                }}
                                            />
                                            <span className="flex-1 truncate">{column.label}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </ScrollArea>
                </div>
                <hr className="border-border" />
                <div className="flex flex-col gap-1 p-2">
                    <p className="px-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        {labels.densityHeading}
                    </p>
                    <RadioGroup
                        value={density}
                        onValueChange={(value) => onDensityChange(value as DataTableDensity)}
                        className="flex flex-col gap-0.5"
                    >
                        {(["comfortable", "cozy", "compact"] as const).map((option) => (
                            // biome-ignore lint/a11y/noLabelWithoutControl: Radio.Root is a focusable button — wrapping it in a label is the right click-into pattern for Base UI's RadioGroup
                            <label
                                key={option}
                                className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm outline-none",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    density === option && "text-foreground",
                                )}
                            >
                                <Radio value={option} />
                                <span className="flex-1">{labels.density[option]}</span>
                            </label>
                        ))}
                    </RadioGroup>
                </div>
            </PopoverContent>
        </Popover>
    );
}
