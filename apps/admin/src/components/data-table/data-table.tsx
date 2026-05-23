"use client";

import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    type ColumnDef,
    type ColumnOrderState,
    type ExpandedState,
    flexRender,
    getCoreRowModel,
    getExpandedRowModel,
    type Header,
    type Row,
    type RowSelectionState,
    useReactTable,
    type VisibilityState,
} from "@tanstack/react-table";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { cn } from "#/lib/utils";

import { ColumnDragHandleProvider } from "./column-drag-handle-context";
import { DataTableEmpty } from "./data-table-empty";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableSkeleton } from "./data-table-skeleton";
import {
    type BulkActionsRenderer,
    type CardRenderer,
    type DataTableDensity,
    DENSITY_CLASSES,
    type PaginationMeta,
    type SortState,
    type SubRowRenderer,
} from "./types";

export interface DataTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData, unknown>[];
    /** Tracks state of the in-page selection. Resolved by id, not array index. */
    getRowId: (row: TData) => string;
    meta: PaginationMeta;
    perPageOptions: readonly number[];

    /** Pagination handlers — server-driven. */
    onPageChange: (page: number) => void;
    onPerPageChange: (perPage: number) => void;

    /**
     * Active sort state and setter. Kept on the props surface so the toolbar and consumer code
     * can serialize them through the same hook; the table itself doesn't consume them — column
     * headers are wired with the same state via {@link DataTableColumnHeader}.
     */
    sort?: SortState | undefined;
    onSortChange?: (next: SortState | undefined) => void;

    /** Selection state — owned outside the table for cross-page persistence. */
    selectedIds: ReadonlySet<string>;
    onSelectedIdsChange: (next: ReadonlySet<string>) => void;

    /** Column visibility map. Undefined keys = visible. */
    columnVisibility: Record<string, boolean>;
    onColumnVisibilityChange: (next: Record<string, boolean>) => void;

    /** Persisted column order. Empty array means "follow column definition order". */
    columnOrder?: string[];
    onColumnOrderChange?: (next: string[]) => void;

    density: DataTableDensity;

    /** Loading + error states from the consumer's query. */
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;

    /** Toolbar rendered above the body. Pass a {@link DataTableToolbar} or a custom node. */
    toolbar?: ReactNode;
    /** Bulk-action bar rendered when ≥1 row is selected. */
    bulkActions?: BulkActionsRenderer<TData>;

    /** Inline sub-row, e.g. the Quick Edit panel. Single-row expansion is enforced. */
    renderSubComponent?: SubRowRenderer<TData>;
    /** Controlled expanded row id (single-row expansion). Pass `undefined` to collapse. */
    expandedRowId?: string;
    /** Setter for the controlled expanded row id. Called with `undefined` when the row collapses. */
    onExpandedRowIdChange?: (rowId: string | undefined) => void;

    /**
     * Optional per-row render override. When the function returns a non-`undefined` node, the
     * row's regular cells are replaced by a single colspan cell hosting that node. Keyed
     * independently of the single-row Quick Edit expansion so the two can coexist (e.g. Gmail-
     * style "row was just trashed — Undo?" strips for any number of rows simultaneously).
     */
    renderRowOverride?: (row: Row<TData>) => ReactNode | undefined;

    /** Optional renderer for the stacked mobile layout. When omitted, the table is shown on all sizes. */
    renderCard?: CardRenderer<TData>;

    /** Labels rendered by the embedded pagination/empty/error pieces. */
    labels: {
        empty: { title: ReactNode; description?: ReactNode };
        filtered: { title: ReactNode; description?: ReactNode };
        clearFiltersLabel?: string;
        errorTitle: ReactNode;
        errorRetry: string;
        pagination: {
            rowsPerPage: string;
            showing: (from: number, to: number, total: number) => string;
            selectedOf: (selected: number, total: number) => string;
            first: string;
            previous: string;
            next: string;
            last: string;
            pageOf: (page: number, lastPage: number) => string;
        };
    };

    /** Locale-aware number formatter (Persian digits in `fa`). */
    formatNumber: (value: number) => string;

    /** Skeleton column widths so the loading state mirrors the real column layout. */
    skeletonColumnWidths?: number[];

    /** Optional helper rendered when filters yielded no rows; called by the empty state's secondary button. */
    onClearFilters?: () => void;
    hasActiveFilters?: boolean;

    /** Keyboard nav: `j`/`k` step through rows, `x` toggles selection, `e` opens sub-row, `Enter` opens detail. */
    onRowOpen?: (row: TData) => void;
}

