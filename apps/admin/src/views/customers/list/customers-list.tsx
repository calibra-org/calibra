"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Globe, Plus, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, parseAsStringEnum } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import {
    ActiveFilterChips,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type DateFacetDef,
    type FacetedFilterDef,
    useColumnState,
    useSelectionState,
} from "#/components/ui/data-grid";
import { calendarForLocale } from "#/components/ui/date-picker/date-lib";
import { formatNumber } from "#/lib/format";
import {
    type CustomerTabKey,
    useBulkRowPasswordResetMutation,
    useBulkRowStatusMutation,
    useCustomerCounts,
    useCustomersList,
    useDeleteCustomer,
    useRestoreCustomer,
} from "#/lib/queries/customers";
import {
    boundsToDateFilterValue,
    dateFilterValueToTableViewFilter,
    type FacetColumnMap,
    singleSortToTableView,
    tableViewFilterToDateFilterValue,
    tableViewToSingleSort,
    useFacetValuesFromQuery,
    useSetFacetValue,
    useTableView,
} from "#/lib/table-view";
import type { AdminCustomer } from "#/lib/types";

import { CustomerBulkActions } from "./bulk-actions";
import { buildCustomerColumns } from "./columns";
import { NewCustomerSheet } from "./new-customer-sheet";
import { CustomerStatusTabs } from "./status-tabs";

const TABLE_ID = "admin.customers.list";

const COUNTRY_FACET_OPTIONS: { value: string; label: string }[] = [
    { value: "IR", label: "IR" },
    { value: "US", label: "US" },
    { value: "DE", label: "DE" },
    { value: "GB", label: "GB" },
];

const SUSPENSION_FACET_OPTIONS = ["active", "suspended"] as const;

const TAB_VALUES: CustomerTabKey[] = ["any", "account", "guest", "big", "new", "inactive", "no_address", "trashed"];

/**
 * Facet → TableView column mapping. The toolbar's `country` facet projects onto
 * `filter[]=country_default:in:...` on the wire; `status` projects onto `filter[]=status:in:...`.
 * Values get uppercased for the country code so the wire stays canonical.
 */
const FACET_COLUMN_MAP: FacetColumnMap = {
    country: { field: "country_default", op: "in", transform: (v) => v.toUpperCase() },
    status: { field: "status", op: "in" },
};

