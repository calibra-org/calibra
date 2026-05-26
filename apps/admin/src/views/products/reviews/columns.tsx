"use client";

import type { Locale } from "@calibra/shared/i18n";
import { BadgeCheck, CornerDownRight, Star } from "lucide-react";
import type { useTranslations } from "next-intl";

type TFunction = ReturnType<typeof useTranslations>;

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Checkbox } from "#/components/ui/checkbox";
import { type ColumnDef, DataTableColumnHeader, type SortState } from "#/components/ui/data-grid";
import { formatDate, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminReview, ReviewStatus } from "#/lib/types";
import { cn } from "#/lib/utils";

import { type RowActionHandlers, RowActions } from "./row-actions";

const reviewStatusTone: Record<ReviewStatus, StatusTone> = {
    pending: "warning",
    approved: "success",
    spam: "danger",
    trash: "neutral",
};

interface ColumnContext extends RowActionHandlers {
    locale: Locale;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHideColumn: (columnId: string) => void;
    onToggleQuickEdit: (rowId: string) => void;
    t: TFunction;
    statusT: TFunction;
    sortLabels: { asc: string; desc: string; hide: string };
}

/**
 * Builds the table's column set. Lives in its own module so the page composition stays readable
 * and Storybook-ish smoke tests can mount the columns in isolation.
 */
