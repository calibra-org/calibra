"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Download, Plus, Tag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import {
    buildDataGridToolbarLabels,
    DataGridToolbar,
    DataTable,
    type FacetedFilterDef,
    type ToggleFilterDef,
} from "#/components/ui/data-grid";
import { useDataTable } from "#/components/ui/data-grid/use-data-table";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useBulkUpdateCoupons, useCouponCounts, useCouponsList, useDeleteCoupon } from "#/lib/queries/coupons";
import type { AdminCoupon, CouponTabKey } from "#/lib/types";
import { DuplicateCouponDialog } from "#/views/coupons/dialogs/duplicate-dialog";
import { ExpirySheet } from "#/views/coupons/dialogs/expiry-sheet";
import { QuickTestSheet } from "#/views/coupons/dialogs/quick-test-sheet";

import { CouponBulkActions } from "./bulk-actions";
import { buildCouponColumns } from "./columns";

const TABLE_ID = "admin.coupons.list";
const TAB_VALUES: CouponTabKey[] = ["any", "active", "scheduled", "used", "disabled", "expired", "trashed"];

import { CouponStatusTabs } from "./status-tabs";

export function CouponsListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons");

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
        defaultLimit: 25,
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
            limit: tableState.limit,
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
        [
            tableState.page,
            tableState.limit,
            tableState.q,
            tableState.sort,
            tableState.facetValues,
            tableState.toggleValues,
            tab,
        ],
    );

    const { data: result, isPending, isError, refetch } = useCouponsList(params);

    const deleteMutation = useDeleteCoupon();
    /** Per-row updates piggyback the bulk endpoint so a single mutation hook can serve every
     * row (`useUpdateCoupon` bakes the id into the hook at creation time and can't be re-keyed). */
    const bulkMutation = useBulkUpdateCoupons();

    /** Row-action panels are hosted at the list level so they open inline without navigating. */
    const [quickTestRow, setQuickTestRow] = useState<AdminCoupon | null>(null);
    const [duplicateRow, setDuplicateRow] = useState<AdminCoupon | null>(null);
    const [expiryRow, setExpiryRow] = useState<AdminCoupon | null>(null);

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
                onHideColumn: (columnId) => tableState.setColumnVisibility({ ...tableState.columnVisibility, [columnId]: false }),
                sortLabels: { asc: t("sort.asc"), desc: t("sort.desc"), hide: t("sort.hide") },
                t: (key, values) => t(key, values),
                onCopyCode: copyCode,
                onDuplicate: (row) => setDuplicateRow(row),
                onQuickTest: (row) => setQuickTestRow(row),
                onToggleStatus: async (row) => {
                    await bulkMutation.mutateAsync({
                        update: [{ id: row.id, status: row.status === "active" ? "disabled" : "active" }],
                    });
                },
                onExtendExpiry: (row) => setExpiryRow(row),
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
        [
            locale,
            t,
            tableState.sort,
            tableState.setSort,
            tableState.columnVisibility,
            tableState.setColumnVisibility,
            copyCode,
            deleteMutation,
            bulkMutation,
        ],
    );

    const meta = result?.meta ?? { page: tableState.page, limit: tableState.limit, total: 0, lastPage: 1 };

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

    /** `DataGridToolbar` computes hasActiveFilters + chips internally; we keep a local copy of the
     * flag for the table's empty-state branch. */
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
                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline">
                            <a
                                href={buildExportUrl({
                                    tab,
                                    search: tableState.q,
                                    discountType: tableState.facetValues.discount_type,
                                })}
                                download
                            >
                                <Download className="me-2 size-4" aria-hidden="true" />
                                {t("exportCsv")}
                            </a>
                        </Button>
                        <Button asChild>
                            <Link href="/coupons/new">
                                <Plus className="me-2 size-4" aria-hidden="true" />
                                {t("newCoupon")}
                            </Link>
                        </Button>
                    </div>
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
                limitOptions={[10, 25, 50, 100]}
                onPageChange={(page) => tableState.setPage(page)}
                onLimitChange={(limit) => tableState.setLimit(limit)}
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
                bulkActions={({ selectedIds, clearSelection }) => (
                    <CouponBulkActions
                        selectedIds={selectedIds}
                        onClear={clearSelection}
                        tab={tab}
                        t={(key, values) => t(key, values)}
                    />
                )}
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
                                {row.original.usageLimitGlobal !== null
                                    ? ` / ${formatNumber(row.original.usageLimitGlobal, locale)}`
                                    : " / ∞"}
                            </span>
                            <span className="text-muted-foreground">
                                {row.original.expiresAt === null
                                    ? t("neverExpires")
                                    : t("daysToExpiry", { n: relativeDays(row.original.expiresAt) })}
                            </span>
                        </div>
                    </Link>
                )}
                toolbar={
                    <DataGridToolbar
                        q={tableState.q}
                        onQChange={tableState.setQ}
                        facets={facets}
                        facetValues={tableState.facetValues}
                        onFacetValuesChange={tableState.setFacetValues}
                        toggles={toggles}
                        toggleValues={tableState.toggleValues}
                        onToggleChange={tableState.setToggleValue}
                        columns={columnVisibilityItems}
                        columnVisibility={tableState.columnVisibility}
                        onColumnVisibilityChange={tableState.setColumnVisibility}
                        density={tableState.density}
                        onDensityChange={tableState.setDensity}
                        onRefresh={() => refetch()}
                        labels={buildDataGridToolbarLabels(t, t("search"))}
                    />
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

            {/**
             * Sheets / dialogs stay mounted across opens so Base UI's `data-starting-style`
             * transition fires every time `open` flips true. Each Sheet wraps a Base UI Dialog
             * primitive that internally toggles `data-open` / `data-closed` on the popup — if the
             * React tree remounts the wrapper (conditional render OR a changing `key`) the
             * primitive resets and skips the entry transition.
             *
             * Internal state (form, mutation cache) is reset by the sheets themselves when `open`
             * flips false → true; see their `useEffect` blocks.
             */}
            <QuickTestSheet
                open={quickTestRow !== null}
                onOpenChange={(open) => !open && setQuickTestRow(null)}
                couponId={quickTestRow?.id ?? 0}
            />
            <DuplicateCouponDialog
                open={duplicateRow !== null}
                onOpenChange={(open) => !open && setDuplicateRow(null)}
                sourceCoupon={duplicateRow}
                sourcePayload={duplicateRow !== null ? buildDuplicatePayload(duplicateRow) : null}
            />
            <ExpirySheet
                open={expiryRow !== null}
                onOpenChange={(open) => !open && setExpiryRow(null)}
                currentExpiresAt={expiryRow?.expiresAt ? expiryRow.expiresAt.slice(0, 10) : ""}
                onApply={async (nextDate) => {
                    if (expiryRow === null) return;
                    await bulkMutation.mutateAsync({ update: [{ id: expiryRow.id, expires_at: nextDate }] });
                    setExpiryRow(null);
                }}
            />
        </section>
    );
}

