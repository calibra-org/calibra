"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { parseAsBoolean, parseAsString } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { Button } from "#/components/ui/button";
import {
    ActiveFilterChips,
    type ColumnDef,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type DateFacetDef,
    useColumnState,
    useSelectionState,
} from "#/components/ui/data-grid";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { toast } from "#/components/ui/toast";
import { formatDateTime, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useMarkShipped, useOrderCounts, useOrdersList } from "#/lib/queries/orders";
import {
    dateFilterValueToTableViewFilter,
    type FacetColumnMap,
    serializeDateFacetForUrl,
    singleSortToTableView,
    tableViewToSingleSort,
    useDateFacetValues,
    useFacetValuesFromQuery,
    useSetFacetValue,
    useTableView,
} from "#/lib/table-view";
import type { AdminOrder } from "#/lib/types";

import { RiskFlagsRow } from "../shared/risk-flag-chip";

import { BulkActions } from "./bulk-actions";
import { buildOrderColumns } from "./columns";
import { useOrderFilters } from "./filters";
import { KeyboardHelpDialog } from "./keyboard-help-dialog";
import { QuickPreviewDrawer } from "./quick-preview-drawer";
import { type StatusTabKey, StatusTabs } from "./status-tabs";

const TABLE_ID = "orders.list";

const STATUS_TAB_VALUES: ReadonlyArray<string> = [
    "draft",
    "pending",
    "on_hold",
    "processing",
    "completed",
    "cancelled",
    "refunded",
    "failed",
];

/**
 * Facet → TableView column mapping. The toolbar's `source` facet projects onto
 * `filter[]=created_via:in:...`; `payment` projects onto `filter[]=payment_method_code_snapshot:in:...`.
 * `country` doesn't appear here because that filter requires a `whereExists` through
 * `order_addresses` the v1 runtime can't model — it rides as the controller-side `country` extra
 * (see {@link OrdersListExtras}) instead.
 */
const FACET_COLUMN_MAP: FacetColumnMap = {
    source: { field: "created_via", op: "in" },
    payment: { field: "payment_method_code_snapshot", op: "in" },
};

/**
 * The Orders workbench. Stitches together the status tabs, the toolbar, the DataTable, the bulk
 * action bar, and the quick preview drawer. Pagination/sort/search/facets all flow through
 * {@link useTableView} so the URL is the source of truth — refreshes and deep links restore the
 * same view. Status lives in the TableView `filter[]` (as `status:eq:X`) so the wire grammar
 * matches the URL exactly; the visible UI is the tab strip.
 */