export function buildReviewColumns(ctx: ColumnContext): ColumnDef<AdminReview>[] {
    const sortableHeader = (columnId: string, title: string) => () => (
        <DataTableColumnHeader
            columnId={columnId}
            title={title}
            sort={ctx.sort}
            onSort={ctx.onSort}
            onHide={() => ctx.onHideColumn(columnId)}
            labels={ctx.sortLabels}
        />
    );
    const staticHeader = (columnId: string, title: string) => () => (
        <DataTableColumnHeader
            columnId={columnId}
            title={title}
            canSort={false}
            sort={ctx.sort}
            onSort={ctx.onSort}
            labels={ctx.sortLabels}
        />
    );

    return [
        {
            id: "select",
            meta: {
                headerClassName: "!px-2 sticky start-0 z-20 bg-muted",
                cellClassName: "!px-2 sticky start-0 z-10 bg-card",
            },
            header: ({ table }) => {
                const all = table.getIsAllRowsSelected();
                const some = table.getIsSomeRowsSelected();
                return (
                    <Checkbox
                        checked={all}
                        indeterminate={!all && some}
                        onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
                        aria-label={ctx.t("selectAll")}
                    />
                );
            },
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(value === true)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={ctx.t("selectRow")}
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 44,
        },
        {
            id: "reviewer",
            header: sortableHeader("reviewer", ctx.t("columns.reviewer")),
            size: 240,
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <div className="flex flex-col">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{r.reviewerName}</span>
                            {r.verified && (
                                <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label={ctx.t("verifiedPurchase")} />
                            )}
                        </span>
                        {r.reviewerEmail.length > 0 && (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void navigator.clipboard?.writeText(r.reviewerEmail);
                                    ctx.onCopyEmail?.(r.reviewerEmail);
                                }}
                                title={ctx.t("copyEmail")}
                                className="truncate text-start text-muted-foreground text-xs hover:text-foreground"
                            >
                                {r.reviewerEmail}
                            </button>
                        )}
                    </div>
                );
            },
        },
        {
            id: "rating",
            header: sortableHeader("rating", ctx.t("columns.rating")),
            size: 132,
            cell: ({ row }) => {
                const r = row.original;
                return (
                    <span role="img" className="inline-flex items-center gap-0.5 text-warning" aria-label={`${r.rating} / 5`}>
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Star
                                // biome-ignore lint/suspicious/noArrayIndexKey: rating stars rendered in fixed order
                                key={index}
                                className={cn("size-3.5", index < r.rating ? "fill-current" : "stroke-current opacity-25")}
                                aria-hidden="true"
                            />
                        ))}
                    </span>
                );
            },
        },
        {
            id: "body",
            header: staticHeader("body", ctx.t("columns.body")),
            size: 560,
            cell: ({ row }) => {
                const r = row.original;
                const isTrashed = r.status === "trash";
                const isSpam = r.status === "spam";
                const isApproved = r.status === "approved";
                return (
                    <div className="flex max-w-[36rem] flex-col gap-2">
                        <p className="line-clamp-3 whitespace-pre-line text-foreground text-sm leading-relaxed">{r.body}</p>
                        {r.reply !== null && r.reply.length > 0 && (
                            <div className="flex items-start gap-2 rounded-md border-primary/40 border-s-2 bg-muted/40 px-3 py-1.5">
                                <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">{r.reply}</p>
                            </div>
                        )}
                        <div className="invisible flex flex-wrap items-center gap-x-1.5 gap-y-1 whitespace-nowrap text-xs opacity-0 transition-opacity group-focus-within/row:visible group-focus-within/row:opacity-100 group-hover/row:visible group-hover/row:opacity-100">
                            {!isTrashed && !isApproved && ctx.onApprove !== undefined && (
                                <>
                                    <InlineAction onClick={() => ctx.onApprove?.(r)} tone="success">
                                        {ctx.t("actions.approve")}
                                    </InlineAction>
                                    <InlineSep />
                                </>
                            )}
                            {!isTrashed && isApproved && ctx.onUnapprove !== undefined && (
                                <>
                                    <InlineAction onClick={() => ctx.onUnapprove?.(r)}>{ctx.t("actions.unapprove")}</InlineAction>
                                    <InlineSep />
                                </>
                            )}
                            {!isTrashed && ctx.onReply !== undefined && (
                                <>
                                    <InlineAction onClick={() => ctx.onReply?.(r)}>{ctx.t("actions.reply")}</InlineAction>
                                    <InlineSep />
                                </>
                            )}
                            {!isTrashed && ctx.onQuickEdit !== undefined && (
                                <>
                                    <InlineAction onClick={() => ctx.onQuickEdit?.(r)}>{ctx.t("actions.quickEdit")}</InlineAction>
                                    <InlineSep />
                                </>
                            )}
                            {!isTrashed && !isSpam && ctx.onMarkSpam !== undefined && (
                                <>
                                    <InlineAction onClick={() => ctx.onMarkSpam?.(r)} tone="danger">
                                        {ctx.t("actions.spam")}
                                    </InlineAction>
                                    <InlineSep />
                                </>
                            )}
                            {!isTrashed && ctx.onTrash !== undefined && (
                                <InlineAction onClick={() => ctx.onTrash?.(r)} tone="danger">
                                    {ctx.t("actions.trash")}
                                </InlineAction>
                            )}
                            {isTrashed && ctx.onRestore !== undefined && (
                                <>
                                    <InlineAction onClick={() => ctx.onRestore?.(r)} tone="success">
                                        {ctx.t("actions.restore")}
                                    </InlineAction>
                                    {ctx.onDelete !== undefined && (
                                        <>
                                            <InlineSep />
                                            <InlineAction onClick={() => ctx.onDelete?.(r)} tone="danger">
                                                {ctx.t("actions.delete")}
                                            </InlineAction>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            },
            enableSorting: false,
        },
        {
            id: "product",
            header: sortableHeader("product", ctx.t("columns.product")),
            size: 220,
            cell: ({ row }) => {
                const r = row.original;
                const name = r.productName[ctx.locale];
                const label = name.length > 0 ? name : `#${r.productId}`;
                return (
                    <Link
                        href={`/products/${r.productId}` as never}
                        className="block truncate text-sm hover:text-primary hover:underline"
                    >
                        {label}
                    </Link>
                );
            },
        },
        {
            id: "status",
            header: staticHeader("status", ctx.t("columns.status")),
            size: 140,
            cell: ({ row }) => (
                <StatusBadge tone={reviewStatusTone[row.original.status]}>{ctx.statusT(row.original.status)}</StatusBadge>
            ),
            enableSorting: false,
        },
        {
            id: "date",
            header: sortableHeader("date", ctx.t("columns.date")),
            size: 160,
            cell: ({ row }) => (
                <time
                    dateTime={row.original.createdAt}
                    title={formatDate(row.original.createdAt, ctx.locale)}
                    className="text-muted-foreground text-xs"
                >
                    {formatRelativeTime(row.original.createdAt, ctx.locale)}
                </time>
            ),
        },
        {
            id: "actions",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2 sticky end-0 bg-card" },
            header: () => (
                <span className="sr-only" aria-hidden="true">
                    {ctx.t("columns.actions")}
                </span>
            ),
            cell: ({ row }) => (
                <RowActions
                    review={row.original}
                    onApprove={ctx.onApprove}
                    onUnapprove={ctx.onUnapprove}
                    onMarkSpam={ctx.onMarkSpam}
                    onUnspam={ctx.onUnspam}
                    onReply={ctx.onReply}
                    onQuickEdit={ctx.onQuickEdit}
                    onTrash={ctx.onTrash}
                    onRestore={ctx.onRestore}
                    onDelete={ctx.onDelete}
                    onCopyEmail={ctx.onCopyEmail}
                    onCopyId={ctx.onCopyId}
                    onOpenProduct={ctx.onOpenProduct}
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 56,
        },
    ];
}

interface InlineActionProps {
    onClick: () => void;
    tone?: "default" | "success" | "danger";
    children: React.ReactNode;
}

/**
 * Hover-revealed inline action link — visually quiet by default, picks up a tone-coloured hover
 * state. Mirrors the WordPress row-action strip beneath the review body.
 */
function InlineAction({ onClick, tone = "default", children }: InlineActionProps) {
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
            className={cn(
                "shrink-0 rounded text-muted-foreground transition-colors hover:underline",
                tone === "danger" && "hover:text-danger",
                tone === "success" && "hover:text-success",
                tone === "default" && "hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function InlineSep() {
    return <span className="size-1 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />;
}
