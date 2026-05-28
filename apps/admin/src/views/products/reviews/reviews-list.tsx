"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import type { Row } from "@tanstack/react-table";
import { Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import {
    ActiveFilterChips,
    type ColumnDef,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    useColumnState,
    useSelectionState,
} from "#/components/ui/data-grid";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { toast } from "#/components/ui/toast";
import { formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useDeleteReviews, useModerateReview, useRestoreReviews, useTrashReviews } from "#/lib/reviews/mutations";
import { useReviewCountsByStatus, useReviewsList } from "#/lib/reviews/queries";
import {
    type FacetColumnMap,
    singleSortToTableView,
    tableViewToSingleSort,
    useFacetValuesFromQuery,
    useSetFacetValue,
    useTableView,
} from "#/lib/table-view";
import type { AdminReview, ReviewStatus } from "#/lib/types";

import { BulkActions } from "./bulk-actions";
import { buildReviewColumns } from "./columns";
import { useReviewFiltersConfig } from "./filters";
import { ReplyPanel } from "./reply-panel";
import { type PendingKind, UndoStrip } from "./undo-strip";

interface PendingEntry {
    kind: PendingKind;
    /** Snapshot of the row at the moment the action fired — keeps the row visible after the mutation flips its status. */
    review: AdminReview;
    /** 1-indexed slot the row occupied in the rendered list, so the strip stays roughly where it was. */
    originalIndex: number;
}

const TABLE_ID = "products.reviews";
const STATUS_TABS: (ReviewStatus | "any")[] = ["any", "pending", "approved", "spam", "trash"];

/**
 * Reviews has NO controller extras (`compileStrict()`), so every server-bound facet must ride the
 * grammar as `filter[]`. `rating` and `product` (→ `product_id`) project onto columns here; the
 * status tab and the `verified` toggle are handled inline (status because of the spam/trash split,
 * verified because it's a boolean column toggle).
 */
const FACET_COLUMN_MAP: FacetColumnMap = {
    rating: { field: "rating", op: "in" },
    product: { field: "product_id", op: "in" },
};

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

    /** Reviews carries NO server extras, so the URL holds only the grammar (filter[]/sort[]/page/
     *  limit). `q` (search) is CLIENT-only local state — putting it on the wire would 422. The
     *  status tab is a real server status (`pending`/`approved`/`spam`/`trash`) in `filter[]`. */
    const tv = useTableView();
    const [q, setQ] = useState("");

    const ui = useColumnState({ id: TABLE_ID, defaultColumnVisibility: {} });
    const selection = useSelectionState();

    /** The active tab IS the `filter[]=status:eq:…` value — all four moderation states are real
     *  server statuses now. No `filter[]` status entry = the "All" tab. */
    const status: ReviewStatus | "any" = useMemo(() => {
        const entry = tv.query.filter.find((f) => f.field === "status" && f.op === "eq");
        const value = entry?.value;
        if (value === "pending" || value === "approved" || value === "spam" || value === "trash") return value;
        return "any";
    }, [tv.query.filter]);

    /** `rating` + `product` project onto `filter[]`; `verified` is a boolean column toggle. */
    const facetValues = useFacetValuesFromQuery(tv.query, FACET_COLUMN_MAP);
    const setFacetValues = useSetFacetValue(tv.query, tv.setFilter, FACET_COLUMN_MAP);

    const verifiedActive = useMemo(
        () => tv.query.filter.some((f) => f.field === "verified" && f.op === "eq" && f.value === true),
        [tv.query.filter],
    );
    const toggleValues = useMemo<Record<string, boolean>>(() => ({ verified: verifiedActive }), [verifiedActive]);
    const setToggleValue = useCallback(
        (key: string, value: boolean) => {
            if (key !== "verified") return;
            const others = tv.query.filter.filter((f) => f.field !== "verified");
            tv.setFilter(value ? [...others, { field: "verified", op: "eq", value: true }] : others);
        },
        [tv],
    );

    const sort = tableViewToSingleSort(tv.query.sort);
    const setSort = useCallback((next: typeof sort) => tv.setSort(singleSortToTableView(next)), [tv.setSort]);

    const { data: statusCounts } = useReviewCountsByStatus();

    const { data, isPending, isError, refetch } = useReviewsList({
        query: tv.query,
        search: q.length > 0 ? q : undefined,
        tab: status,
    });

    const baseRows = data?.data ?? [];
    const meta = data?.meta ?? { page: tv.query.page, limit: tv.query.limit, total: 0, lastPage: 1 };

    const hasActiveFilters = useMemo(
        () =>
            q.length > 0 ||
            (facetValues.rating?.length ?? 0) > 0 ||
            (facetValues.product?.length ?? 0) > 0 ||
            verifiedActive ||
            status !== "any",
        [q, facetValues.rating, facetValues.product, verifiedActive, status],
    );

    /** Clear every toolbar filter AND the status tab (back to "All") — search is local state, the
     *  rest is a single `clearFilters` (drops the status `filter[]` entry too). */
    const clearAllFilters = useCallback(() => {
        setQ("");
        tv.clearFilters();
    }, [tv]);

    /**
     * Rows that have been trashed or marked-as-spam through the row UI sit in this map. The
     * underlying mutation has already fired — we just keep the snapshot around so the row stays
     * visible (replaced by an undo strip) until the operator clicks Undo, dismisses it, or
     * navigates away. Bulk actions skip this pattern; they use the toast Undo instead.
     */
    const [pendingUndo, setPendingUndo] = useState<Map<number, PendingEntry>>(() => new Map());

    /**
     * Merge the snapshotted pending rows back into the rendered list at (or near) their original
     * positions, so the undo strip appears in place — not pinned at the top or bottom.
     */
    const rows = useMemo(() => {
        if (pendingUndo.size === 0) return baseRows;
        /**
         * Drop every pending row from its natural (refetched) position first, THEN re-insert each
         * at the slot it occupied when the operator acted. Without the removal, a spam'd row that
         * the refetch still returns (the "All" query only hides trash, not spam) re-sorts to the
         * bottom after the invalidation — the row would flash in place, then jump down.
         */
        const pendingIds = new Set(pendingUndo.keys());
        const merged: AdminReview[] = baseRows.filter((row) => !pendingIds.has(row.id));
        const entries = Array.from(pendingUndo.values()).sort((a, b) => a.originalIndex - b.originalIndex);
        for (const entry of entries) {
            const insertAt = Math.min(Math.max(0, entry.originalIndex), merged.length);
            merged.splice(insertAt, 0, entry.review);
        }
        return merged;
    }, [baseRows, pendingUndo]);

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
        (id: string) => ui.setColumnVisibility({ ...ui.columnVisibility, [id]: false }),
        [ui.setColumnVisibility, ui.columnVisibility],
    );

    const moderate = useModerateReview();
    const trashMutation = useTrashReviews();
    const restoreMutation = useRestoreReviews();
    const deleteMutation = useDeleteReviews();

    const runModerate = useCallback(
        async (id: number, sdkStatus: "approved" | "pending" | "spam" | "trash", okMessage: string) => {
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
     * Trash and Spam fire the mutation immediately and pin the row to the {@link pendingUndo}
     * map. The row's regular cells are replaced by an undo strip via `renderRowOverride`; the
     * strip stays until the operator acts (Undo / dismiss) or navigates away — no timer, no
     * auto-commit. Restore + Unspam are real API calls, so the Undo button just kicks the
     * reverse mutation.
     */
    const pinPending = useCallback(
        (review: AdminReview, kind: PendingKind) => {
            const idx = baseRows.findIndex((row) => row.id === review.id);
            const originalIndex = idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
            setPendingUndo((prev) => {
                const next = new Map(prev);
                next.set(review.id, { kind, review, originalIndex });
                return next;
            });
        },
        [baseRows],
    );

    const clearPending = useCallback((id: number) => {
        setPendingUndo((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const onMarkSpam = useCallback(
        async (review: AdminReview) => {
            pinPending(review, "spam");
            try {
                await moderate.mutateAsync({ id: review.id, status: "spam" });
            } catch {
                clearPending(review.id);
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [clearPending, moderate, pinPending, t],
    );
    const onUnspam = useCallback((review: AdminReview) => runModerate(review.id, "pending", t("unspammed")), [runModerate, t]);
    const onTrash = useCallback(
        async (review: AdminReview) => {
            pinPending(review, "trash");
            try {
                await trashMutation.mutateAsync({ ids: [review.id] });
            } catch {
                clearPending(review.id);
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [clearPending, pinPending, t, trashMutation],
    );

    const onPendingUndo = useCallback(
        async (id: number) => {
            const entry = pendingUndo.get(id);
            if (entry === undefined) return;
            clearPending(id);
            try {
                if (entry.kind === "trash") {
                    await restoreMutation.mutateAsync({ ids: [id] });
                } else {
                    await moderate.mutateAsync({ id, status: "pending" });
                }
            } catch {
                toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
            }
        },
        [clearPending, moderate, pendingUndo, restoreMutation, t],
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
                sort,
                onSort: setSort,
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
            sort,
            setSort,
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
            const values = facetValues[facet.paramKey] ?? [];
            for (const value of values) {
                const option = facet.options.find((opt) => opt.value === value);
                const label = typeof option?.label === "string" ? option.label : value;
                out.push({ key: facet.paramKey, value, label: `${facet.label}: ${label}` });
            }
        }
        return out;
    }, [facets, facetValues]);

    /** Map a tab click to its real server status `filter[]` entry. "All" drops the status filter
     *  (the client select hides trashed rows for that view). Pending undo strips are contextual to
     *  the tab they were created on — dismiss them on navigation so the destination tab shows the
     *  affected row normally (e.g. a just-spammed row appears as a regular row on the Spam tab). */
    const onTabChange = useCallback(
        (value: string) => {
            setPendingUndo(new Map());
            const others = tv.query.filter.filter((f) => f.field !== "status");
            if (value === "any") {
                tv.setFilter(others);
                return;
            }
            tv.setFilter([...others, { field: "status", op: "eq", value }]);
        },
        [tv],
    );

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
                expandedRowId={expandedRowId}
                onExpandedRowIdChange={setExpandedRowId}
                renderSubComponent={(row: Row<AdminReview>) => (
                    <ReplyPanel review={row.original} onClose={() => setExpandedRowId(undefined)} intent={intent} />
                )}
                renderRowOverride={(row: Row<AdminReview>) => {
                    const entry = pendingUndo.get(row.original.id);
                    if (entry === undefined) return undefined;
                    return (
                        <UndoStrip
                            kind={entry.kind}
                            reviewerName={entry.review.reviewerName}
                            onUndo={() => onPendingUndo(row.original.id)}
                            onDismiss={() => clearPending(row.original.id)}
                        />
                    );
                }}
                renderCard={(row) => (
                    <ReviewCard row={row.original} onOpen={() => onToggleQuickEdit(String(row.original.id), "edit")} />
                )}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("searchPlaceholder")}
                            q={q}
                            onQChange={setQ}
                            facets={facets}
                            facetValues={facetValues}
                            onFacetValuesChange={setFacetValues}
                            toggles={toggles}
                            toggleValues={toggleValues}
                            onToggleChange={setToggleValue}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearAllFilters}
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
                <span className="inline-flex items-center gap-0.5 text-warning">
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
