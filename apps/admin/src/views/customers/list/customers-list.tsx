"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Globe, Plus, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useMemo, useState } from "react";

import {
    ActiveFilterChips,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type DateFacetDef,
    type FacetedFilterDef,
} from "#/components/data-table";
import { useDataTable } from "#/components/data-table/use-data-table";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { serializeDateFilter } from "#/components/ui/date-picker";
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
import type { AdminCustomer } from "#/lib/types";

import { CustomerBulkActions } from "./bulk-actions";
import { buildCustomerColumns } from "./columns";
import { NewCustomerSheet } from "./new-customer-sheet";
import { CustomerStatsFooter } from "./stats-footer";
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

export function CustomersListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Customers");
    const statusT = useTranslations("Customers.statusBadge");
    /**
     * Tab state goes through nuqs so it survives refreshes and is shareable as a deep link.
     * `parseAsStringEnum` clamps the value to the allowed set — anyone hitting `?tab=garbage`
     * falls back to `any` rather than sending bad input to the API.
     */
    const [tab, setTab] = useQueryState("tab", parseAsStringEnum<CustomerTabKey>(TAB_VALUES).withDefault("any"));
    const [newSheetOpen, setNewSheetOpen] = useState(false);

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

    const tableState = useDataTable({
        id: TABLE_ID,
        facets,
        dateFacets,
        defaultPerPage: 20,
        defaultColumnVisibility: {
            nationalId: false,
            country: false,
            aov: false,
            createdAt: false,
        },
    });

    const createdValue = tableState.dateFacetValues.created;
    const lastOrderValue = tableState.dateFacetValues.lastOrder;
    const createdParam = useMemo(
        () => (createdValue === null ? undefined : serializeDateFilter(createdValue).main),
        [createdValue],
    );
    const lastOrderParam = useMemo(
        () => (lastOrderValue === null ? undefined : serializeDateFilter(lastOrderValue).main),
        [lastOrderValue],
    );

    const {
        data: result,
        isPending,
        isError,
        refetch,
    } = useCustomersList({
        page: tableState.page,
        perPage: tableState.perPage,
        search: tableState.q.length > 0 ? tableState.q : undefined,
        sort:
            tableState.sort !== undefined
                ? ((tableState.sort.direction === "desc" ? `-${tableState.sort.id}` : tableState.sort.id) as `last_name`)
                : undefined,
        tab,
        includeStats: true,
        countries: tableState.facetValues.country,
        statuses: (tableState.facetValues.status ?? []) as ("active" | "suspended")[],
        created: createdParam,
        lastOrder: lastOrderParam,
    });

    const deleteMutation = useDeleteCustomer();
    const restoreMutation = useRestoreCustomer();
    const statusMutation = useBulkRowStatusMutation();
    const resetMutation = useBulkRowPasswordResetMutation();

    const columns = useMemo(
        () =>
            buildCustomerColumns({
                locale,
                sort: tableState.sort,
                onSort: tableState.setSort,
                onHideColumn: (columnId) => tableState.setColumnVisibility({ ...tableState.columnVisibility, [columnId]: false }),
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
            tableState.sort,
            tableState.setSort,
            tableState.columnVisibility,
            tableState.setColumnVisibility,
        ],
    );

    const meta = result?.meta ?? { page: tableState.page, perPage: tableState.perPage, total: 0, lastPage: 1 };

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
            const values = tableState.facetValues[facet.paramKey] ?? [];
            for (const v of values) {
                const opt = facet.options.find((o) => o.value === v);
                out.push({ key: facet.paramKey, value: v, label: opt?.label ?? v });
            }
        }
        return out;
    }, [facets, tableState.facetValues]);

    const hasActiveFilters =
        tableState.q.length > 0 || Object.values(tableState.facetValues).some((arr) => Array.isArray(arr) && arr.length > 0);

    const clearAllFilters = () => {
        tableState.setQ("");
        for (const facet of facets) {
            tableState.setFacetValues(facet.paramKey, []);
        }
    };

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
                value={tab}
                onChange={(next) => {
                    setTab(next);
                    tableState.setPage(1);
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
                perPageOptions={[10, 20, 50, 100]}
                onPageChange={(page) => tableState.setPage(page)}
                onPerPageChange={(perPage) => tableState.setPerPage(perPage)}
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
                onClearFilters={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("search")}
                            q={tableState.q}
                            onQChange={tableState.setQ}
                            facets={facets}
                            facetValues={tableState.facetValues}
                            onFacetValuesChange={tableState.setFacetValues}
                            toggles={[]}
                            toggleValues={tableState.toggleValues}
                            onToggleChange={tableState.setToggleValue}
                            dateFacets={dateFacets}
                            dateFacetValues={tableState.dateFacetValues}
                            onDateFacetChange={tableState.setDateFilterValue}
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
                                    visibility={tableState.columnVisibility}
                                    onVisibilityChange={tableState.setColumnVisibility}
                                    density={tableState.density}
                                    onDensityChange={tableState.setDensity}
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
                                const next = (tableState.facetValues[key] ?? []).filter((v) => v !== value);
                                tableState.setFacetValues(key, next);
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

            <CustomerStatsFooter counts={counts} locale={locale} t={(key, values) => t(key, values)} />

            <NewCustomerSheet open={newSheetOpen} onOpenChange={setNewSheetOpen} t={(key, values) => t(key, values)} />
        </section>
    );
}