export function OrdersList() {
    const t = useTranslations("Orders.list");
    const statusT = useTranslations("OrderStatus");
    const locale = useLocale() as Locale;
    const router = useRouter();
    const queryClient = useQueryClient();

    const { facets } = useOrderFilters();
    const dateFacets = useMemo<DateFacetDef[]>(
        () => [{ paramKey: "created", label: t("filters.created"), calendar: "auto" }],
        [t],
    );

    const tv = useTableView({
        initial: { limit: 25 },
        extras: {
            q: parseAsString.withDefault(""),
            trashed: parseAsBoolean.withDefault(false),
            created: parseAsString.withDefault(""),
            country: parseAsString.withDefault(""),
        },
    });

    const ui = useColumnState({
        id: TABLE_ID,
        defaultColumnVisibility: { shipTo: false, items: false, coupon: false, source: false },
    });

    const selection = useSelectionState();

    /** Derive the tab strip value from the canonical TableView filter[]. `trashed` lives as an
     *  extras-backed flag (not a filter entry) because the server treats it as a scope flip
     *  rather than a per-column predicate. */
    const status: StatusTabKey = useMemo(() => {
        if (tv.trashed) return "trashed";
        const entry = tv.query.filter.find((f) => f.field === "status" && f.op === "eq");
        const value = entry?.value;
        if (typeof value === "string" && STATUS_TAB_VALUES.includes(value)) return value as StatusTabKey;
        return "any";
    }, [tv.query.filter, tv.trashed]);

    const columnFacetValues = useFacetValuesFromQuery(tv.query, FACET_COLUMN_MAP);
    const setColumnFacet = useSetFacetValue(tv.query, tv.setFilter, FACET_COLUMN_MAP);

    /** `source` + `payment` ride `filter[]`; `country` is the controller-side billing-country
     *  `whereExists` extra, projected here onto the same `Record<string, string[]>` shape the
     *  toolbar wants and stored as a comma-joined extra in the URL. */
    const facetValues = useMemo<Record<string, string[]>>(
        () => ({ ...columnFacetValues, country: tv.country.length > 0 ? tv.country.split(",") : [] }),
        [columnFacetValues, tv.country],
    );
    const setFacetValues = useCallback(
        (key: string, values: string[]) => {
            if (key === "country") {
                tv.setCountry(values.join(","));
                return;
            }
            setColumnFacet(key, values);
        },
        [setColumnFacet, tv],
    );

    const dateFacetValuesRaw = useMemo(() => ({ created: tv.created }), [tv.created]);
    const dateFacetValues = useDateFacetValues(
        dateFacetValuesRaw,
        useMemo(() => ({ created: { field: "created_at", calendar: "auto" as const } }), []),
    );

    const setDateFacet = useCallback(
        (_key: string, value: typeof dateFacetValues.created) => {
            /** The chip's display string (`created` extra) and the wire predicate (`created_at`
             *  filter[]) must move together — one `patch`, never two chained writes (they race on
             *  router.replace and the filter[] gets clobbered, so the date never applies). */
            const remaining = tv.query.filter.filter((f) => f.field !== "created_at");
            const mapped = value !== null ? dateFilterValueToTableViewFilter("created_at", value) : null;
            tv.patch({
                query: { filter: mapped !== null ? [...remaining, mapped] : remaining },
                extras: { created: serializeDateFacetForUrl(value) ?? "" },
            });
        },
        [tv],
    );

    /** Sort projection — single-sort UI ↔ TableViewSort[] array. */
    const sort = tableViewToSingleSort(tv.query.sort);
    const setSort = useCallback((next: typeof sort) => tv.setSort(singleSortToTableView(next)), [tv.setSort]);

    const { data: counts } = useOrderCounts();

    /**
     * Read `?customer_id=` from the current URL so a `View this customer's orders` link from the
     * customers detail page lands here pre-filtered. The current implementation pushes a
     * `customer_id:eq:N` entry through `tv.setFilter` once on mount — the page builds its own
     * cross-link rather than declaring `customer_id` as a top-level extra.
     */
    const searchParams = useSearchParams();
    const customerIdParam = searchParams?.get("customer_id");
    const customerIdFilter = customerIdParam !== null && customerIdParam.length > 0 ? Number(customerIdParam) : undefined;
    useEffect(() => {
        if (customerIdFilter === undefined || !Number.isFinite(customerIdFilter)) return;
        const existing = tv.query.filter.find((f) => f.field === "customer_id");
        if (existing !== undefined && existing.value === customerIdFilter) return;
        const others = tv.query.filter.filter((f) => f.field !== "customer_id");
        tv.setFilter([...others, { field: "customer_id", op: "eq", value: customerIdFilter }]);
    }, [customerIdFilter, tv.query.filter, tv.setFilter]);

    const { data, isPending, isError, refetch } = useOrdersList({
        query: tv.query,
        q: tv.q.length > 0 ? tv.q : undefined,
        trashed: tv.trashed ? true : undefined,
        country: tv.country.length > 0 ? tv.country : undefined,
    });

    const rows = data?.data ?? [];
    const meta = data?.meta ?? { page: tv.query.page, limit: tv.query.limit, total: 0, lastPage: 1 };

    /**
     * Quick preview drawer. Stores the currently-previewed order so we can render the drawer even
     * after the underlying row scrolls out — and so the prev/next arrows can pivot to the
     * neighbouring row without flipping the open/closed state.
     */
    const [previewOrder, setPreviewOrder] = useState<AdminOrder | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const openPreview = useCallback((order: AdminOrder) => {
        setPreviewOrder(order);
        setPreviewOpen(true);
    }, []);
    const navigatePreview = useCallback(
        (direction: "prev" | "next") => {
            if (previewOrder === null) return;
            const index = rows.findIndex((row) => row.id === previewOrder.id);
            if (index === -1) return;
            const targetIndex = direction === "prev" ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= rows.length) return;
            setPreviewOrder(rows[targetIndex]);
        },
        [previewOrder, rows],
    );

    const previewIndex = previewOrder === null ? -1 : rows.findIndex((row) => row.id === previewOrder.id);
    const canNavigate = useMemo(
        () => ({ prev: previewIndex > 0, next: previewIndex !== -1 && previewIndex < rows.length - 1 }),
        [previewIndex, rows.length],
    );

    const onOpenDetail = useCallback((order: AdminOrder) => router.push(`/orders/${order.id}` as never), [router]);

    /** Track which row's "mark completed" quick action is in flight so the icon stays disabled while pending. */
    const markCompleted = useMarkShipped();
    const [markingId, setMarkingId] = useState<number | null>(null);
    const onMarkCompleted = useCallback(
        async (order: AdminOrder) => {
            setMarkingId(order.id);
            try {
                await markCompleted.mutateAsync({ id: order.id });
                toast.add({ title: t("markedShipped"), timeout: 2500, data: { tone: "success" } });
            } catch {
                toast.add({ title: t("markShippedFailed"), timeout: 4000, data: { tone: "error" } });
            } finally {
                setMarkingId(null);
            }
        },
        [markCompleted, t],
    );

    const onHideColumn = useCallback(
        (id: string) => ui.setColumnVisibility({ ...ui.columnVisibility, [id]: false }),
        [ui.setColumnVisibility, ui.columnVisibility],
    );

    const columns: ColumnDef<AdminOrder>[] = useMemo(
        () =>
            buildOrderColumns({
                locale,
                sort,
                onSort: setSort,
                onHideColumn,
                onOpenPreview: openPreview,
                onOpenDetail,
                onMarkCompleted,
                isMarkingCompleted: (id) => markingId === id,
                t,
                statusT,
                sortLabels: { asc: t("sortAsc"), desc: t("sortDesc"), hide: t("hideColumn") },
            }),
        [locale, sort, setSort, onHideColumn, openPreview, onOpenDetail, onMarkCompleted, markingId, t, statusT],
    );

    const columnVisibilityItems = useMemo(
        () =>
            columns
                .filter(
                    (col): col is typeof col & { id: string } =>
                        typeof col.id === "string" && col.id !== "select" && col.id !== "actions",
                )
                .map((col) => ({
                    id: col.id,
                    label: t(`columns.${col.id}` as never),
                    canHide: col.enableHiding !== false,
                })),
        [columns, t],
    );

    const activeChips = useMemo(() => {
        const out: { key: string; value: string; label: string }[] = [];
        for (const facet of facets) {
            const values = facetValues[facet.paramKey] ?? [];
            for (const value of values) {
                const option = facet.options.find((opt) => opt.value === value);
                out.push({ key: facet.paramKey, value, label: `${facet.label}: ${option?.label ?? value}` });
            }
        }
        return out;
    }, [facets, facetValues]);

    const onTabChange = useCallback(
        (value: StatusTabKey) => {
            /** `status` lives in `filter[]` but `trashed` is an extra — write both in one `patch`
             *  so the two don't race through separate `router.replace` calls. */
            const others = tv.query.filter.filter((f) => f.field !== "status");
            if (value === "any") {
                tv.patch({ query: { filter: others }, extras: { trashed: false } });
                return;
            }
            if (value === "trashed") {
                tv.patch({ query: { filter: others }, extras: { trashed: true } });
                return;
            }
            tv.patch({ query: { filter: [...others, { field: "status", op: "eq", value }] }, extras: { trashed: false } });
        },
        [tv],
    );

    const hasActiveFilters = useMemo(
        () => tv.q.length > 0 || tv.query.filter.length > 0 || tv.trashed || tv.created.length > 0 || tv.country.length > 0,
        [tv.q, tv.query.filter, tv.trashed, tv.created, tv.country],
    );

    const clearAllFilters = useCallback(() => {
        tv.resetFilters({ q: "", trashed: false, created: "", country: "" });
    }, [tv]);

    /** Keyboard shortcuts living at the page level — DataTable owns j/k/x/e/Enter on focused rows. */
    const [helpOpen, setHelpOpen] = useState(false);
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, textarea, [contenteditable="true"]')) return;
            if (event.key === "/") {
                event.preventDefault();
                document.querySelector<HTMLInputElement>(`[data-table-search="${TABLE_ID}"], [type="search"]`)?.focus();
            } else if (event.key === "n") {
                event.preventDefault();
                router.push("/orders/new" as never);
            } else if (event.key === "?") {
                event.preventDefault();
                setHelpOpen(true);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [router]);

    const headerSubtitle = data === undefined ? t("loadingTotal") : t("totalOrders", { count: formatNumber(meta.total, locale) });

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{headerSubtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
                        {t("keyboardShortcuts")}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={(props) => (
                                <Button {...props} variant="outline">
                                    {t("secondaryActions")}
                                </Button>
                            )}
                        />
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() => {
                                    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
                                    refetch();
                                }}
                            >
                                {t("refresh")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    toast.add({ title: t("exportTodo"), timeout: 2500, data: { tone: "info" } });
                                }}
                            >
                                {t("export")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={() => router.push("/orders/new" as never)}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("newOrder")}
                    </Button>
                </div>
            </header>

            <StatusTabs value={status} onChange={onTabChange} counts={counts} locale={locale} />

            <DataTable<AdminOrder>
                data={rows}
                columns={columns}
                getRowId={(row) => String(row.id)}
                meta={meta}
                limitOptions={[10, 20, 50, 100]}
                onPageChange={tv.setPage}
                onLimitChange={tv.setLimit}
                sort={sort}
                onSortChange={setSort}
                selectedIds={selection.selectedIds}
                onSelectedIdsChange={selection.setSelected}
                columnVisibility={ui.columnVisibility}
                onColumnVisibilityChange={ui.setColumnVisibility}
                columnOrder={ui.columnOrder}
                onColumnOrderChange={ui.setColumnOrder}
                density={ui.density}
                isLoading={isPending}
                isError={isError}
                onRetry={() => refetch()}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearAllFilters}
                onRowOpen={onOpenDetail}
                renderCard={(row) => <OrderCard order={row.original} locale={locale} onOpenPreview={openPreview} />}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("searchPlaceholder")}
                            q={tv.q}
                            onQChange={tv.setQ}
                            facets={facets}
                            facetValues={facetValues}
                            onFacetValuesChange={setFacetValues}
                            dateFacets={dateFacets}
                            dateFacetValues={dateFacetValues}
                            onDateFacetChange={setDateFacet}
                            locale={locale}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearAllFilters}
                            onRefresh={() => {
                                void queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
                            }}
                            labels={{
                                clearAll: t("clearAll"),
                                refresh: t("refresh"),
                                selectedCount: (n) => formatNumber(n, locale),
                                clearFilter: t("clearFilter"),
                            }}
                            rightSlot={
                                <DataTableViewOptions
                                    columns={columnVisibilityItems}
                                    visibility={ui.columnVisibility}
                                    onVisibilityChange={ui.setColumnVisibility}
                                    density={ui.density}
                                    onDensityChange={ui.setDensity}
                                    labels={{
                                        trigger: t("viewOptions"),
                                        columnsHeading: t("columnsHeading"),
                                        densityHeading: t("densityHeading"),
                                        density: {
                                            comfortable: t("density.comfortable"),
                                            cozy: t("density.cozy"),
                                            compact: t("density.compact"),
                                        },
                                    }}
                                />
                            }
                        />
                        <ActiveFilterChips
                            chips={activeChips}
                            onRemove={(key, value) => {
                                const current = facetValues[key] ?? [];
                                setFacetValues(
                                    key,
                                    current.filter((item) => item !== value),
                                );
                            }}
                        />
                    </div>
                }
                labels={{
                    empty: { title: t("empty"), description: t("emptyDescription") },
                    filtered: { title: t("filteredEmpty"), description: t("filteredEmptyDescription") },
                    clearFiltersLabel: t("clearAll"),
                    errorTitle: t("loadError"),
                    errorRetry: t("retry"),
                    pagination: {
                        rowsPerPage: t("rowsPerPage"),
                        showing: (from, to, total) =>
                            t("showing", {
                                from: formatNumber(from, locale),
                                to: formatNumber(to, locale),
                                total: formatNumber(total, locale),
                            }),
                        selectedOf: (selected, total) =>
                            t("selectedOf", { selected: formatNumber(selected, locale), total: formatNumber(total, locale) }),
                        first: t("first"),
                        previous: t("previous"),
                        next: t("next"),
                        last: t("last"),
                        pageOf: (page, lastPage) =>
                            t("pageOf", { page: formatNumber(page, locale), lastPage: formatNumber(lastPage, locale) }),
                    },
                }}
                formatNumber={(value) => formatNumber(value, locale)}
                skeletonColumnWidths={[1, 2, 2, 2, 3, 2, 2, 2, 1, 1, 2, 2]}
                bulkActions={(bulk) => <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearSelection} />}
            />

            <QuickPreviewDrawer
                order={previewOrder}
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                locale={locale}
                onNavigate={navigatePreview}
                canNavigate={canNavigate}
            />

            <KeyboardHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
        </section>
    );
}

