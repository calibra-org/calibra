"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import { Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import {
    ActiveFilterChips,
    type ColumnDef,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type FacetedFilterDef,
} from "#/components/data-table";
import { useDataTable } from "#/components/data-table/use-data-table";
import { Button } from "#/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { toast } from "#/components/ui/toast";
import { formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useDeleteReviews, useModerateReview, useRestoreReviews, useTrashReviews } from "#/lib/reviews/mutations";
import { useReviewCountsByStatus, useReviewsList } from "#/lib/reviews/queries";
import type { AdminReview, ReviewStatus } from "#/lib/types";

import { BulkActions } from "./bulk-actions";
import { buildReviewColumns } from "./columns";
import { useReviewFiltersConfig } from "./filters";
import { ReplyPanel } from "./reply-panel";

const TABLE_ID = "products.reviews";
const STATUS_TABS: (ReviewStatus | "any")[] = ["any", "pending", "approved", "spam", "trash"];

/**
 * Top-level client component for the Reviews moderation page. Mirrors the products list shape —
 * URL-backed pagination/sort/filter via {@link useDataTable}, status tabs, faceted toolbar, an
 * inline Reply/Quick-Edit sub-row, and a bulk-action bar tailored to the active tab.
 *
 * Filters and search that the API doesn't natively support fall back to post-fetch filtering in
 * {@link useReviewsList} — see TODOs in that module.
 */
