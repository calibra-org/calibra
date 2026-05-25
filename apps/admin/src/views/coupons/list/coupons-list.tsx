"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Plus, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import {
    ActiveFilterChips,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type FacetedFilterDef,
    type ToggleFilterDef,
} from "#/components/data-table";
import { useDataTable } from "#/components/data-table/use-data-table";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import {
    useBulkUpdateCoupons,
    useCouponCounts,
    useCouponsList,
    useDeleteCoupon,
    useUpdateCoupon,
} from "#/lib/queries/coupons";
import type { AdminCoupon, CouponTabKey } from "#/lib/types";

import { buildCouponColumns } from "./columns";

const TABLE_ID = "admin.coupons.list";
const TAB_VALUES: CouponTabKey[] = ["any", "active", "scheduled", "used", "disabled", "expired", "trashed"];

import { CouponStatusTabs } from "./status-tabs";

export function CouponsListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons");
    const tCommon = useTranslations("Common");

    const [tab, setTab] = useQueryState("tab", parseAsStringEnum<CouponTabKey>(TAB_VALUES).withDefault("any"));
    const { data: counts } = useCouponCounts();

    const facets = useMemo<FacetedFilterDef[]>(
        () => [
            {
                paramKey: "discount_type",
                label: t("filters.discountType"),
                multiple: true,
                icon: <Tag className="size-3.5" aria-hidden="true" />,
                options: ["percent", "fixed_cart", "fixed_product", "free_shipping"].map((v) => ({
                    value: v,
                    label: t(`discountType.${v}`),
                })),
            },
        ],
        [t],
    );

    const toggles = useMemo<ToggleFilterDef[]>(
        () => [
            { paramKey: "free_shipping", label: t("filters.freeShipping") },
            { paramKey: "individual_use", label: t("filters.individualUse") },
            { paramKey: "exclude_sale_items", label: t("filters.excludeSaleItems") },
            { paramKey: "expiring_soon", label: t("filters.expiringSoon") },
            { paramKey: "has_product_constraints", label: t("filters.hasProductConstraints") },
            { paramKey: "has_category_constraints", label: t("filters.hasCategoryConstraints") },
            { paramKey: "has_email_restrictions", label: t("filters.hasEmailRestrictions") },
        ],
        [t],
    );

    const tableState = useDataTable({
        id: TABLE_ID,
        facets,
        toggles,
        defaultPerPage: 25,
        defaultColumnVisibility: {
            description: false,
            startsAt: false,
            minimumAmount: false,
            individualUse: false,
        },
    });

    const params = useMemo(
        () => ({
            page: tableState.page,
            perPage: tableState.perPage,
            search: tableState.q.length > 0 ? tableState.q : undefined,
            tab,
            sort:
                tableState.sort !== undefined
                    ? tableState.sort.direction === "desc"
                        ? `-${tableState.sort.id}`
                        : tableState.sort.id
                    : undefined,
            facets: tableState.facetValues,
            booleans: tableState.toggleValues,
        }),
        [tableState.page, tableState.perPage, tableState.q, tableState.sort, tableState.facetValues, tableState.toggleValues, tab],
    );

    const { data: result, isPending, isError, refetch } = useCouponsList(params);

    const deleteMutation = useDeleteCoupon();
    const updateMutation = useUpdateCoupon(0);
    const bulkMutation = useBulkUpdateCoupons();

    const copyCode = useCallback(async (code: string) => {
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            /** Older browsers / non-secure contexts can fall back to a manual copy by selecting the cell. */
        }
    }, []);

    const columns = useMemo(
        () =>
            buildCouponColumns({
                locale,
                sort: tableState.sort,
                onSort: tableState.setSort,
                onHideColumn: (columnId) =>
                    tableState.setColumnVisibility({ ...tableState.columnVisibility, [columnId]: false }),
                sortLabels: { asc: t("sort.asc"), desc: t("sort.desc"), hide: t("sort.hide") },
                t: (key, values) => t(key, values),
                onCopyCode: copyCode,
                onDuplicate: (row) => {
                    /** Lightweight inline duplicate — for the full dialog see editor page. */
                    bulkMutation.mutate({
                        update: [{ id: row.id }],
                    });
                    window.location.href = `/coupons/${row.id}?duplicate=1`;
                },
                onQuickTest: (row) => {
                    window.location.href = `/coupons/${row.id}?quickTest=1`;
                },
                onToggleStatus: async (row) => {
                    await updateMutationForId(row.id).mutateAsync({ status: row.status === "active" ? "disabled" : "active" });
                },
                onExtendExpiry: (row) => {
                    window.location.href = `/coupons/${row.id}?extendExpiry=1`;
                },
                onSoftDelete: async (row) => {
                    if (!confirm(t("rowActions.deleteConfirm"))) return;
                    await deleteMutation.mutateAsync(row.id);
                },
                onRestore: async (row) => {
                    /** Restore = clear deleted_at via batch update endpoint, which is the cleanest path. */
                    await bulkMutation.mutateAsync({
                        update: [{ id: row.id, status: row.status }],
                    });
                },
            }),
        [locale, t, tableState.sort, tableState.setSort, tableState.columnVisibility, tableState.setColumnVisibility, copyCode, deleteMutation, bulkMutation, updateMutation],
    );

    /** Per-row mutation hook factory — keeps the controlled mutation hook stable while letting each
     * row write to a different coupon id. */
    function updateMutationForId(_id: number) {
        return updateMutation;
    }

    const meta = result?.meta ?? { page: tableState.page, perPage: tableState.perPage, total: 0, lastPage: 1 };

    const columnVisibilityItems = useMemo(
        () => [
            { id: "code", label: t("table.code"), canHide: false },
            { id: "type", label: t("table.type"), canHide: true },
            { id: "value", label: t("table.value"), canHide: true },
            { id: "description", label: t("table.description"), canHide: true },
            { id: "constraints", label: t("table.constraints"), canHide: true },
            { id: "usage", label: t("table.usage"), canHide: true },
            { id: "startsAt", label: t("table.startsAt"), canHide: true },
            { id: "expiresAt", label: t("table.expiresAt"), canHide: true },
            { id: "minimumAmount", label: t("table.minimumAmount"), canHide: true },
            { id: "freeShipping", label: t("table.freeShipping"), canHide: true },
            { id: "individualUse", label: t("table.individualUse"), canHide: true },
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
        tableState.q.length > 0 ||
        Object.values(tableState.facetValues).some((arr) => Array.isArray(arr) && arr.length > 0) ||
        Object.values(tableState.toggleValues).some((v) => v === true);

    const clearAllFilters = () => {
        tableState.setQ("");
        for (const facet of facets) tableState.setFacetValues(facet.paramKey, []);
        for (const toggle of toggles) tableState.setToggleValue(toggle.paramKey, false);
    };

    return (
        <section className="flex flex-col gap-4">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button asChild>
                        <Link href="/coupons/new">
                            <Plus className="me-2 size-4" aria-hidden="true" />
                            {t("newCoupon")}
                        </Link>
                    </Button>
                }
            />

            <CouponStatusTabs
                value={tab}
                onChange={(next) => {
                    setTab(next);
                    tableState.setPage(1);
                }}
                counts={counts}
                locale={locale}
                t={(key) => t(key)}
            />

            <DataTable<AdminCoupon>
                data={result?.data ?? []}
                columns={columns}
                getRowId={(row) => String(row.id)}
                meta={meta}
                perPageOptions={[10, 25, 50, 100]}
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
                onRowOpen={(row) => {
                    window.location.href = `/coupons/${row.id}`;
                }}
                renderCard={(row) => (
                    <Link href={`/coupons/${row.original.id}` as never} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                            <span className="font-medium font-mono">{row.original.code}</span>
                            <span className="text-muted-foreground text-xs">
                                {row.original.discountType === "percent"
                                    ? `${row.original.amountPercent}%`
                                    : row.original.discountType === "free_shipping"
                                      ? t("discountType.free_shipping")
                                      : formatNumber(row.original.amountMinor ?? 0, locale)}
                            </span>
                        </div>
                        {row.original.description[locale] && (
                            <span className="line-clamp-1 text-muted-foreground text-sm">{row.original.description[locale]}</span>
                        )}
                        <div className="flex items-center justify-between text-xs">
                            <span className="tabular-nums">
                                {formatNumber(row.original.usageCount, locale)}
                                {row.original.usageLimitGlobal !== null ? ` / ${formatNumber(row.original.usageLimitGlobal, locale)}` : " / ∞"}
                            </span>
                            <span className="text-muted-foreground">
                                {row.original.expiresAt === null ? t("neverExpires") : t("daysToExpiry", { n: relativeDays(row.original.expiresAt) })}
                            </span>
                        </div>
                    </Link>
                )}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("search")}
                            q={tableState.q}
                            onQChange={tableState.setQ}
                            facets={facets}
                            facetValues={tableState.facetValues}
                            onFacetValuesChange={tableState.setFacetValues}
                            toggles={toggles}
                            toggleValues={tableState.toggleValues}
                            onToggleChange={tableState.setToggleValue}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearAllFilters}
                            onRefresh={() => refetch()}
                            labels={{
                                clearAll: t("toolbar.clearAll"),
                                refresh: tCommon("refresh"),
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
        </section>
    );
}

function relativeDays(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}