export function CustomersListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Customers");
    const statusT = useTranslations("Customers.statusBadge");
    const [newSheetOpen, setNewSheetOpen] = useState(false);

    /**
     * One URL-state hook for everything that lives on the wire: pagination, sort, filter[],
     * filterOr[], plus the customers-specific extras (`q`, `tab`, and the aggregate
     * `last_order_after` / `last_order_before` bounds the controller's whereExists subquery
     * applies). The date chips have NO human URL key of their own — `created` reads back from the
     * `created_at` filter[], `lastOrder` from the `last_order_*` bounds — so the URL carries only
     * wire-shaped state.
     */
    const tv = useTableView({
        extras: {
            q: parseAsString.withDefault(""),
            tab: parseAsStringEnum<CustomerTabKey>(TAB_VALUES).withDefault("any"),
            last_order_after: parseAsString.withDefault(""),
            last_order_before: parseAsString.withDefault(""),
        },
    });

    const calendar = calendarForLocale(locale === "fa" ? "fa" : "en");

    const ui = useColumnState({
        id: TABLE_ID,
        defaultColumnVisibility: {
            nationalId: false,
            country: false,
            aov: false,
            createdAt: false,
        },
    });

    const selection = useSelectionState();

    const { data: counts } = useCustomerCounts();

    const facets = useMemo<FacetedFilterDef[]>(
        () => [
            {
                paramKey: "country",
                label: t("table.country"),
                multiple: true,
                icon: <Globe className="size-3.5" aria-hidden="true" />,
                options: COUNTRY_FACET_OPTIONS,
            },
            {
                paramKey: "status",
                label: t("table.status"),
                multiple: true,
                icon: <Tag className="size-3.5" aria-hidden="true" />,
                options: SUSPENSION_FACET_OPTIONS.map((s) => ({ value: s, label: statusT(s as never) })),
            },
        ],
        [t, statusT],
    );

    const dateFacets = useMemo<DateFacetDef[]>(
        () => [
            { paramKey: "created", label: t("table.createdAt"), calendar: "auto" },
            { paramKey: "lastOrder", label: t("table.lastOrder"), calendar: "auto" },
        ],
        [t],
    );

    /** Facet values projected from the canonical TableView filter[]. Read-only — onChange goes
     *  back through `tv.setFilter` to keep the URL in lock-step with the wire shape. */
    const facetValues = useFacetValuesFromQuery(tv.query, FACET_COLUMN_MAP);
    const setFacetValues = useSetFacetValue(tv.query, tv.setFilter, FACET_COLUMN_MAP);

    /** Date chips have NO separate URL key — they read back from the wire so URL == request.
     *  `created` reconstructs from the `created_at` filter[] entry; `lastOrder` from the aggregate
     *  `last_order_after` / `last_order_before` bounds. Both recover as absolute day ranges (the
     *  relative period the operator originally picked isn't stored on the wire). */
    const dateFacetValues = useMemo(
        () => ({
            created: tableViewFilterToDateFilterValue(
                tv.query.filter.find((f) => f.field === "created_at"),
                calendar,
            ),
            lastOrder: boundsToDateFilterValue(tv.last_order_after, tv.last_order_before, calendar),
        }),
        [tv.query.filter, tv.last_order_after, tv.last_order_before, calendar],
    );

    const setDateFacet = useCallback(
        (key: string, value: typeof dateFacetValues.created) => {
            if (key === "created") {
                /** Persist the chip purely as a `created_at` filter[] entry — no human URL key. */
                const remaining = tv.query.filter.filter((f) => f.field !== "created_at");
                if (value !== null) {
                    const mapped = dateFilterValueToTableViewFilter("created_at", value);
                    tv.setFilter(mapped !== null ? [...remaining, mapped] : remaining);
                } else {
                    tv.setFilter(remaining);
                }
                return;
            }
            if (key === "lastOrder") {
                /** Aggregate bounds — the controller applies `orders.created_at >= after AND <= before`
                 *  via a whereExists subquery; can't be a TableView filter on customers. Both bounds
                 *  write in one `setExtras` so a range doesn't clobber itself. */
                if (value === null) {
                    tv.setExtras({ last_order_after: "", last_order_before: "" });
                    return;
                }
                const mapped = dateFilterValueToTableViewFilter("last_order_at", value);
                if (mapped === null) {
                    tv.setExtras({ last_order_after: "", last_order_before: "" });
                    return;
                }
                if (mapped.op === "between") {
                    const [start, end] = mapped.value as readonly [string, string];
                    tv.setExtras({ last_order_after: start, last_order_before: end });
                } else if (mapped.op === "gte") {
                    tv.setExtras({ last_order_after: mapped.value as string, last_order_before: "" });
                } else if (mapped.op === "lte") {
                    tv.setExtras({ last_order_after: "", last_order_before: mapped.value as string });
                }
            }
        },
        [tv],
    );

    /** Sort projection — the TableView grammar uses an array but the column-header component
     *  is still single-sort. Project both directions through tiny helpers. */
    const sort = tableViewToSingleSort(tv.query.sort);
    const setSort = useCallback(
        (next: typeof sort) => {
            tv.setSort(singleSortToTableView(next));
        },
        [tv.setSort],
    );

    const {
        data: result,
        isPending,
        isError,
        refetch,
    } = useCustomersList({
        query: tv.query,
        q: tv.q.length > 0 ? tv.q : undefined,
        tab: tv.tab,
        include_stats: true,
        last_order_after: tv.last_order_after.length > 0 ? tv.last_order_after : undefined,
        last_order_before: tv.last_order_before.length > 0 ? tv.last_order_before : undefined,
    });

    const deleteMutation = useDeleteCustomer();
    const restoreMutation = useRestoreCustomer();
    const statusMutation = useBulkRowStatusMutation();
    const resetMutation = useBulkRowPasswordResetMutation();

    const columns = useMemo(
        () =>
            buildCustomerColumns({
                locale,
                sort,
                onSort: setSort,
                onHideColumn: (columnId) => ui.setColumnVisibility({ ...ui.columnVisibility, [columnId]: false }),
                sortLabels: {
                    asc: t("sort.asc"),
                    desc: t("sort.desc"),
                    hide: t("sort.hide"),
                },
                t: (key, values) => t(key, values),
                statusT: (key) => statusT(key as never),
                onOpenPreview: (row) => {
                    window.location.href = `/customers/${row.id}`;
                },
                onSuspend: async (row) => {
                    try {
                        await statusMutation.mutateAsync({ customerId: row.id, status: "suspended" });
                    } catch (err) {
                        const status = (err as { status?: number }).status;
                        if (status === 409 && confirm(t("rowActions.suspendActiveOrdersConfirm"))) {
                            await statusMutation.mutateAsync({
                                customerId: row.id,
                                status: "suspended",
                                force: true,
                            });
                        }
                    }
                },
                onUnsuspend: async (row) => {
                    await statusMutation.mutateAsync({ customerId: row.id, status: "active" });
                },
                onSendReset: async (row) => {
                    await resetMutation.mutateAsync(row.id);
                },
                onSoftDelete: async (row) => {
                    if (!confirm(t("rowActions.deleteConfirm"))) return;
                    await deleteMutation.mutateAsync(row.id);
                },
                onRestore: async (row) => {
                    await restoreMutation.mutateAsync(row.id);
                },
            }),
        [
            locale,
            t,
            statusT,
            deleteMutation,
            restoreMutation,
            statusMutation,
            resetMutation,
            sort,
            setSort,
            ui.columnVisibility,
            ui.setColumnVisibility,
        ],
    );

    const meta = result?.meta ?? { page: tv.query.page, limit: tv.query.limit, total: 0, lastPage: 1 };

    const columnVisibilityItems = useMemo(
        () => [
            { id: "customer", label: t("table.customer"), canHide: false },
            { id: "nationalId", label: t("table.nationalId"), canHide: true },
            { id: "phone", label: t("table.phone"), canHide: true },
            { id: "country", label: t("table.country"), canHide: true },
            { id: "ordersCount", label: t("table.orders"), canHide: true },
            { id: "totalSpent", label: t("table.spent"), canHide: true },
            { id: "aov", label: t("table.aov"), canHide: true },
            { id: "lastOrder", label: t("table.lastOrder"), canHide: true },
            { id: "createdAt", label: t("table.createdAt"), canHide: true },
            { id: "tags", label: t("table.tags"), canHide: true },
            { id: "status", label: t("table.status"), canHide: true },
        ],
        [t],
    );

    const activeChips = useMemo(() => {
        const out: { key: string; value: string; label: React.ReactNode }[] = [];
        for (const facet of facets) {
            const values = facetValues[facet.paramKey] ?? [];
            for (const v of values) {
                const opt = facet.options.find((o) => o.value === v);
                out.push({ key: facet.paramKey, value: v, label: opt?.label ?? v });
            }
        }
        return out;
    }, [facets, facetValues]);

    const hasActiveFilters =
        tv.q.length > 0 || tv.tab !== "any" || Object.values(facetValues).some((arr) => Array.isArray(arr) && arr.length > 0);

    const clearAllFilters = useCallback(() => {
        tv.resetFilters({ q: "", tab: "any", last_order_after: "", last_order_before: "" });
    }, [tv]);

    /** No-op toggle map; this page has no boolean toggles but the toolbar still wants the shape. */
    const emptyToggleValues = useMemo<Record<string, boolean>>(() => ({}), []);

    return (
        <section className="flex flex-col gap-4">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <div className="flex items-center gap-2">
                        <Button onClick={() => setNewSheetOpen(true)}>
                            <Plus className="me-2 size-4" aria-hidden="true" />
                            {t("newCustomer")}
                        </Button>
                    </div>
                }
            />

            <CustomerStatusTabs
                value={tv.tab}
                onChange={(next) => {
                    tv.setTab(next);
                }}
                counts={counts}
                locale={locale}
                t={t}
            />

            <DataTable<AdminCustomer>
                data={result?.data ?? []}
                columns={columns}
                getRowId={(row) => String(row.id)}
                meta={meta}
                limitOptions={[10, 20, 50, 100]}
                onPageChange={(page) => tv.setPage(page)}
                onLimitChange={(limit) => tv.setLimit(limit)}
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
                onClearFilters={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("search")}
                            q={tv.q}
                            onQChange={tv.setQ}
                            facets={facets}
                            facetValues={facetValues}
                            onFacetValuesChange={setFacetValues}
                            toggles={[]}
                            toggleValues={emptyToggleValues}
                            onToggleChange={() => {}}
                            dateFacets={dateFacets}
                            dateFacetValues={dateFacetValues}
                            onDateFacetChange={setDateFacet}
                            locale={locale}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearAllFilters}
                            onRefresh={() => refetch()}
                            labels={{
                                clearAll: t("toolbar.clearAll"),
                                refresh: t("refresh"),
                                selectedCount: (n: number) => t("bulk.selectedCount", { count: n }),
                                clearFilter: t("toolbar.clearFilter"),
                            }}
                            rightSlot={
                                <DataTableViewOptions
                                    columns={columnVisibilityItems}
                                    visibility={ui.columnVisibility}
                                    onVisibilityChange={ui.setColumnVisibility}
                                    density={ui.density}
                                    onDensityChange={ui.setDensity}
                                    columnOrder={ui.columnOrder}
                                    onColumnOrderChange={ui.setColumnOrder}
                                    pinnedIds={["select", "favorite", "actions"]}
                                    labels={{
                                        trigger: t("toolbar.viewOptions"),
                                        densityHeading: t("toolbar.density"),
                                        density: {
                                            comfortable: t("toolbar.densityComfortable"),
                                            cozy: t("toolbar.densityCozy"),
                                            compact: t("toolbar.densityCompact"),
                                        },
                                        columnsHeading: t("toolbar.columns"),
                                    }}
                                />
                            }
                        />
                        <ActiveFilterChips
                            chips={activeChips}
                            onRemove={(key, value) => {
                                const next = (facetValues[key] ?? []).filter((v) => v !== value);
                                setFacetValues(key, next);
                            }}
                        />
                    </div>
                }
                bulkActions={({ selectedIds, clearSelection }) => (
                    <CustomerBulkActions selectedIds={selectedIds} onClear={clearSelection} t={(key, values) => t(key, values)} />
                )}
                labels={{
                    empty: { title: t("empty") },
                    filtered: { title: t("emptyFiltered"), description: t("emptyFilteredHint") },
                    clearFiltersLabel: t("toolbar.clearAll"),
                    errorTitle: t("errorTitle"),
                    errorRetry: t("errorRetry"),
                    pagination: {
                        rowsPerPage: t("pagination.rowsPerPage"),
                        showing: (from, to, total) => t("pagination.showing", { from, to, total }),
                        selectedOf: (selected, total) => t("pagination.selectedOf", { selected, total }),
                        first: t("pagination.first"),
                        previous: t("pagination.previous"),
                        next: t("pagination.next"),
                        last: t("pagination.last"),
                        pageOf: (page, lastPage) => t("pagination.pageOf", { page, lastPage }),
                    },
                }}
                formatNumber={(value: number) => formatNumber(value, locale)}
            />

            <NewCustomerSheet open={newSheetOpen} onOpenChange={setNewSheetOpen} t={(key, values) => t(key, values)} />
        </section>
    );
}
