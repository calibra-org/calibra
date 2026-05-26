"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Copy, MoreHorizontal, Percent, TrendingUp, X } from "lucide-react";

import { DataTableColumnHeader } from "#/components/data-table/data-table-column-header";
import type { SortState } from "#/components/data-table/types";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Progress } from "#/components/ui/progress";
import { formatDate, formatMoney, formatNumber, formatPercent, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminCoupon } from "#/lib/types";

interface ColumnContext {
    locale: Locale;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHideColumn: (columnId: string) => void;
    sortLabels: { asc: string; desc: string; hide: string };
    t: (key: string, values?: Record<string, string | number>) => string;
    onCopyCode: (code: string) => void;
    onDuplicate: (row: AdminCoupon) => void;
    onQuickTest: (row: AdminCoupon) => void;
    onToggleStatus: (row: AdminCoupon) => void;
    onExtendExpiry: (row: AdminCoupon) => void;
    onSoftDelete: (row: AdminCoupon) => void;
    onRestore: (row: AdminCoupon) => void;
}

/**
 * Build the coupon-list column set. Mirrors the customers list columns shape (sortable headers,
 * sticky select + actions, mobile-card-friendly cell content) so DataTable's pinned-column logic
 * picks them up without per-page wiring.
 */
export function buildCouponColumns(ctx: ColumnContext): ColumnDef<AdminCoupon>[] {
    const { locale, t, onCopyCode, onDuplicate, onQuickTest, onToggleStatus, onExtendExpiry, onSoftDelete, onRestore } = ctx;
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

    return [
        {
            id: "select",
            header: ({ table }) => {
                const all = table.getIsAllPageRowsSelected();
                const some = table.getIsSomePageRowsSelected();
                return (
                    <Checkbox
                        aria-label={t("selectAll")}
                        checked={all}
                        indeterminate={!all && some}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
                    />
                );
            },
            cell: ({ row }) => (
                <Checkbox
                    aria-label={t("selectRow")}
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(value === true)}
                    onClick={(event) => event.stopPropagation()}
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 44,
        },
        {
            id: "code",
            header: sortableHeader("code", t("table.code")),
            cell: ({ row }) => (
                <Link href={`/coupons/${row.original.id}` as never} className="font-medium font-mono hover:underline">
                    {row.original.code}
                </Link>
            ),
        },
        {
            id: "type",
            header: sortableHeader("discount_type", t("table.type")),
            cell: ({ row }) => <DiscountTypeChip type={row.original.discountType} t={t} />,
        },
        {
            id: "value",
            header: sortableHeader("amount_percent", t("table.value")),
            cell: ({ row }) => {
                if (row.original.discountType === "free_shipping") return <span className="text-muted-foreground">—</span>;
                if (row.original.discountType === "percent") {
                    return (
                        <span className="font-medium tabular-nums">{formatPercent(row.original.amountPercent ?? 0, locale)}</span>
                    );
                }
                return <span className="font-medium tabular-nums">{formatMoney(row.original.amountMinor ?? 0, locale)}</span>;
            },
        },
        {
            id: "description",
            header: t("table.description"),
            cell: ({ row }) => {
                const text = row.original.description[locale];
                if (!text) return <span className="text-muted-foreground">—</span>;
                return (
                    <span className="line-clamp-1 max-w-xs text-muted-foreground text-sm" title={text}>
                        {text}
                    </span>
                );
            },
        },
        {
            id: "constraints",
            header: t("table.constraints"),
            cell: ({ row }) => <ConstraintChips coupon={row.original} t={t} locale={locale} />,
        },
        {
            id: "usage",
            header: sortableHeader("usage", t("table.usage")),
            cell: ({ row }) => <UsageCell coupon={row.original} locale={locale} t={t} />,
        },
        {
            id: "startsAt",
            header: sortableHeader("starts_at", t("table.startsAt")),
            cell: ({ row }) => (
                <span className="text-muted-foreground text-xs">
                    {row.original.startsAt === null ? "—" : formatDate(row.original.startsAt, locale)}
                </span>
            ),
        },
        {
            id: "expiresAt",
            header: sortableHeader("expires_at", t("table.expiresAt")),
            cell: ({ row }) => <ExpiresCell expiresAt={row.original.expiresAt} locale={locale} t={t} />,
        },
        {
            id: "minimumAmount",
            header: t("table.minimumAmount"),
            cell: ({ row }) =>
                row.original.minimumAmount === null ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <span className="tabular-nums">{formatMoney(row.original.minimumAmount, locale)}</span>
                ),
        },
        {
            id: "freeShipping",
            header: t("table.freeShipping"),
            cell: ({ row }) =>
                row.original.freeShipping ? (
                    <Check className="size-4 text-success dark:text-success" aria-hidden="true" />
                ) : (
                    <X className="size-4 text-muted-foreground" aria-hidden="true" />
                ),
        },
        {
            id: "individualUse",
            header: t("table.individualUse"),
            cell: ({ row }) =>
                row.original.individualUse ? (
                    <Check className="size-4 text-success dark:text-success" aria-hidden="true" />
                ) : (
                    <X className="size-4 text-muted-foreground" aria-hidden="true" />
                ),
        },
        {
            id: "status",
            header: t("table.status"),
            cell: ({ row }) => <StatusBadge coupon={row.original} t={t} />,
        },
        {
            id: "actions",
            header: () => <span className="sr-only">{t("table.actions")}</span>,
            cell: ({ row }) => (
                <div className="flex items-center justify-end">
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={(props) => (
                                <Button
                                    {...props}
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    aria-label={t("table.actions")}
                                >
                                    <MoreHorizontal className="size-4" aria-hidden="true" />
                                </Button>
                            )}
                        />
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                                render={(props) => (
                                    <Link {...props} href={`/coupons/${row.original.id}` as never}>
                                        {t("rowActions.edit")}
                                    </Link>
                                )}
                            />
                            <DropdownMenuItem onClick={() => onDuplicate(row.original)}>
                                {t("rowActions.duplicate")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onCopyCode(row.original.code)}>
                                <Copy className="me-2 size-4" aria-hidden="true" />
                                {t("rowActions.copyCode")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onQuickTest(row.original)}>
                                <TrendingUp className="me-2 size-4" aria-hidden="true" />
                                {t("rowActions.quickTest")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {row.original.deletedAt === null ? (
                                <>
                                    <DropdownMenuItem onClick={() => onToggleStatus(row.original)}>
                                        {row.original.status === "active" ? t("rowActions.disable") : t("rowActions.activate")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => onExtendExpiry(row.original)}>
                                        {t("rowActions.extendExpiry")}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onSoftDelete(row.original)}>
                                        {t("rowActions.delete")}
                                    </DropdownMenuItem>
                                </>
                            ) : (
                                <DropdownMenuItem onClick={() => onRestore(row.original)}>
                                    {t("rowActions.restore")}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
            size: 56,
        },
    ];
}

function DiscountTypeChip({ type, t }: { type: AdminCoupon["discountType"]; t: (key: string) => string }) {
    const tone =
        type === "percent"
            ? "bg-info text-info dark:bg-info/30 dark:text-info"
            : type === "free_shipping"
              ? "bg-success text-success dark:bg-success/30 dark:text-success"
              : "bg-warning text-warning dark:bg-warning/30 dark:text-warning";
    return (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${tone}`}>
            {type === "percent" && <Percent className="size-3" aria-hidden="true" />}
            {t(`discountType.${type}`)}
        </span>
    );
}

function ConstraintChips({
    coupon,
    locale,
    t,
}: {
    coupon: AdminCoupon;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    const chips: string[] = [];
    if (coupon.productConstraintsCount > 0)
        chips.push(t("table.productChip", { n: formatNumber(coupon.productConstraintsCount, locale) }));
    if (coupon.categoryConstraintsCount > 0)
        chips.push(t("table.categoryChip", { n: formatNumber(coupon.categoryConstraintsCount, locale) }));
    if (coupon.brandConstraintsCount > 0)
        chips.push(t("table.brandChip", { n: formatNumber(coupon.brandConstraintsCount, locale) }));
    if (coupon.emailRestrictionsCount > 0)
        chips.push(t("table.emailChip", { n: formatNumber(coupon.emailRestrictionsCount, locale) }));
    if (chips.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {chips.map((chip) => (
                <Badge key={chip} variant="outline" className="text-xs">
                    {chip}
                </Badge>
            ))}
        </div>
    );
}

function UsageCell({
    coupon,
    locale,
    t,
}: {
    coupon: AdminCoupon;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    const used = coupon.usageCount;
    const limit = coupon.usageLimitGlobal;
    const percent = limit !== null && limit > 0 ? Math.min(100, (used / limit) * 100) : null;
    return (
        <div className="flex min-w-[7rem] flex-col gap-1">
            <div className="flex items-center justify-between text-xs tabular-nums">
                <span className="font-medium">{formatNumber(used, locale)}</span>
                <span className="text-muted-foreground">/&nbsp;{limit === null ? "∞" : formatNumber(limit, locale)}</span>
            </div>
            {percent !== null ? <Progress value={percent} className="h-1" /> : null}
            {coupon.recentRedemptions7d > 0 ? (
                <span className="text-muted-foreground text-xs">
                    {t("table.recent7d", { n: formatNumber(coupon.recentRedemptions7d, locale) })}
                </span>
            ) : null}
        </div>
    );
}

function ExpiresCell({
    expiresAt,
    locale,
    t,
}: {
    expiresAt: string | null;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    if (expiresAt === null) return <span className="text-muted-foreground text-xs">{t("neverExpires")}</span>;
    const now = Date.now();
    const expires = new Date(expiresAt).getTime();
    const diffDays = Math.ceil((expires - now) / 86_400_000);
    if (diffDays < 0) {
        return (
            <Badge variant="destructive" className="text-xs">
                {t("expiredBadge")}
            </Badge>
        );
    }
    return (
        <div className="flex flex-col">
            <span className="text-xs">{formatDate(expiresAt, locale)}</span>
            {diffDays <= 30 && (
                <span className="text-muted-foreground text-xs">{t("daysToExpiry", { n: formatNumber(diffDays, locale) })}</span>
            )}
        </div>
    );
}

function StatusBadge({ coupon, t }: { coupon: AdminCoupon; t: (key: string) => string }) {
    if (coupon.deletedAt !== null) return <Badge variant="outline">{t("statusBadge.trashed")}</Badge>;
    if (coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() < Date.now())
        return <Badge variant="destructive">{t("statusBadge.expired")}</Badge>;
    if (coupon.status === "disabled") return <Badge variant="outline">{t("statusBadge.disabled")}</Badge>;
    if (coupon.startsAt !== null && new Date(coupon.startsAt).getTime() > Date.now())
        return <Badge variant="secondary">{t("statusBadge.scheduled")}</Badge>;
    return <Badge variant="secondary">{t("statusBadge.active")}</Badge>;
}

export { formatRelativeTime };