function relativeDays(iso: string): number {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Project a list-row `AdminCoupon` into the `CouponWritePayload` shape the duplicate dialog
 * expects. The list payload already carries every field the backend coupon validator accepts
 * (constraints, email restrictions, etc.) thanks to the forAdmin transformer running on
 * `/coupons/:id`, but on the list we only have the `forList` projection — so this helper
 * fills in the basics and the editor will full-load the duplicate after redirect.
 */
function buildDuplicatePayload(coupon: AdminCoupon): import("#/lib/queries/coupons").CouponWritePayload {
    return {
        code: coupon.code,
        discount_type: coupon.discountType,
        amount_percent: coupon.amountPercent,
        amount_minor: coupon.amountMinor,
        starts_at: coupon.startsAt,
        expires_at: coupon.expiresAt,
        individual_use: coupon.individualUse,
        exclude_sale_items: coupon.excludeSaleItems,
        minimum_amount: coupon.minimumAmount,
        maximum_amount: coupon.maximumAmount,
        usage_limit_global: coupon.usageLimitGlobal,
        usage_limit_per_user: coupon.usageLimitPerUser,
        limit_usage_to_x_items: coupon.limitUsageToXItems,
        free_shipping: coupon.freeShipping,
        status: coupon.status,
        translations: [
            { locale: "fa", description: coupon.description.fa || null },
            { locale: "en", description: coupon.description.en || null },
        ],
        email_restrictions: coupon.emailRestrictions,
        product_constraints: [
            ...coupon.productConstraints.include.map((id) => ({ product_id: id, mode: "include" as const })),
            ...coupon.productConstraints.exclude.map((id) => ({ product_id: id, mode: "exclude" as const })),
        ],
        category_constraints: [
            ...coupon.categoryConstraints.include.map((id) => ({ category_id: id, mode: "include" as const })),
            ...coupon.categoryConstraints.exclude.map((id) => ({ category_id: id, mode: "exclude" as const })),
        ],
        brand_constraints: [
            ...coupon.brandConstraints.include.map((id) => ({ brand_id: id, mode: "include" as const })),
            ...coupon.brandConstraints.exclude.map((id) => ({ brand_id: id, mode: "exclude" as const })),
        ],
    };
}

/**
 * Build a same-origin export URL with the current filter state forwarded as query params. The
 * admin proxy already attaches the bearer token so a plain `<a download>` works — no SDK call
 * needed for the CSV stream.
 */
function buildExportUrl(args: { tab?: string; search?: string; discountType?: string[] }): string {
    const params = new URLSearchParams();
    if (args.tab && args.tab !== "any") params.set("tab", args.tab);
    if (args.search && args.search.length > 0) params.set("search", args.search);
    if (args.discountType && args.discountType.length > 0) params.set("discount_type", args.discountType.join(","));
    const qs = params.toString();
    return qs.length > 0 ? `/api/admin/coupons/export?${qs}` : "/api/admin/coupons/export";
}
