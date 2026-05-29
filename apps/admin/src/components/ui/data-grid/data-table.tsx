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
    type ColumnSizingState,
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
import {
    type CSSProperties,
    type KeyboardEvent,
    memo,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { Button } from "#/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { cn } from "#/lib/utils";

import { ColumnDragHandleProvider } from "./column-drag-handle-context";
import { DataTableEmpty } from "./data-table-empty";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableSkeleton } from "./data-table-skeleton";
import {
    buildStickyPlan,
    type PlannableColumn,
    resolveStickyCell,
    resolveStickyHeader,
    type StickyConfig,
    type StickyPlan,
} from "./sticky-columns";
import {
    type BulkActionsRenderer,
    type CardRenderer,
    type DataTableDensity,
    DENSITY_CLASSES,
    type PaginationMeta,
    type SortState,
    type SubRowRenderer,
} from "./types";

const DEFAULT_STICKY_CONFIG: StickyConfig = { start: ["select", "favorite"], end: ["actions"] };

/**
 * Sticky-column wiring lives in `./sticky-columns.ts`. The data-table builds a plan once per
 * render from the visible columns + the `stickyColumns` prop, then asks the helpers for
 * per-cell className + style + data-attrs. RTL flipping is automatic because the plan speaks
 * `inset-inline-{start,end}` logical properties.
 */

/**
 * Watches a scroll container's `scrollLeft` (or its RTL equivalent) and writes `data-x-scroll-
 * start` / `data-x-scroll-end` attributes that the sticky cells read to toggle their edge
 * shadows. Browsers disagree on what `scrollLeft` means under `dir="rtl"` — Firefox / WebKit
 * use negative values, Chromium uses positive starting from 0 at the start edge. We normalize
 * by reading `Math.abs(scrollLeft)` and comparing against `scrollWidth - clientWidth`.
 */
function useStickyEdgeShadows(scrollRef: RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        const el = scrollRef.current;
        if (el === null) return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const maxScroll = el.scrollWidth - el.clientWidth;
            const offset = Math.abs(el.scrollLeft);
            const hasStart = offset > 1;
            const hasEnd = maxScroll - offset > 1;
            el.toggleAttribute("data-x-scroll-start", hasStart);
            el.toggleAttribute("data-x-scroll-end", hasEnd);
            /**
             * Viewport-width CSS var consumed by {@link VIEWPORT_CELL_CONTENT_CLASS}. "Viewport-wide"
             * cells (Quick Edit sub-row, empty state, error banner, skeleton) live inside a
             * `<td colSpan={all}>` that stretches across the full scrollable table. The inner
             * wrapper uses this var as its explicit `width` + `position: sticky` to stay pinned
             * inside the visible viewport regardless of horizontal scroll — so Quick Edit's
             * buttons never fall off-screen behind the scroll band.
             */
            el.style.setProperty("--dt-viewport-width", `${el.clientWidth}px`);
            /**
             * Paint `data-sticky-edge` on every sticky cell — the CSS shadow selector also requires
             * `data-sticky-edge-position='edge'`, so interior pinned cells stay flat. Setting the
             * attribute even on interior cells (when their cluster has scroll behind it) is fine —
             * the position predicate is the gate.
             */
            for (const cell of el.querySelectorAll<HTMLElement>("[data-sticky='start']")) {
                cell.dataset.stickyEdge = hasStart ? "start-shadow" : "";
            }
            for (const cell of el.querySelectorAll<HTMLElement>("[data-sticky='end']")) {
                cell.dataset.stickyEdge = hasEnd ? "end-shadow" : "";
            }
        };
        const schedule = () => {
            if (frame !== 0) return;
            frame = requestAnimationFrame(update);
        };
        update();
        el.addEventListener("scroll", schedule, { passive: true });
        const observer = new ResizeObserver(schedule);
        observer.observe(el);
        return () => {
            el.removeEventListener("scroll", schedule);
            observer.disconnect();
            if (frame !== 0) cancelAnimationFrame(frame);
        };
    }, [scrollRef]);
}