export function ReviewsList() {
    const t = useTranslations("Reviews.list");
    const statusT = useTranslations("ReviewStatus");
    const locale = useLocale() as Locale;
    const router = useRouter();
    const queryClient = useQueryClient();

    const { facets, toggles } = useReviewFiltersConfig();

    /**
     * Same trick as the products list: status drives the tab strip but it still needs a URL
     * facet so `setFacetValues("status", …)` from `onTabChange` round-trips through nuqs. Empty
     * `options` prevents it from also rendering as a popover.
     */
    const facetsWithStatus = useMemo<FacetedFilterDef[]>(
        () => [...facets, { paramKey: "status", label: "status", multiple: false, options: [] }],
        [facets],
    );

    const tableState = useDataTable({
        id: TABLE_ID,
        facets: facetsWithStatus,
        toggles,
        defaultColumnVisibility: {},
    });

    const status: ReviewStatus | "any" = useMemo(() => {
        const value = tableState.facetValues.status?.[0];
        if (value === "pending" || value === "approved" || value === "spam" || value === "trash") return value;
        return "any";
    }, [tableState.facetValues.status]);

    const ratingValue = (() => {
        const value = tableState.facetValues.rating?.[0];
        const n = Number(value);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? (n as 1 | 2 | 3 | 4 | 5) : undefined;
    })();
    const productIdValue = (() => {
        const value = tableState.facetValues.product?.[0];
        if (value === undefined) return undefined;
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    })();
    const verifiedOnly = tableState.toggleValues.verified === true ? true : undefined;

    const { data: statusCounts } = useReviewCountsByStatus();

    const { data, isPending, isError, refetch } = useReviewsList({
        page: tableState.page,
        perPage: tableState.perPage,
        sort:
            tableState.sort !== undefined
                ? tableState.sort.direction === "desc"
                    ? `-${tableState.sort.id}`
                    : tableState.sort.id
                : undefined,
        status,
        rating: ratingValue,
        productId: productIdValue,
        verified: verifiedOnly,
        search: tableState.q.length > 0 ? tableState.q : undefined,
    });

    const rows = data?.data ?? [];
    const meta = data?.meta ?? { page: tableState.page, perPage: tableState.perPage, total: 0, lastPage: 1 };

    /**
     * Inline expansion drives both Reply and Quick Edit — the same form is reused with a hint of
     * intent so the textarea focus lands on the right field.
     */
    const [expandedRowId, setExpandedRowId] = useState<string | undefined>(undefined);
    const [intent, setIntent] = useState<"reply" | "edit">("reply");
    const onToggleQuickEdit = useCallback((rowId: string, nextIntent: "reply" | "edit" = "edit") => {
        setIntent(nextIntent);
        setExpandedRowId((current) => (current === rowId ? undefined : rowId));
    }, []);

    const onHideColumn = useCallback(
        (id: string) => tableState.setColumnVisibility({ ...tableState.columnVisibility, [id]: false }),
        [tableState.setColumnVisibility, tableState.columnVisibility],
    );

    const moderate = useModerateReview();
    const trashMutation = useTrashReviews();
    const restoreMutation = useRestoreReviews();
    const deleteMutation = useDeleteReviews();

    const runModerate = useCallback(
        async (id: number, sdkStatus: "approved" | "pending" | "rejected", okMessage: string) => {
            try {
                await moderate.mutateAsync({ id, status: sdkStatus });
                toast.add({ title: okMessage, timeout: 2500, data: { tone: "success" } });
            } catch {
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [moderate, t],
    );

    const onApprove = useCallback((review: AdminReview) => runModerate(review.id, "approved", t("approved")), [runModerate, t]);
    const onUnapprove = useCallback(
        (review: AdminReview) => runModerate(review.id, "pending", t("unapproved")),
        [runModerate, t],
    );

    /**
     * Trash and Spam fire the mutation immediately — both are reversible API operations, so the
     * undo affordance just enqueues the restore call (or moves the review back to `pending`).
     * The toast stays on screen long enough for the operator to act on it; if they miss it, they
     * can still restore from the Trash / Spam tab manually.
     */
    const onMarkSpam = useCallback(
        async (review: AdminReview) => {
            try {
                await moderate.mutateAsync({ id: review.id, status: "rejected" });
                toast.add({
                    title: t("markedSpamWithName", { name: review.reviewerName }),
                    timeout: 8000,
                    data: {
                        tone: "success",
                        action: {
                            label: t("undo"),
                            onAction: () => {
                                void moderate.mutateAsync({ id: review.id, status: "pending" });
                            },
                        },
                    },
                });
            } catch {
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [moderate, t],
    );
    const onUnspam = useCallback((review: AdminReview) => runModerate(review.id, "pending", t("unspammed")), [runModerate, t]);
    const onTrash = useCallback(
        async (review: AdminReview) => {
            try {
                await trashMutation.mutateAsync({ ids: [review.id] });
                toast.add({
                    title: t("trashedWithName", { name: review.reviewerName }),
                    timeout: 8000,
                    data: {
                        tone: "success",
                        action: {
                            label: t("undo"),
                            onAction: () => {
                                void restoreMutation.mutateAsync({ ids: [review.id] });
                            },
                        },
                    },
                });
            } catch {
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [trashMutation, restoreMutation, t],
    );
    const onRestore = useCallback(
        async (review: AdminReview) => {
            try {
                await restoreMutation.mutateAsync({ ids: [review.id] });
                toast.add({ title: t("restored"), timeout: 2500, data: { tone: "success" } });
            } catch {
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [restoreMutation, t],
    );
    const onDelete = useCallback(
        async (review: AdminReview) => {
            try {
                await deleteMutation.mutateAsync({ ids: [review.id] });
                toast.add({ title: t("deleted"), timeout: 2500, data: { tone: "success" } });
            } catch {
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [deleteMutation, t],
    );

    const onCopyEmail = useCallback(() => toast.add({ title: t("emailCopied"), timeout: 2000, data: { tone: "success" } }), [t]);
    const onCopyId = useCallback(() => toast.add({ title: t("idCopied"), timeout: 2000, data: { tone: "success" } }), [t]);
    const onOpenProduct = useCallback((review: AdminReview) => router.push(`/products/${review.productId}` as never), [router]);

    const columns: ColumnDef<AdminReview>[] = useMemo(
        () =>
            buildReviewColumns({
                locale,
                sort: tableState.sort,
                onSort: tableState.setSort,
                onHideColumn,
                onToggleQuickEdit: (rowId) => onToggleQuickEdit(rowId, "edit"),
                onApprove,
                onUnapprove,
                onMarkSpam,
                onUnspam,
                onTrash,
                onRestore,
                onDelete,
                onReply: (review) => onToggleQuickEdit(String(review.id), "reply"),
                onQuickEdit: (review) => onToggleQuickEdit(String(review.id), "edit"),
                onCopyEmail,
                onCopyId,
                onOpenProduct,
                t,
                statusT,
                sortLabels: { asc: t("sortAsc"), desc: t("sortDesc"), hide: t("hideColumn") },
            }),
        [
            locale,
            onApprove,
            onCopyEmail,
            onCopyId,
            onDelete,
            onHideColumn,
            onMarkSpam,
            onOpenProduct,
            onRestore,
            onToggleQuickEdit,
            onTrash,
            onUnapprove,
            onUnspam,
            statusT,
            t,
            tableState.setSort,
            tableState.sort,
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
                const label = typeof option?.label === "string" ? option.label : value;
                out.push({ key: facet.paramKey, value, label: `${facet.label}: ${label}` });
            }
        }
        return out;
    }, [facets, tableState.facetValues]);

    const onTabChange = (value: string) => {
        if (value === "any") {
            tableState.setFacetValues("status", []);
            return;
        }
        tableState.setFacetValues("status", [value]);
    };

    const headerSubtitle =
        data === undefined ? t("loadingTotal") : t("totalReviews", { count: formatNumber(meta.total, locale) });

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{headerSubtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={(props) => (
                                <Button {...props} variant="outline">
                                    {t("secondaryActions")}
                                </Button>
                            )}
                        />
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled>{t("export")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => refetch()}>{t("refresh")}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            <Tabs value={status} onValueChange={onTabChange} variant="line" aria-label={t("title")}>
                <TabsList className="h-10 gap-6 px-0">
                    {STATUS_TABS.map((value) => {
                        const count = statusCounts?.[value];
                        const label = value === "any" ? statusT("any") : statusT(value as ReviewStatus);
                        return (
                            <TabsTrigger key={value} value={value} className="px-0">
                                <span>{label}</span>
                                {count !== undefined && (
                                    <span className="ms-1 text-muted-foreground/80 tabular-nums">
                                        ({formatNumber(count, locale)})
                                    </span>
                                )}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>
            </Tabs>

            <DataTable<AdminReview>
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
                expandedRowId={expandedRowId}
                onExpandedRowIdChange={setExpandedRowId}
                renderSubComponent={(row: Row<AdminReview>) => (
                    <ReplyPanel review={row.original} onClose={() => setExpandedRowId(undefined)} intent={intent} />
                )}
                renderCard={(row) => (
                    <ReviewCard row={row.original} onOpen={() => onToggleQuickEdit(String(row.original.id), "edit")} />
                )}
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
                                void queryClient.invalidateQueries({ queryKey: ["admin", "reviews", "list"] });
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
                skeletonColumnWidths={[1, 3, 2, 6, 3, 2, 2, 1]}
                bulkActions={(bulk) => (
                    <BulkActions selectedIds={bulk.selectedIds} onClear={bulk.clearSelection} tabStatus={status} />
                )}
            />
        </section>
    );
}

interface ReviewCardProps {
    row: AdminReview;
    onOpen: () => void;
}

/** Mobile card view — collapsed reviewer/product/rating/body block. */
function ReviewCard({ row, onOpen }: ReviewCardProps) {
    return (
        <article className="flex flex-col gap-1.5">
            <header className="flex items-baseline justify-between gap-2">
                <button type="button" onClick={onOpen} className="text-start font-medium text-foreground hover:underline">
                    {row.reviewerName}
                </button>
                <span className="inline-flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                            // biome-ignore lint/suspicious/noArrayIndexKey: rating stars rendered in fixed order
                            key={index}
                            className={index < row.rating ? "size-3.5 fill-current" : "size-3.5 stroke-current opacity-25"}
                            aria-hidden="true"
                        />
                    ))}
                </span>
            </header>
            <p className="line-clamp-3 text-muted-foreground text-sm">{row.body}</p>
            {row.reply !== null && row.reply.length > 0 && (
                <p className="line-clamp-2 text-muted-foreground text-xs">↳ {row.reply}</p>
            )}
        </article>
    );
}
