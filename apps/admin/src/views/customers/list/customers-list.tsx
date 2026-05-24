"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Plus, RefreshCcw, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable } from "#/components/data-table/data-table";
import { useDataTable } from "#/components/data-table/use-data-table";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { PageHeader } from "#/components/PageHeader";
import { formatNumber } from "#/lib/format";
import {
    useCustomerCounts,
    useCustomersList,
    useDeleteCustomer,
    useRestoreCustomer,
    useSendPasswordReset,
    useUpdateCustomerStatus,
    type CustomerTabKey,
} from "#/lib/queries/customers";
import type { AdminCustomer } from "#/lib/types";

import { buildCustomerColumns } from "./columns";
import { CustomerBulkActions } from "./bulk-actions";
import { NewCustomerSheet } from "./new-customer-sheet";
import { CustomerStatsFooter } from "./stats-footer";
import { CustomerStatusTabs } from "./status-tabs";

const TABLE_ID = "admin.customers.list";

export function CustomersListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Customers");
    const statusT = useTranslations("Customers.statusBadge");
    const [tab, setTab] = useState<CustomerTabKey>("any");
    const [newSheetOpen, setNewSheetOpen] = useState(false);

    const { data: counts } = useCustomerCounts();

    const tableState = useDataTable({
        id: TABLE_ID,
        defaultPerPage: 20,
        defaultColumnVisibility: {
            nationalId: false,
            country: false,
            aov: false,
            createdAt: false,
        },
    });

    const {
        data: result,
        isPending,
        isError,
        refetch,
        isFetching,
    } = useCustomersList({
        page: tableState.page,
        perPage: tableState.perPage,
        search: tableState.q.length > 0 ? tableState.q : undefined,
        sort:
            tableState.sort !== undefined
                ? ((tableState.sort.direction === "desc"
                      ? `-${tableState.sort.id}`
                      : tableState.sort.id) as `last_name`)
                : undefined,
        tab,
        includeStats: true,
    });

    const deleteMutation = useDeleteCustomer();
    const restoreMutation = useRestoreCustomer();
    const statusMutationFactory = (id: number) => useUpdateCustomerStatus(id);
    const resetMutationFactory = (id: number) => useSendPasswordReset(id);

    const columns = useMemo(
        () =>
            buildCustomerColumns({
                locale,
                t: (key, values) => t(key, values),
                statusT: (key) => statusT(key as never),
                onOpenPreview: (row) => {
                    window.location.href = `/customers/${row.id}`;
                },
                onSuspend: async (row) => {
                    const mutation = statusMutationFactory(row.id);
                    try {
                        await mutation.mutateAsync({ status: "suspended" });
                    } catch (err) {
                        const status = (err as { status?: number }).status;
                        if (status === 409) {
                            if (confirm(t("rowActions.suspendActiveOrdersConfirm"))) {
                                await mutation.mutateAsync({ status: "suspended", force: true });
                            }
                        }
                    }
                },
                onUnsuspend: async (row) => {
                    const mutation = statusMutationFactory(row.id);
                    await mutation.mutateAsync({ status: "active" });
                },
                onSendReset: async (row) => {
                    const mutation = resetMutationFactory(row.id);
                    await mutation.mutateAsync();
                },
                onSoftDelete: async (row) => {
                    if (!confirm(t("rowActions.deleteConfirm"))) return;
                    await deleteMutation.mutateAsync(row.id);
                },
                onRestore: async (row) => {
                    await restoreMutation.mutateAsync(row.id);
                },
            }),
        [locale, t, statusT, deleteMutation, restoreMutation],
    );

    const meta = result?.meta ?? { page: tableState.page, perPage: tableState.perPage, total: 0, lastPage: 1 };

    return (
        <section className="flex flex-col gap-4">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            aria-label={t("refresh")}
                        >
                            <RefreshCcw className={`size-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
                        </Button>
                        <Button onClick={() => setNewSheetOpen(true)}>
                            <Plus className="size-4 me-2" aria-hidden="true" />
                            {t("newCustomer")}
                        </Button>
                    </div>
                }
            />

            <CustomerStatusTabs value={tab} onChange={setTab} counts={counts} locale={locale} t={t} />

            <div className="flex items-center gap-2">
                <div className="relative max-w-md flex-1">
                    <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                        value={tableState.q}
                        onChange={(e) => tableState.setQ(e.target.value)}
                        placeholder={t("search")}
                        className="ps-9"
                    />
                </div>
            </div>

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
                bulkActions={({ selectedIds, clearSelection }) => (
                    <CustomerBulkActions
                        selectedIds={selectedIds}
                        onClear={clearSelection}
                        t={(key, values) => t(key, values)}
                    />
                )}
                labels={{
                    empty: { title: t("empty") },
                    filtered: { title: t("emptyFiltered") },
                    errorTitle: t("errorTitle"),
                    errorRetry: t("errorRetry"),
                    pagination: {
                        rowsPerPage: t("pagination.rowsPerPage"),
                        showing: (from, to, total) =>
                            t("pagination.showing", { from, to, total }),
                        selectedOf: (selected, total) =>
                            t("pagination.selectedOf", { selected, total }),
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