/**
 * Inner-cell wrapper for "viewport-wide" content (Quick Edit sub-row, empty state, error
 * banner, loading skeleton). The cell itself spans every column via `colSpan`, so its width is
 * the full scrollable table width. This inner wrapper pins to the inline-start edge of the
 * scroll container via `position: sticky` and reads `--dt-viewport-width` (written by
 * {@link useStickyEdgeShadows}) so the rendered content stays exactly the size of the visible
 * viewport — no horizontal scroll required to reach the buttons inside.
 *
 * `width` is applied as an inline style (not a Tailwind arbitrary-value class) so the comma in
 * the `var()` fallback doesn't trip up Tailwind's class-extractor. RTL flips for free because
 * `start-0` maps to `inset-inline-start: 0`.
 */
const VIEWPORT_CELL_CONTENT_CLASS = "sticky start-0";
const VIEWPORT_CELL_CONTENT_STYLE: CSSProperties = { width: "var(--dt-viewport-width, 100%)" };

export interface DataTableProps<TData> {
    data: TData[];
    columns: ColumnDef<TData, unknown>[];
    /** Tracks state of the in-page selection. Resolved by id, not array index. */
    getRowId: (row: TData) => string;
    meta: PaginationMeta;
    limitOptions: readonly number[];

    /** Pagination handlers — server-driven. */
    onPageChange: (page: number) => void;
    onLimitChange: (limit: number) => void;

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

    /**
     * Persisted per-column widths (`{ [columnId]: px }`). When omitted the table keeps resize
     * state in memory only (still draggable, just not persisted across reloads). Wire it to
     * {@link useColumnState}'s `columnSizing` to persist.
     */
    columnSizing?: Record<string, number>;
    onColumnSizingChange?: (next: Record<string, number>) => void;

    density: DataTableDensity;

    /** Loading + error states from the consumer's query. */
    isLoading?: boolean;
    isError?: boolean;
    onRetry?: () => void;

    /** Toolbar rendered above the body. Pass a {@link DataTableToolbar} or a custom node. */
    toolbar?: ReactNode;
    /** Bulk-action bar rendered when ≥1 row is selected. */
    bulkActions?: BulkActionsRenderer<TData>;

    /**
     * Suppress the bottom pagination strip. Use for inline editor surfaces that are constrained
     * to a single product / parent (e.g. a product's sellable versions) where a "1-N of N"
     * footer just consumes vertical space without ever advancing the page.
     */
    hidePagination?: boolean;

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

    /**
     * Sticky-column plan. See `./sticky-columns.ts` for the full design. Columns listed in
     * `start` pin to the inline-start edge in their declared order; `end` pins to the inline-end
     * edge. Only the edge column of each cluster draws the scroll shadow — interior pinned
     * columns sit flat behind it.
     *
     * Falls back to `{ start: ["select", "favorite"], end: ["actions"] }` when omitted so
     * existing consumers keep working without touching every call site.
     */
    stickyColumns?: StickyConfig;
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
    limitOptions,
    onPageChange,
    onLimitChange,
    sort: _sort,
    onSortChange: _onSortChange,
    stickyColumns,
    selectedIds,
    onSelectedIdsChange,
    columnVisibility,
    onColumnVisibilityChange,
    columnOrder,
    onColumnOrderChange,
    columnSizing,
    onColumnSizingChange,
    density,
    isLoading = false,
    isError = false,
    onRetry,
    toolbar,
    bulkActions,
    hidePagination = false,
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

    /**
     * Column widths. Controlled + persisted when the caller passes `columnSizing`; otherwise the
     * table keeps them in memory so resizing still works (just not across reloads).
     */
    const [internalSizing, setInternalSizing] = useState<ColumnSizingState>({});
    const sizingState: ColumnSizingState = columnSizing ?? internalSizing;
    const applySizing = useCallback(
        (next: ColumnSizingState) => {
            if (onColumnSizingChange !== undefined) onColumnSizingChange(next);
            else setInternalSizing(next);
        },
        [onColumnSizingChange],
    );

