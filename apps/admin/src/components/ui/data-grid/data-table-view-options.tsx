"use client";

import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Radio, RadioGroup } from "#/components/ui/radio";
import { ScrollArea } from "#/components/ui/scroll-area";
import { GripVertical, RotateCcw } from "#/icons";
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
    /**
     * Persisted middle-column order + setter. When both are present each reorderable row gets a
     * drag handle and the list becomes the canonical reorder surface (mirrors the header drag).
     */
    columnOrder?: string[];
    onColumnOrderChange?: (next: string[]) => void;
    /** Pinned column ids (sticky start/end). They show in the list but can't be dragged. */
    pinnedIds?: string[];
    /** Restores visibility / order / widths / density to the page defaults. Hidden when omitted. */
    onReset?: () => void;
    labels: {
        trigger: string;
        columnsHeading: string;
        densityHeading: string;
        density: Record<DataTableDensity, string>;
        /** Accessible label for the drag handle. Required only when `onColumnOrderChange` is set. */
        reorderColumn?: string;
    };
}

/**
 * View options popover: column visibility + drag-to-reorder + a density radio in one surface so
 * the toolbar's right shoulder stays a single icon button. When `onColumnOrderChange` is wired,
 * reorderable rows carry a drag handle; pinned rows stay put. The reorder emitted here is the
 * same middle-order the header drag feeds, so both stay in sync.
 */
export function DataTableViewOptions({
    columns,
    visibility,
    onVisibilityChange,
    density,
    onDensityChange,
    columnOrder,
    onColumnOrderChange,
    pinnedIds,
    onReset,
    labels,
}: DataTableViewOptionsProps) {
    const rt = useTranslations("DataGrid");
    const [resetOpen, setResetOpen] = useState(false);
    const pinned = useMemo(() => new Set(pinnedIds ?? []), [pinnedIds]);
    const reorderEnabled = onColumnOrderChange !== undefined;

    const toggle = (id: string) => {
        onVisibilityChange({ ...visibility, [id]: visibility[id] === false });
    };

    /** A column reorders when ordering is enabled, it's hideable, and it isn't pinned to an edge. */
    const isReorderable = (item: ColumnVisibilityItem) => reorderEnabled && item.canHide && !pinned.has(item.id);

    /**
     * Show rows in the live order: reorderable columns sorted by the persisted middle order,
     * then the locked (pinned / non-hideable) rows after them. Pinned ids aren't in `columnOrder`,
     * so they naturally fall to the tail.
     */
    const orderedColumns = useMemo(() => {
        if (columnOrder === undefined || columnOrder.length === 0) return columns;
        const rank = (id: string) => {
            const index = columnOrder.indexOf(id);
            return index === -1 ? Number.MAX_SAFE_INTEGER : index;
        };
        return [...columns].sort((a, b) => rank(a.id) - rank(b.id));
    }, [columns, columnOrder]);

    const reorderableIds = useMemo(
        () => orderedColumns.filter((c) => reorderEnabled && c.canHide && !pinned.has(c.id)).map((c) => c.id),
        [orderedColumns, reorderEnabled, pinned],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id || onColumnOrderChange === undefined) return;
        const from = reorderableIds.indexOf(active.id as string);
        const to = reorderableIds.indexOf(over.id as string);
        if (from === -1 || to === -1) return;
        onColumnOrderChange(arrayMove(reorderableIds, from, to));
    };

    return (
        <>
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
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                modifiers={[restrictToVerticalAxis]}
                                onDragEnd={onDragEnd}
                            >
                                <SortableContext items={reorderableIds} strategy={verticalListSortingStrategy}>
                                    {/** `pe-2` keeps rows clear of the overlay scrollbar on the inline-end edge. */}
                                    <ul className="flex flex-col pe-2">
                                        {orderedColumns.map((column) => (
                                            <ColumnRow
                                                key={column.id}
                                                column={column}
                                                checked={visibility[column.id] !== false}
                                                reorderable={isReorderable(column)}
                                                reorderLabel={labels.reorderColumn}
                                                onToggle={() => toggle(column.id)}
                                            />
                                        ))}
                                    </ul>
                                </SortableContext>
                            </DndContext>
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
                    {onReset !== undefined && (
                        <>
                            <hr className="border-border" />
                            <div className="p-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setResetOpen(true)}
                                    className="h-8 w-full justify-start gap-2 text-muted-foreground"
                                >
                                    <RotateCcw className="size-3.5" aria-hidden="true" />
                                    {rt("reset")}
                                </Button>
                            </div>
                        </>
                    )}
                </PopoverContent>
            </Popover>
            {onReset !== undefined && (
                <AlertDialog open={resetOpen} onOpenChange={(next) => (!next ? setResetOpen(false) : undefined)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{rt("resetTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>{rt("resetDescription")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
                                {rt("resetCancel")}
                            </Button>
                            <Button
                                type="button"
                                onClick={() => {
                                    onReset();
                                    setResetOpen(false);
                                }}
                            >
                                {rt("resetConfirm")}
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}

interface ColumnRowProps {
    column: ColumnVisibilityItem;
    checked: boolean;
    reorderable: boolean;
    reorderLabel?: string;
    onToggle: () => void;
}

/** One column row: drag handle (when reorderable) + visibility checkbox + label. */
function ColumnRow({ column, checked, reorderable, reorderLabel, onToggle }: ColumnRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: column.id,
        disabled: !reorderable,
    });

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cn("flex items-center gap-1 rounded-sm", isDragging && "bg-accent/60")}
        >
            {reorderable ? (
                <button
                    type="button"
                    aria-label={reorderLabel ?? "Reorder column"}
                    {...attributes}
                    {...listeners}
                    className="grid size-6 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 outline-none hover:text-foreground focus-visible:text-foreground"
                >
                    <GripVertical className="size-3.5" aria-hidden="true" />
                </button>
            ) : (
                <span className="size-6 shrink-0" aria-hidden="true" />
            )}
            <button
                type="button"
                disabled={!column.canHide}
                onClick={() => column.canHide && onToggle()}
                className={cn(
                    "flex flex-1 cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 text-start text-sm outline-none",
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
}
