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
    labels: { asc: string; desc: string; hide: string };
}

/**
 * Three-slot column header layout:
 *
 *   [ title ─────────── ][ grip ][ sort ]
 *
 * The title is a non-interactive `<span>` — only the dedicated sort-arrow button (which doubles
 * as the dropdown trigger for asc / desc / hide) cycles the sort. The grip handle reads its
 * drag attributes from the surrounding `<ColumnDragHandleProvider>` so the same component works
 * for sortable and plain headers alike.
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

    const titleNode = (
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</span>
    );

    const gripNode = dragHandle.isDraggable ? <ColumnDragGrip /> : null;

    if (!canSort) {
        return (
            <span className={cn("group/header flex w-full min-w-0 items-center gap-0.5", className)}>
                {titleNode}
                {gripNode}
            </span>
        );
    }

    const isActive = sort !== undefined && sort.id === columnId;
    const direction = isActive ? sort.direction : undefined;

    const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;

    return (
        <span className={cn("group/header flex w-full min-w-0 items-center gap-0.5", className)}>
            {titleNode}
            {gripNode}
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={(props) => (
                        <button
                            type="button"
                            {...props}
                            aria-label={direction === "asc" ? labels.asc : direction === "desc" ? labels.desc : labels.asc}
                            className={cn(
                                "grid size-5 shrink-0 place-items-center rounded outline-none transition-colors",
                                "text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
                                isActive && "text-foreground",
                            )}
                        >
                            <Icon className="size-3.5" aria-hidden="true" />
                        </button>
                    )}
                />
                <DropdownMenuContent align="end" className="min-w-36">
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
        </span>
    );
}

/**
 * Hover-revealed drag handle. Reads the active sortable's listeners from
 * {@link useColumnDragHandle} so this same component plugs into any `<th>` that registered
 * with `<ColumnDragHandleProvider>`. Stays transparent until the row is hovered so the header
 * isn't visually cluttered when nothing is being moved.
 */
function ColumnDragGrip() {
    const handle = useColumnDragHandle();
    if (!handle.isDraggable) return null;
    return (
        <button
            type="button"
            aria-label="Drag column"
            {...(handle.attributes ?? {})}
            {...(handle.listeners ?? {})}
            className={cn(
                "grid size-4 shrink-0 cursor-grab touch-none place-items-center text-transparent outline-none transition-colors",
                "hover:!text-foreground focus-visible:!text-foreground group-hover/header:text-muted-foreground",
                handle.isDragging && "!text-foreground cursor-grabbing",
            )}
        >
            <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
    );
}