    /**
     * Resize maths invert under RTL (drag-start grows the column toward the inline-start edge).
     * The locale sets `dir` on `<html>` and a locale switch is a full navigation, so reading it
     * once at mount is correct. SSR has no `document` → defaults to ltr (no DOM output depends on
     * this, so there's no hydration mismatch).
     */
    const resizeDirection: "ltr" | "rtl" =
        typeof document !== "undefined" && document.documentElement.dir === "rtl" ? "rtl" : "ltr";

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
    const resolvedStickyConfig = stickyColumns ?? DEFAULT_STICKY_CONFIG;
    const PINNED_START_IDS = useMemo(() => new Set(resolvedStickyConfig.start ?? []), [resolvedStickyConfig.start]);
    const PINNED_END_IDS = useMemo(() => new Set(resolvedStickyConfig.end ?? []), [resolvedStickyConfig.end]);

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
            columnSizing: sizingState,
            expanded,
        },
        enableRowSelection: true,
        enableColumnResizing: true,
        columnResizeMode: "onChange",
        columnResizeDirection: resizeDirection,
        /** Floor/ceiling + a reasonable default so unsized columns don't collapse or sprawl. */
        defaultColumn: { minSize: 80, size: 150, maxSize: 640 },
        onColumnSizingChange: (updater) => {
            const next = typeof updater === "function" ? updater(sizingState) : updater;
            applySizing(next);
        },
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

    /**
     * Union of `start` + `end` pinned ids, used by SortableHeader to disable dnd on pinned
     * cells. Plain Set instead of Map because the lookup is just `has(id)`.
     */
    const pinnedIds = useMemo<ReadonlySet<string>>(
        () => new Set([...(resolvedStickyConfig.start ?? []), ...(resolvedStickyConfig.end ?? [])]),
        [resolvedStickyConfig.start, resolvedStickyConfig.end],
    );

    /**
     * Resolves the sticky plan for the currently-visible columns in their currently-ordered
     * position. Recomputes on column order/visibility changes so adding a new pinned column
     * shifts subsequent offsets without a remount.
     */
    const stickyPlan = useMemo<StickyPlan>(() => {
        const visible = effectiveColumnOrder
            .filter((id) => visibilityState[id] !== false)
            .map<PlannableColumn>((id) => {
                const def = columns.find((c) => c.id === id);
                const metaSticky = (def?.meta as { sticky?: "start" | "end" } | undefined)?.sticky;
                /** Use the live (possibly resized) width so the pinned-cluster offsets stay aligned. */
                const size = sizingState[id] ?? def?.size;
                return { id, size, metaSticky };
            });
        return buildStickyPlan(visible, resolvedStickyConfig);
    }, [effectiveColumnOrder, visibilityState, columns, resolvedStickyConfig, sizingState]);

    const visibleRows = table.getRowModel().rows;
    const cellClass = DENSITY_CLASSES[density].cell;
    const rowHeightClass = DENSITY_CLASSES[density].row;

    /**
     * Column widths are published as CSS custom properties on the `<table>` element rather than
     * re-written onto every `<td>` per render. Cells read `var(--col-<id>-size)`, so their inline
     * style string is constant — a resize tick only mutates these vars on one element instead of
     * touching hundreds of cells. Recomputes as the operator drags (live `sizingState`).
     */
    const columnSizeVars = useMemo<Record<string, number>>(() => {
        const vars: Record<string, number> = {};
        for (const header of table.getFlatHeaders()) {
            vars[`--col-${header.column.id}-size`] = sizingState[header.column.id] ?? header.getSize();
        }
        return vars;
    }, [table, sizingState]);

    /**
     * Truthy only while a resize drag is in flight. During the drag we render the FROZEN row list
     * (memoized, never re-renders) so the only work per mouse-move is the browser re-reading the
     * CSS size vars — React doesn't reconcile a single cell. On release we swap back to the live
     * list, which renders once with the committed widths.
     */
    const isResizing = Boolean(table.getState().columnSizingInfo.isResizingColumn);
    const RowsComponent = isResizing ? FrozenRowList : DataTableRowList;

    const lastFocusedIndex = useRef<number>(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    useStickyEdgeShadows(scrollRef);

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
                    <div
                        ref={scrollRef}
                        className="custom-scrollbar max-h-[calc(100dvh-22rem)] overflow-auto [&_[data-slot=table-container]]:overflow-visible"
                    >
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
                                {/**
                                 * `table-fixed` + an explicit total width make per-column widths
                                 * authoritative (content can't stretch a column) so resize handles
                                 * and overflow-clip behave predictably. `min-w-full` keeps the table
                                 * filling the viewport when the columns sum to less than it.
                                 */}
                                <Table
                                    className="min-w-full table-fixed border-collapse"
                                    style={{ ...columnSizeVars, width: table.getTotalSize() }}
                                >
                                    <TableHeader>
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <TableRow key={headerGroup.id} className="border-border border-b">
                                                {headerGroup.headers.map((header) => (
                                                    <SortableHeader
                                                        key={header.id}
                                                        header={header}
                                                        cellClass={cellClass}
                                                        stickyPlan={stickyPlan}
                                                        pinnedIds={pinnedIds}
                                                    />
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableHeader>
                                    <TableBody>
                                        {isError && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={table.getVisibleLeafColumns().length}
                                                    className="bg-destructive/5 p-0 [&]:px-0 [&]:py-0"
                                                >
                                                    <div
                                                        className={cn(
                                                            VIEWPORT_CELL_CONTENT_CLASS,
                                                            "flex items-center gap-3 px-4 py-3 text-destructive",
                                                        )}
                                                        style={VIEWPORT_CELL_CONTENT_STYLE}
                                                    >
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
                                                    <div
                                                        className={VIEWPORT_CELL_CONTENT_CLASS}
                                                        style={VIEWPORT_CELL_CONTENT_STYLE}
                                                    >
                                                        <DataTableSkeleton
                                                            columnWidths={
                                                                skeletonColumnWidths ?? table.getVisibleLeafColumns().map(() => 1)
                                                            }
                                                            rowHeightClass={rowHeightClass}
                                                        />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : visibleRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={table.getVisibleLeafColumns().length}
                                                    className="p-0 [&]:px-0 [&]:py-0"
                                                >
                                                    <div
                                                        className={VIEWPORT_CELL_CONTENT_CLASS}
                                                        style={VIEWPORT_CELL_CONTENT_STYLE}
                                                    >
                                                        <DataTableEmpty
                                                            variant={hasActiveFilters === true ? "filtered" : "empty"}
                                                            title={
                                                                hasActiveFilters === true
                                                                    ? labels.filtered.title
                                                                    : labels.empty.title
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
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            <RowsComponent
                                                rows={visibleRows}
                                                cellClass={cellClass}
                                                rowHeightClass={rowHeightClass}
                                                renderSubComponent={renderSubComponent}
                                                renderRowOverride={renderRowOverride}
                                                onRowOpen={onRowOpen}
                                                stickyPlan={stickyPlan}
                                            />
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

                {hidePagination ? null : (
                    <DataTablePagination
                        meta={meta}
                        limitOptions={limitOptions}
                        onPageChange={onPageChange}
                        onLimitChange={onLimitChange}
                        selectedCount={selectedIds.size}
                        labels={labels.pagination}
                        formatNumber={formatNumber}
                    />
                )}
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
    stickyPlan: StickyPlan;
    pinnedIds: ReadonlySet<string>;
}

/**
 * `<th>` wrapper that registers with the surrounding `SortableContext`. Pinned columns skip
 * dnd and render in place. While dragging the cell is translated via the `transform` returned
 * by `useSortable`; opacity drops so the source position is still visible under the cursor.
 */
/**
 * Leading-divider suppression for body cells is decided by the sticky plan now: any column
 * pinned to the start side sits flush with the row gutter, so the inline `before:` divider
 * is hidden. End-side pinned cells keep their leading divider (it separates the actions
 * column from the data band).
 */

function SortableHeader<TData>({ header, cellClass, stickyPlan, pinnedIds }: SortableHeaderProps<TData>) {
    const isPinned = pinnedIds.has(header.column.id);
    const placement = stickyPlan.get(header.column.id);
    const sticky = resolveStickyHeader(placement);
    const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
        id: header.column.id,
        disabled: isPinned,
    });

    /** Width is read from the table-level CSS var so a resize tick never rewrites this cell's style. */
    const widthValue = `calc(var(--col-${header.column.id}-size) * 1px)`;
    const widthStyle: CSSProperties = { width: widthValue, minWidth: widthValue };
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
                {...(sticky?.dataAttrs ?? {})}
                /**
                 * Sticky on each `<th>` (not the `<thead>`) — `<thead>` sticky breaks when there's
                 * an inner `overflow-x-auto` ancestor. Cell-level sticky anchors directly to the
                 * outer scroll viewport every time. The vertical-sticky lives here; horizontal
                 * sticky offsets come from `stickyPlan` via `resolveStickyHeader`.
                 */
                className={cn(
                    cellClass,
                    /**
                     * `z-[15]` keeps every header (sticky-on-top only AND sticky-on-both-axes)
                     * above the body cells during vertical scroll. Body sticky cells live at
                     * 10/11; the corner cells (horizontal + vertical sticky) override this to
                     * 20/21 from `sticky?.style.zIndex`, so the corner still wins all stacking
                     * ties — without that bump, body sticky cells with z-index 11 used to paint
                     * OVER the non-pinned header during vertical scroll.
                     */
                    "relative sticky top-0 z-[15] overflow-hidden bg-muted/95 text-start text-xs backdrop-blur supports-[backdrop-filter]:bg-muted/70",
                    "group/header",
                    sticky?.className,
                    /** Full-height vertical separator (pseudo-element so it survives sticky + backdrop-filter combos). */
                    "before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-foreground/8 before:content-['']",
                    "first:before:hidden",
                    /** Start-cluster pinned cells sit flush with the row gutter — the end cluster keeps a leading divider. */
                    placement?.side === "start" && "before:hidden",
                    /**
                     * Select column overrides:
                     *  - `!px-2` collapses the density's wide horizontal padding so the 16px
                     *    checkbox actually fits inside the 44px column without visual cropping.
                     *  - `min-w-12 overflow-visible` keeps the 3px focus ring drawn in full.
                     */
                    header.column.id === "select" && "!px-2 min-w-12 overflow-visible",
                    headerMeta?.headerClassName,
                )}
                style={{ ...(sticky?.style ?? {}), ...widthStyle, ...dragStyle }}
            >
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getCanResize() && (
                    /** Decorative pointer-only resize affordance — width is also adjustable from the column-settings popover. */
                    <span
                        aria-hidden="true"
                        data-resizing={header.column.getIsResizing()}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        onClick={(event) => event.stopPropagation()}
                        className={cn(
                            "absolute inset-y-0 end-0 z-20 block w-1.5 cursor-col-resize touch-none select-none",
                            "bg-transparent opacity-0 transition-opacity hover:bg-primary/40 group-hover/header:opacity-100",
                            "data-[resizing=true]:bg-primary data-[resizing=true]:opacity-100",
                        )}
                    />
                )}
            </TableHead>
        </ColumnDragHandleProvider>
    );
}

interface RowListProps<TData> {
    rows: Row<TData>[];
    cellClass: string;
    rowHeightClass: string;
    renderSubComponent?: SubRowRenderer<TData>;
    renderRowOverride?: (row: Row<TData>) => ReactNode | undefined;
    onRowOpen?: (row: TData) => void;
    stickyPlan: StickyPlan;
}

/** The body's data rows. Extracted so the resize path can swap in a frozen, memoized copy. */
function DataTableRowList<TData>({
    rows,
    cellClass,
    rowHeightClass,
    renderSubComponent,
    renderRowOverride,
    onRowOpen,
    stickyPlan,
}: RowListProps<TData>) {
    return (
        <>
            {rows.map((row, rowIndex) => (
                <DataTableBodyRow
                    key={row.id}
                    row={row}
                    rowIndex={rowIndex}
                    cellClass={cellClass}
                    rowHeightClass={rowHeightClass}
                    renderSubComponent={renderSubComponent}
                    rowOverride={renderRowOverride?.(row)}
                    onRowOpen={onRowOpen}
                    stickyPlan={stickyPlan}
                />
            ))}
        </>
    );
}

/**
 * Frozen variant rendered only while a column is actively being resized: the always-equal
 * comparator means it never reconciles, so a resize drag costs one CSS-var write on the table
 * element instead of re-rendering every row. It remounts (rendering once with the final widths)
 * the moment the drag ends and the live {@link DataTableRowList} takes over again.
 */
const FrozenRowList = memo(DataTableRowList, () => true) as typeof DataTableRowList;

interface BodyRowProps<TData> {
    row: Row<TData>;
    rowIndex: number;
    cellClass: string;
    rowHeightClass: string;
    renderSubComponent?: SubRowRenderer<TData>;
    /** When set, the row's cells are replaced by this node (Gmail-style trash-with-undo). */
    rowOverride?: ReactNode;
    onRowOpen?: (row: TData) => void;
    stickyPlan: StickyPlan;
}

function DataTableBodyRow<TData>({
    row,
    rowIndex,
    cellClass,
    rowHeightClass,
    renderSubComponent,
    rowOverride,
    onRowOpen,
    stickyPlan,
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
                    <div className={VIEWPORT_CELL_CONTENT_CLASS} style={VIEWPORT_CELL_CONTENT_STYLE}>
                        {rowOverride}
                    </div>
                </TableCell>
            </TableRow>
        );
    }

    /**
     * Quick Edit takes over the entire row WordPress-style — when expanded, the row's regular
     * cells are replaced by a single full-width cell hosting the editor. The inner wrapper
     * applies {@link VIEWPORT_CELL_CONTENT_CLASS} so the form pins to the visible viewport width
     * instead of stretching across the full scrollable table — every field + button reachable
     * without horizontal scroll.
     */
    if (isExpanded && renderSubComponent !== undefined) {
        return (
            <TableRow className="border-primary/30 border-y bg-muted/30">
                <TableCell colSpan={visibleCellCount} className="p-0">
                    <div className={VIEWPORT_CELL_CONTENT_CLASS} style={VIEWPORT_CELL_CONTENT_STYLE}>
                        {renderSubComponent(row)}
                    </div>
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
                /**
                 * Row owns the painted background; sticky cells set `bg-inherit` so the same
                 * state colour shows under the pinned columns. Every state colour MUST be fully
                 * opaque — sticky cells with an alpha background let the non-sticky body cells
                 * (currently scrolled behind them) bleed through, which surfaced as ghost text
                 * overlapping the product name on hover. Use solid muted / accent tones instead
                 * of the previous `/40` alpha variants.
                 */
                "bg-card outline-none transition-colors focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                "group/row hover:bg-muted",
                row.getIsSelected() && "bg-accent",
            )}
            onClick={(event) => {
                if (onRowOpen === undefined) return;
                const target = event.target as HTMLElement;
                /** Don't navigate when the click landed on an interactive descendant. */
                if (target.closest("button, a, input, label, [role='menuitem']") !== null) return;
            }}
        >
            {row.getVisibleCells().map((cell) => {
                const widthValue = `calc(var(--col-${cell.column.id}-size) * 1px)`;
                const placement = stickyPlan.get(cell.column.id);
                const sticky = resolveStickyCell(placement);
                const widthStyle: CSSProperties = { width: widthValue, minWidth: widthValue };
                return (
                    <TableCell
                        key={cell.id}
                        {...(sticky?.dataAttrs ?? {})}
                        className={cn(
                            cellClass,
                            /** Clip overflow so a too-wide cell never spills into its neighbour (content truncates). */
                            "overflow-hidden",
                            /** Mirror of the header pseudo-divider — same opacity so header + body grid read as one. */
                            "relative before:absolute before:inset-y-0 before:start-0 before:w-px before:bg-foreground/8 before:content-['']",
                            "first:before:hidden",
                            /** Start-pinned cells sit flush with the row gutter — no leading divider. */
                            placement?.side === "start" && "before:hidden",
                            sticky?.className,
                            /** Select-column padding overrides for the checkbox column. */
                            cell.column.id === "select" && "!px-2 min-w-12 overflow-visible",
                            (cell.column.columnDef.meta as { cellClassName?: string } | undefined)?.cellClassName,
                        )}
                        style={{ ...(sticky?.style ?? {}), ...widthStyle }}
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
