"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, GripVertical } from "lucide-react";
import type { ReactNode } from "react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";

import { useColumnDragHandle } from "./column-drag-handle-context";
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
    const dragHandle = useColumnDragHandle();

    if (!canSort) {
        return (
            <span className={cn("group/header inline-flex items-center gap-1", className)}>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">{title}</span>
                <ColumnDragGrip handle={dragHandle} />
            </span>
        );
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
            <span className="group/header inline-flex items-center gap-1">
            <DropdownMenuTrigger
                render={(props) => (
                    <button
                        type="button"
                        {...props}
                        className={cn(
                            "-mx-2 inline-flex h-7 items-center gap-1 rounded px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide outline-none transition-colors",
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
                        <span>{title}</span>
                        <Icon className="size-3.5" aria-hidden="true" />
                    </button>
                )}
            />
            <ColumnDragGrip handle={dragHandle} />
            </span>
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

interface ColumnDragGripProps {
    handle: ReturnType<typeof useColumnDragHandle>;
}

/**
 * Small drag handle rendered next to the column title. Reveals on hover (or while dragging) so
 * it doesn't visually compete with the title. Plumbs the surrounding sortable's listeners back
 * onto a button so keyboard users can also reorder via space + arrows.
 */
function ColumnDragGrip({ handle }: ColumnDragGripProps) {
    if (handle.isDraggable === false) return null;
    return (
        <button
            type="button"
            aria-label="Drag column"
            {...(handle.attributes ?? {})}
            {...(handle.listeners ?? {})}
            className={cn(
                "grid size-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/0 outline-none transition-colors",
                "group-hover/header:text-muted-foreground hover:text-foreground focus-visible:text-foreground",
                handle.isDragging && "cursor-grabbing text-foreground",
            )}
        >
            <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
    );
}