interface OrderCardProps {
    order: AdminOrder;
    locale: Locale;
    onOpenPreview: (order: AdminOrder) => void;
}

/**
 * Mobile card renderer. The desktop columns collapse to a stack with status pill + total + total
 * + relative date. The wrapper is a `<div role="button">` rather than a `<button>` because the
 * RiskFlagsRow inside renders its own `<button>` chips for hover-card triggers — nesting buttons
 * would emit a hydration error.
 */
function OrderCard({ order, locale, onOpenPreview }: OrderCardProps) {
    return (
        // biome-ignore lint/a11y/useSemanticElements: a real <button> would nest the RiskFlagChip buttons inside, breaking hydration
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenPreview(order)}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenPreview(order);
                }
            }}
            className="flex w-full cursor-pointer flex-col items-start gap-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <div className="flex w-full items-center justify-between">
                <span className="font-medium text-sm">#{formatNumber(order.orderNumber, locale)}</span>
                <span className="font-medium text-sm tabular-nums">{formatMoney(order.grandTotal, locale)}</span>
            </div>
            <div className="flex w-full items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{order.customerName || order.billingEmail}</span>
                <OrderStatusBadge status={order.status} />
            </div>
            <div className="flex w-full items-center justify-between text-muted-foreground text-xs">
                <span>{formatRelativeTime(order.createdAt, locale)}</span>
                <RiskFlagsRow flags={order.riskFlags} />
            </div>
        </div>
    );
}

/** Re-export so the OrderCard component is testable in isolation if needed. */
export { OrderCard };
/** Re-exported helper for storybook-ish tests that need a formatted date label. */
export const __testHelpers = { formatDateTime };
