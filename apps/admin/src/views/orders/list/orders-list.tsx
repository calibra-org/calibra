"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    ActiveFilterChips,
    type ColumnDef,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type FacetedFilterDef,
} from "#/components/data-table";
import { useDataTable } from "#/components/data-table/use-data-table";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { toast } from "#/components/ui/toast";
import { formatDateTime, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useMarkShipped, useOrderCounts, useOrdersList } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

import { RiskFlagsRow } from "../shared/risk-flag-chip";

import { BulkActions } from "./bulk-actions";
import { buildOrderColumns } from "./columns";
import { useOrderFilters } from "./filters";
import { KeyboardHelpDialog } from "./keyboard-help-dialog";
import { QuickPreviewDrawer } from "./quick-preview-drawer";
import { type StatusTabKey, StatusTabs } from "./status-tabs";

const TABLE_ID = "orders.list";

/**
 * The Orders workbench. Stitches together the status tabs, the toolbar, the DataTable, the bulk
 * action bar, and the quick preview drawer. Pagination/sort/search/facets all flow through
 * {@link useDataTable} so the URL is the source of truth — refreshes and deep links restore the
 * same view. Status lives as a facet for the same reason; the visible UI is the tab strip.
 */
export function OrdersList() {
    const t = useTranslations("Orders.list");
    const statusT = useTranslations("OrderStatus");
    const locale = useLocale() as Locale;
    const router = useRouter();
    const queryClient = useQueryClient();

    const { facets, toggles } = useOrderFilters();
    const facetsWithStatus = useMemo<FacetedFilterDef[]>(
        () => [...facets, { paramKey: "status", label: "status", multiple: false, options: [] }],
        [facets],
    );

    const tableState = useDataTable({
        id: TABLE_ID,
        facets: facetsWithStatus,
        toggles,
        defaultPerPage: 25,
        defaultColumnVisibility: { shipTo: false, items: false, coupon: false, source: false },
    });

    const status: StatusTabKey = useMemo(() => {
        const value = tableState.facetValues.status?.[0];
        if (value === "trashed") return "trashed";
        if (
            value === "draft" ||
            value === "pending" ||
            value === "on_hold" ||
            value === "processing" ||
            value === "completed" ||
            value === "cancelled" ||
            value === "refunded" ||
            value === "failed"
        )
            return value;
        return "any";
    }, [tableState.facetValues.status]);

    const { data: counts } = useOrderCounts();

    const { data, isPending, isError, refetch } = useOrdersList({
        page: tableState.page,
        perPage: tableState.perPage,
        sort:
            tableState.sort !== undefined
                ? tableState.sort.direction === "desc"
                    ? `-${tableState.sort.id}`
                    : tableState.sort.id
                : undefined,
        status,
        search: tableState.q.length > 0 ? tableState.q : undefined,
        sources: tableState.facetValues.source,
        payments: tableState.facetValues.payment,
        countries: tableState.facetValues.country,
    });

    const rows = data?.data ?? [];
    const meta = data?.meta ?? { page: tableState.page, perPage: tableState.perPage, total: 0, lastPage: 1 };

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
        (id: string) => tableState.setColumnVisibility({ ...tableState.columnVisibility, [id]: false }),
        [tableState.setColumnVisibility, tableState.columnVisibility],
    );

    const columns: ColumnDef<AdminOrder>[] = useMemo(
        () =>
            buildOrderColumns({
                locale,
                sort: tableState.sort,
                onSort: tableState.setSort,
                onHideColumn,
                onOpenPreview: openPreview,
                onOpenDetail,
                onMarkCompleted,
                isMarkingCompleted: (id) => markingId === id,
                t,
                statusT,
                sortLabels: { asc: t("sortAsc"), desc: t("sortDesc"), hide: t("hideColumn") },
            }),
        [
            locale,
            tableState.sort,
            tableState.setSort,
            onHideColumn,
            openPreview,
            onOpenDetail,
            onMarkCompleted,
            markingId,
            t,
            statusT,
        ],
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
            const values = tableState.facetValues[facet.paramKey] ?? [];
            for (const value of values) {
                const option = facet.options.find((opt) => opt.value === value);
                out.push({ key: facet.paramKey, value, label: `${facet.label}: ${option?.label ?? value}` });
            }
        }
        return out;
    }, [facets, tableState.facetValues]);

    const onTabChange = (value: StatusTabKey) => {
        if (value === "any") {
            tableState.setFacetValues("status", []);
            return;
        }
        tableState.setFacetValues("status", [value]);
    };

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
                perPageOptions={tableState.perPageOptions}
                onPageChange={tableState.setPage}
                onPerPageChange={tableState.setPerPage}
                sort={tableState.sort}
                onSortChange={tableState.setSort}
                selectedIds={tableState.selectedIds}
                onSelectedIdsChange={tableState.setSelected}
                columnVisibility={tableState.columnVisibility}
                onColumnVisibilityChange={tableState.setColumnVisibility}
                columnOrder={tableState.columnOrder}
                onColumnOrderChange={tableState.setColumnOrder}
                density={tableState.density}
                isLoading={isPending}
                isError={isError}
                onRetry={() => refetch()}
                hasActiveFilters={tableState.hasActiveFilters}
                onClearFilters={tableState.clearAllFilters}
                onRowOpen={onOpenDetail}
                renderCard={(row) => <OrderCard order={row.original} locale={locale} onOpenPreview={openPreview} />}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("searchPlaceholder")}
                            q={tableState.q}
                            onQChange={tableState.setQ}
                            facets={facets}
                            facetValues={tableState.facetValues}
                            onFacetValuesChange={tableState.setFacetValues}
                            toggles={toggles}
                            toggleValues={tableState.toggleValues}
                            onToggleChange={tableState.setToggleValue}
                            hasActiveFilters={tableState.hasActiveFilters}
                            onClearAll={tableState.clearAllFilters}
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
                                    visibility={tableState.columnVisibility}
                                    onVisibilityChange={tableState.setColumnVisibility}
                                    density={tableState.density}
                                    onDensityChange={tableState.setDensity}
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
                                const current = tableState.facetValues[key] ?? [];
                                tableState.setFacetValues(
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
