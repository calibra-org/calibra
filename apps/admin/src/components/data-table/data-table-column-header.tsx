"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff } from "lucide-react";
import type { ReactNode } from "react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";

import type { SortState } from "./types";

interface DataTableColumnHeaderProps {
    title: ReactNode;
    /** Column id used to compare against the active sort. */
    columnId: string;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHide?: () => void;
    canSort?: boolean;
    className?: string;
    /** Translated menu labels — passed in so the abstraction stays string-free. */
    labels: { asc: string; desc: string; hide: string };
}

/**
 * Sortable + hideable column header. Renders the title flush-start with a trailing icon that
 * reflects the active sort direction. Clicking the title cycles asc → desc → unsorted; the caret
 * menu exposes the same actions plus "hide column". Direction icons are visually orientation-
 * agnostic and the wrapper relies on CSS logical properties for RTL flips.
 */
export function DataTableColumnHeader({
    title,
    columnId,
    sort,
    onSort,
    onHide,
    canSort = true,
    className,
    labels,
}: DataTableColumnHeaderProps) {
    if (!canSort) {
        return <span className={cn("text-muted-foreground text-xs uppercase tracking-wide", className)}>{title}</span>;
    }

    const isActive = sort !== undefined && sort.id === columnId;
    const direction = isActive ? sort.direction : undefined;

    const cycle = () => {
        if (!isActive) return onSort({ id: columnId, direction: "asc" });
        if (direction === "asc") return onSort({ id: columnId, direction: "desc" });
        return onSort(undefined);
    };

    const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={(props) => (
                    <button
                        type="button"
                        {...props}
                        className={cn(
                            "-mx-2 flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide outline-none transition-colors",
                            "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            isActive && "text-foreground",
                            className,
                        )}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            cycle();
                        }}
                        onClick={(event) => {
                            event.preventDefault();
                            cycle();
                        }}
                    >
                        <span className="min-w-0 truncate text-start">{title}</span>
                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    </button>
                )}
            />
            <DropdownMenuContent align="start" className="min-w-36">
                <DropdownMenuItem
                    onClick={() => onSort({ id: columnId, direction: "asc" })}
                    className={cn(direction === "asc" && "text-foreground")}
                >
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                    {labels.asc}
                </DropdownMenuItem>
                <DropdownMenuItem
                    onClick={() => onSort({ id: columnId, direction: "desc" })}
                    className={cn(direction === "desc" && "text-foreground")}
                >
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                    {labels.desc}
                </DropdownMenuItem>
                {onHide !== undefined && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onHide}>
                            <EyeOff className="size-3.5" aria-hidden="true" />
                            {labels.hide}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