/**
 * Generic data table built on TanStack Table v8. Pagination, sort, and filtering are server
 * driven — the consumer hands in a controlled slice of data and the table renders it. Selection
 * is tracked by row id externally so it survives pagination.
 *
 * Keyboard navigation is intentional: `j`/`k` step focus through rows, `x` toggles selection,
 * `e` opens the sub-row when {@link renderSubComponent} is provided, `Enter` calls
 * {@link onRowOpen}. We don't flip these keys under RTL — bindings stay reading-order agnostic.
 */
export function DataTable<TData>({
    data,
    columns,
    getRowId,
    meta,
    perPageOptions,
    onPageChange,
    onPerPageChange,
    sort: _sort,
    onSortChange: _onSortChange,
    selectedIds,
    onSelectedIdsChange,
    columnVisibility,
    onColumnVisibilityChange,
    columnOrder,
    onColumnOrderChange,
    density,
    isLoading = false,
    isError = false,
    onRetry,
    toolbar,
    bulkActions,
    renderSubComponent,
    expandedRowId,
    onExpandedRowIdChange,
    renderRowOverride,
    renderCard,
    labels,
    formatNumber,
    skeletonColumnWidths,
    onClearFilters,
    hasActiveFilters,
    onRowOpen,
}: DataTableProps<TData>) {
    /**
     * Single-row expansion driven by the controlled `expandedRowId` prop when provided. Falls
     * back to local state for callers that don't need to drive expansion from the outside.
     */
    const [internalExpanded, setInternalExpanded] = useState<ExpandedState>({});
    const expanded: ExpandedState = expandedRowId !== undefined ? { [expandedRowId]: true } : internalExpanded;
    const setExpanded = (updater: ExpandedState | ((prev: ExpandedState) => ExpandedState)) => {
        const next = typeof updater === "function" ? updater(expanded) : updater;
        if (onExpandedRowIdChange !== undefined) {
            const keys = Object.keys(next as Record<string, boolean>).filter(
                (id) => (next as Record<string, boolean>)[id] === true,
            );
            onExpandedRowIdChange(keys[0]);
        } else {
            setInternalExpanded(next);
        }
    };

    /** Mirror selection state into the shape TanStack Table expects so flexRender access works. */
    const rowSelection = useMemo<RowSelectionState>(() => {
        const out: RowSelectionState = {};
        for (const id of selectedIds) out[id] = true;
        return out;
    }, [selectedIds]);

    const visibilityState = useMemo<VisibilityState>(() => {
        const out: VisibilityState = {};
        for (const [id, visible] of Object.entries(columnVisibility)) out[id] = visible;
        return out;
    }, [columnVisibility]);

    /**
     * Reconcile the persisted column order against the live column set:
     *  - Pinned columns (`select`, `actions`) are forced to the start / end regardless of what's
     *    in localStorage. This protects against stale persisted orders dropping the checkbox
     *    column off-viewport or pushing the row-actions menu out of its sticky cell.
     *  - Among the unpinned middle columns the user's persisted order wins; ids that no longer
     *    exist drop out; newly-added columns slot in at the tail.
     *  - An empty persisted order falls back to TanStack's natural definition order.
     */
    const PINNED_START_IDS = useMemo(() => new Set(["select", "favorite"]), []);
    const PINNED_END_IDS = useMemo(() => new Set(["actions"]), []);

    const effectiveColumnOrder = useMemo<ColumnOrderState>(() => {
        const allIds = columns.map((column) => column.id).filter((id): id is string => typeof id === "string");
        const startIds = allIds.filter((id) => PINNED_START_IDS.has(id));
        const endIds = allIds.filter((id) => PINNED_END_IDS.has(id));
        const middleIds = allIds.filter((id) => !PINNED_START_IDS.has(id) && !PINNED_END_IDS.has(id));

        if (columnOrder === undefined || columnOrder.length === 0) {
            return [...startIds, ...middleIds, ...endIds];
        }
        const known = new Set(middleIds);
        const ordered = columnOrder.filter((id) => known.has(id));
        const seen = new Set(ordered);
        const appended = middleIds.filter((id) => !seen.has(id));
        return [...startIds, ...ordered, ...appended, ...endIds];
    }, [columns, columnOrder, PINNED_START_IDS, PINNED_END_IDS]);

    const table = useReactTable<TData>({
        data,
        columns,
        getRowId,
        state: {
            rowSelection,
            columnVisibility: visibilityState,
            columnOrder: effectiveColumnOrder,
            expanded,
        },
        enableRowSelection: true,
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        pageCount: meta.lastPage,
        onRowSelectionChange: (updater) => {
            const next = typeof updater === "function" ? updater(rowSelection) : updater;
            const ids = new Set<string>(selectedIds);
            const visibleIds = new Set(data.map((row) => getRowId(row)));
            for (const id of visibleIds) {
                if (next[id] === true) ids.add(id);
                else ids.delete(id);
            }
            onSelectedIdsChange(ids);
        },
        onColumnVisibilityChange: (updater) => {
            const next = typeof updater === "function" ? updater(visibilityState) : updater;
            onColumnVisibilityChange(next as Record<string, boolean>);
        },
        onColumnOrderChange: (updater) => {
            if (onColumnOrderChange === undefined) return;
            const next = typeof updater === "function" ? updater(effectiveColumnOrder) : updater;
            /** Persist only the middle columns — pinned ids are recomputed on every read. */
            const middleOnly = next.filter((id) => !PINNED_START_IDS.has(id) && !PINNED_END_IDS.has(id));
            onColumnOrderChange(middleOnly);
        },
        onExpandedChange: setExpanded,
        getCoreRowModel: getCoreRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        getRowCanExpand: () => renderSubComponent !== undefined,
    });

    /** DnD sensors — pointer / touch / keyboard with a small activation distance so clicks don't trigger a drag. */
    const dndSensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (over === null || active.id === over.id) return;
            const current = effectiveColumnOrder;
            const oldIndex = current.indexOf(active.id as string);
            const newIndex = current.indexOf(over.id as string);
            if (oldIndex === -1 || newIndex === -1) return;
            const next = arrayMove(current, oldIndex, newIndex);
            /** Persist only the middle columns — pinned ids are recomputed on every read. */
            const middleOnly = next.filter((id) => !PINNED_START_IDS.has(id) && !PINNED_END_IDS.has(id));
            onColumnOrderChange?.(middleOnly);
        },
        [effectiveColumnOrder, onColumnOrderChange, PINNED_START_IDS, PINNED_END_IDS],
    );

    /** Pinned columns stay put — only data columns participate in sorting. */
    const sortableHeaderIds = useMemo(
        () => effectiveColumnOrder.filter((id) => !PINNED_START_IDS.has(id) && !PINNED_END_IDS.has(id)),
        [effectiveColumnOrder, PINNED_START_IDS, PINNED_END_IDS],
    );

    const visibleRows = table.getRowModel().rows;
    const cellClass = DENSITY_CLASSES[density].cell;
    const rowHeightClass = DENSITY_CLASSES[density].row;

    const lastFocusedIndex = useRef<number>(0);

    const onTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (visibleRows.length === 0) return;
        const target = event.target as HTMLElement;
        // Don't hijack typing inside inputs / contenteditable.
        if (target.matches('input, textarea, [contenteditable="true"]')) return;

        const move = (delta: number) => {
            const next = (lastFocusedIndex.current + delta + visibleRows.length) % visibleRows.length;
            lastFocusedIndex.current = next;
            const targetRow = event.currentTarget.querySelector<HTMLElement>(`[data-row-index="${next}"]`);
            targetRow?.focus();
        };

        switch (event.key) {
            case "j":
            case "ArrowDown":
                event.preventDefault();
                move(1);
                break;
            case "k":
            case "ArrowUp":
                event.preventDefault();
                move(-1);
                break;
            case "x": {
                event.preventDefault();
                const row = visibleRows[lastFocusedIndex.current];
                row.toggleSelected();
                break;
            }
            case "e": {
                if (renderSubComponent === undefined) return;
                event.preventDefault();
                const row = visibleRows[lastFocusedIndex.current];
                /** Single-row expansion: collapse everything else first. */
                setExpanded({ [row.id]: !(expanded as Record<string, boolean>)[row.id] });
                break;
            }
            case "Enter": {
                if (onRowOpen === undefined) return;
                event.preventDefault();
                const row = visibleRows[lastFocusedIndex.current];
                onRowOpen(row.original);
                break;
            }
        }
    };

    /** Ensure the focused index doesn't fall outside the new page after pagination changes. */
    useEffect(() => {
        if (lastFocusedIndex.current >= visibleRows.length) {
            lastFocusedIndex.current = Math.max(0, visibleRows.length - 1);
        }
    }, [visibleRows.length]);

    return (
        <div className="flex flex-col gap-3">
            {toolbar}
            {/**
             * The wrapper traps `j` / `k` / `x` / `e` / `Enter` for row navigation. Individual
             * rows are focusable (tabIndex 0) and reachable via Tab; the wrapper just listens for
             * key events bubbling up from the active row.
             */}
            {/* biome-ignore lint/a11y/useSemanticElements: a single <table> can't host the toolbar / pagination siblings; the inner <table> still carries the grid semantics */}
            <div className="overflow-hidden rounded-lg border border-border bg-card" onKeyDown={onTableKeyDown} role="grid">
                {/** Desktop / tablet: real <table>. */}
                <div className={cn("hidden md:block", renderCard !== undefined && "md:block")}>
                    {/**
                     * Table uses native overflow scrolling so the sticky `<th>` cells anchor to a
                     * real CSS scroll context (Base UI's `ScrollArea` `Viewport` clips children
                     * in a way that confuses `position: sticky` on `<th>`). `overflow-auto` lets
                     * the table scroll horizontally *within its card* when columns don't fit the
                     * viewport — the global `body { overflow-x: hidden }` still prevents
                     * page-level horizontal scrolling. The `custom-scrollbar` utility in
                     * `globals.css` repaints both bars to the slim aesthetic of `<ScrollArea>`.
                     */}
                    <div className="custom-scrollbar max-h-[calc(100dvh-22rem)] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
                        <DndContext
                            /**
                             * Stable id prevents the hydration mismatch coming from dnd-kit's
                             * auto-incrementing accessibility ids (`DndDescribedBy-N`) — those
                             * use a module-level counter, so SSR and CSR render different values
                             * when multiple DndContexts mount in any order. A fixed id scopes
                             * the counter to this table.
                             */
                            id="data-table-columns"
                            sensors={dndSensors}
                            collisionDetection={closestCenter}
                            modifiers={[restrictToHorizontalAxis]}
                            onDragEnd={onDragEnd}
                        >
                            <SortableContext items={sortableHeaderIds} strategy={horizontalListSortingStrategy}>
                                <Table className="w-full border-collapse">
                                    <TableHeader>
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <TableRow key={headerGroup.id} className="border-border border-b">
                                                {headerGroup.headers.map((header) => (
                                                    <SortableHeader key={header.id} header={header} cellClass={cellClass} />
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableHeader>
                                    <TableBody>
                                        {isError && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={table.getVisibleLeafColumns().length}
                                                    className="bg-destructive/5 px-4 py-3"
                                                >
                                                    <div className="flex items-center gap-3 text-destructive">
                                                        <AlertTriangle className="size-4" aria-hidden="true" />
                                                        <span className="text-sm">{labels.errorTitle}</span>
                                                        {onRetry !== undefined && (
                                                            <Button size="sm" variant="ghost" onClick={onRetry}>
                                                                {labels.errorRetry}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}

                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={table.getVisibleLeafColumns().length}
                                                    className="p-0 [&]:px-0 [&]:py-0"
                                                >
                                                    <DataTableSkeleton
                                                        columnWidths={
                                                            skeletonColumnWidths ?? table.getVisibleLeafColumns().map(() => 1)
                                                        }
                                                        rowHeightClass={rowHeightClass}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ) : visibleRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={table.getVisibleLeafColumns().length}
                                                    className="p-0 [&]:px-0 [&]:py-0"
                                                >
                                                    <DataTableEmpty
                                                        variant={hasActiveFilters === true ? "filtered" : "empty"}
                                                        title={
                                                            hasActiveFilters === true ? labels.filtered.title : labels.empty.title
                                                        }
                                                        description={
                                                            hasActiveFilters === true
                                                                ? labels.filtered.description
                                                                : labels.empty.description
                                                        }
                                                        secondaryAction={
                                                            hasActiveFilters === true && onClearFilters !== undefined
                                                                ? {
                                                                      label: labels.clearFiltersLabel ?? "Clear",
                                                                      onClick: onClearFilters,
                                                                  }
                                                                : undefined
                                                        }
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            visibleRows.map((row, rowIndex) => (
                                                <DataTableBodyRow
                                                    key={row.id}
                                                    row={row}
                                                    rowIndex={rowIndex}
                                                    cellClass={cellClass}
                                                    rowHeightClass={rowHeightClass}
                                                    renderSubComponent={renderSubComponent}
                                                    rowOverride={renderRowOverride?.(row)}
                                                    onRowOpen={onRowOpen}
                                                />
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>

                {/** Mobile: stacked cards. Only mounted when the caller provides a card renderer. */}
                {renderCard !== undefined && (
                    <div className="flex flex-col divide-y divide-border md:hidden">
                        {visibleRows.length === 0 && !isLoading ? (
                            <DataTableEmpty
                                variant={hasActiveFilters === true ? "filtered" : "empty"}
                                title={hasActiveFilters === true ? labels.filtered.title : labels.empty.title}
                                description={hasActiveFilters === true ? labels.filtered.description : labels.empty.description}
                            />
                        ) : (
                            visibleRows.map((row) => (
                                <div key={row.id} className="px-4 py-3">
                                    {renderCard(row)}
                                </div>
                            ))
                        )}
                    </div>
                )}

                <DataTablePagination
                    meta={meta}
                    perPageOptions={perPageOptions}
                    onPageChange={onPageChange}
                    onPerPageChange={onPerPageChange}
                    selectedCount={selectedIds.size}
                    labels={labels.pagination}
                    formatNumber={formatNumber}
                />
            </div>
            {selectedIds.size > 0 && bulkActions !== undefined ? (
                <BulkActionsHost
                    selectedCount={selectedIds.size}
                    render={bulkActions}
                    table={table}
                    selectedIds={selectedIds}
                    onClear={() => onSelectedIdsChange(new Set())}
                />
            ) : null}
        </div>
    );
}

interface SortableHeaderProps<TData> {
    header: Header<TData, unknown>;
    cellClass: string;
}

/**
 * `<th>` wrapper that registers with the surrounding `SortableContext`. Pinned columns
 * (`select` / `actions`) skip dnd and render in place. While dragging the cell is translated
 * via the `transform` returned by `useSortable`; opacity drops so the source position is still
 * visible under the cursor.
 */
const SORTABLE_HEADER_PINNED = new Set(["select", "favorite", "actions"]);
/**
 * Subset of `SORTABLE_HEADER_PINNED` whose leading divider should be suppressed. The
 * start-side cluster (`select`, `favorite`) sits flush with the row gutter, so a divider
 * between them reads as noise. `actions` lives at the end and benefits from a leading
 * divider that separates the row-actions cell from the last data column.
 */
const SORTABLE_HEADER_NO_LEADING_DIVIDER = new Set(["select", "favorite"]);

function SortableHeader<TData>({ header, cellClass }: SortableHeaderProps<TData>) {
    const isPinned = SORTABLE_HEADER_PINNED.has(header.column.id);
    const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
        id: header.column.id,
        disabled: isPinned,
    });

    const explicitWidth = header.column.columnDef.size;
    const widthStyle: CSSProperties =
        explicitWidth !== undefined ? { width: explicitWidth, minWidth: explicitWidth, maxWidth: explicitWidth } : {};
    const dragStyle: CSSProperties = isPinned
        ? {}
        : {
              transform: CSS.Translate.toString(transform),
              opacity: isDragging ? 0.7 : 1,
              zIndex: isDragging ? 2 : undefined,
              position: isDragging ? ("relative" as const) : undefined,
          };

    const headerMeta = header.column.columnDef.meta as { headerClassName?: string } | undefined;

    return (
        <ColumnDragHandleProvider attributes={attributes} listeners={listeners} isDragging={isDragging} isDraggable={!isPinned}>
            <TableHead
                ref={setNodeRef}
                /**
                 * Sticky on each `<th>` (not the `<thead>`) — `<thead>` sticky breaks when there's
                 * an inner `overflow-x-auto` ancestor. Cell-level sticky anchors directly to the
                 * outer scroll viewport every time.
                 *
                 * The `[&+th]:border-s` selector adds a 1px leading separator to every header cell
                 * *after* the first, drawing a thin divider between header columns without needing
                 * to track the index here.
                 */
                className={cn(
                    cellClass,
                    "relative sticky top-0 z-10 bg-muted/95 text-start text-xs backdrop-blur supports-[backdrop-filter]:bg-muted/70",
                    "group/header",
                    /**
                     * Full-height vertical separator drawn as an absolutely positioned pseudo-
                     * element. `<th>` + `border-collapse: collapse` + logical-property borders are
                     * rendered inconsistently across browsers when the cell also has a
                     * backdrop-filter / sticky positioning combo — a pseudo element is the most
                     * deterministic way to draw the divider. `foreground/15` stays tone-neutral
                     * and visible in both modes regardless of the muted header background.
                     */
                    "before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-foreground/8 before:content-['']",
                    "first:before:hidden",
                    /** Start-side pinned cells (select / favorite) sit flush with the row gutter — actions keeps its leading divider. */
                    SORTABLE_HEADER_NO_LEADING_DIVIDER.has(header.column.id) && "before:hidden",
                    headerMeta?.headerClassName,
                )}
                style={{ ...widthStyle, ...dragStyle }}
            >
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
            </TableHead>
        </ColumnDragHandleProvider>
    );
}

interface BodyRowProps<TData> {
    row: Row<TData>;
    rowIndex: number;
    cellClass: string;
    rowHeightClass: string;
    renderSubComponent?: SubRowRenderer<TData>;
    /** When set, the row's cells are replaced by this node (Gmail-style trash-with-undo). */
    rowOverride?: ReactNode;
    onRowOpen?: (row: TData) => void;
}

function DataTableBodyRow<TData>({
    row,
    rowIndex,
    cellClass,
    rowHeightClass,
    renderSubComponent,
    rowOverride,
    onRowOpen,
}: BodyRowProps<TData>) {
    const isExpanded = row.getIsExpanded();
    const visibleCellCount = row.getVisibleCells().length;

    /**
     * Row override wins over QuickEdit expansion — a pending-undo strip stays visible even if
     * the operator started a Quick Edit on the same row before clicking trash.
     */
    if (rowOverride !== undefined) {
        return (
            <TableRow className="border-border border-y bg-muted/40">
                <TableCell colSpan={visibleCellCount} className="p-0">
                    {rowOverride}
                </TableCell>
            </TableRow>
        );
    }

    /**
     * Quick Edit takes over the entire row WordPress-style — when expanded, the row's regular
     * cells are replaced by a single full-width cell hosting the editor. Saves us a stacked
     * sub-row that competed with the original row for context.
     */
    if (isExpanded && renderSubComponent !== undefined) {
        return (
            <TableRow className="border-primary/30 border-y bg-muted/30">
                <TableCell colSpan={visibleCellCount} className="p-0">
                    {renderSubComponent(row)}
                </TableCell>
            </TableRow>
        );
    }

    return (
        <TableRow
            tabIndex={0}
            data-row-index={rowIndex}
            data-state={row.getIsSelected() ? "selected" : undefined}
            className={cn(
                rowHeightClass,
                "outline-none transition-colors focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
                "group/row hover:bg-muted/40",
                row.getIsSelected() && "bg-accent/40",
            )}
            onClick={(event) => {
                if (onRowOpen === undefined) return;
                const target = event.target as HTMLElement;
                /** Don't navigate when the click landed on an interactive descendant. */
                if (target.closest("button, a, input, label, [role='menuitem']") !== null) return;
            }}
        >
            {row.getVisibleCells().map((cell) => {
                const explicitWidth = cell.column.columnDef.size;
                return (
                    <TableCell
                        key={cell.id}
                        className={cn(
                            cellClass,
                            /** Mirror of the header pseudo-divider — same opacity so header + body grid read as one. */
                            "relative before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-foreground/8 before:content-['']",
                            "first:before:hidden",
                            SORTABLE_HEADER_NO_LEADING_DIVIDER.has(cell.column.id) && "before:hidden",
                            (cell.column.columnDef.meta as { cellClassName?: string } | undefined)?.cellClassName,
                        )}
                        style={
                            explicitWidth !== undefined
                                ? { width: explicitWidth, minWidth: explicitWidth, maxWidth: explicitWidth }
                                : undefined
                        }
                    >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                );
            })}
        </TableRow>
    );
}

interface BulkActionsHostProps<TData> {
    selectedCount: number;
    selectedIds: ReadonlySet<string>;
    render: BulkActionsRenderer<TData>;
    table: ReturnType<typeof useReactTable<TData>>;
    onClear: () => void;
}

function BulkActionsHost<TData>({ selectedCount, selectedIds, render, table, onClear }: BulkActionsHostProps<TData>) {
    if (selectedCount === 0) return null;
    return <>{render({ table, selectedIds, clearSelection: onClear })}</>;
}

/** Re-export a small grab-bag so consumers can avoid deep imports. */
export type { LucideIcon };
