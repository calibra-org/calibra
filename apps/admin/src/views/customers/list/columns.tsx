"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpRight, MoreHorizontal, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";

import { DataTableColumnHeader } from "#/components/ui/data-grid/data-table-column-header";
import type { SortState } from "#/components/ui/data-grid/types";
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
import { formatDate, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminCustomer } from "#/lib/types";

/** Initials chip — avatar replacement until we wire real avatars from the user table. */
function Initials({ first, last }: { first: string; last: string }) {
    const value = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
    return (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-primary text-xs ring-1 ring-primary/15">
            {value}
        </span>
    );
}

interface ColumnContext {
    locale: Locale;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHideColumn: (columnId: string) => void;
    sortLabels: { asc: string; desc: string; hide: string };
    t: (key: string, values?: Record<string, string | number>) => string;
    statusT: (key: string) => string;
    onOpenPreview: (row: AdminCustomer) => void;
    onSuspend: (row: AdminCustomer) => void;
    onUnsuspend: (row: AdminCustomer) => void;
    onSendReset: (row: AdminCustomer) => void;
    onSoftDelete: (row: AdminCustomer) => void;
    onRestore: (row: AdminCustomer) => void;
}

export function buildCustomerColumns(ctx: ColumnContext): ColumnDef<AdminCustomer>[] {
    const { locale, t, statusT, onOpenPreview, onSuspend, onUnsuspend, onSendReset, onSoftDelete, onRestore } = ctx;
    const sortableHeader = (columnId: string, title: string, className?: string) => () => (
        <DataTableColumnHeader
            columnId={columnId}
            title={title}
            sort={ctx.sort}
            onSort={ctx.onSort}
            onHide={() => ctx.onHideColumn(columnId)}
            labels={ctx.sortLabels}
            className={className}
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
            size: 36,
        },
        {
            id: "customer",
            header: sortableHeader("last_name", t("table.customer")),
            cell: ({ row }) => {
                const c = row.original;
                return (
                    <div className="flex min-w-0 items-center gap-3">
                        <Initials first={c.firstName} last={c.lastName} />
                        <div className="flex min-w-0 flex-col">
                            <Link href={`/customers/${c.id}` as never} className="truncate font-medium hover:underline">
                                {c.firstName} {c.lastName}
                            </Link>
                            <span className="truncate text-muted-foreground text-xs">{c.hasAccount ? c.email : t("guest")}</span>
                        </div>
                    </div>
                );
            },
        },
        {
            id: "nationalId",
            header: t("table.nationalId"),
            cell: ({ row }) =>
                row.original.nationalId !== null ? (
                    <span dir="ltr" className="text-xs">
                        {row.original.nationalId}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "phone",
            header: t("table.phone"),
            cell: ({ row }) =>
                row.original.phone ? (
                    <a href={`tel:${row.original.phone}`} dir="ltr" className="text-xs hover:underline">
                        {row.original.phone}
                    </a>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "country",
            header: t("table.country"),
            cell: ({ row }) => <span className="text-xs">{row.original.acquisitionChannel ?? ""}</span>,
        },
        {
            id: "ordersCount",
            header: t("table.orders"),
            cell: ({ row }) => <span className="font-medium">{formatNumber(row.original.ordersCount, locale)}</span>,
        },
        {
            id: "totalSpent",
            header: t("table.spent"),
            cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.totalSpent, locale)}</span>,
        },
        {
            id: "aov",
            header: t("table.aov"),
            cell: ({ row }) => formatMoney(row.original.averageOrderValue, locale),
        },
        {
            id: "lastOrder",
            header: t("table.lastOrder"),
            cell: ({ row }) =>
                row.original.lastOrderAt !== null ? (
                    <span title={formatDate(row.original.lastOrderAt, locale)} className="text-muted-foreground text-xs">
                        {formatRelativeTime(row.original.lastOrderAt, locale)}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "createdAt",
            header: sortableHeader("created_at", t("table.createdAt")),
            cell: ({ row }) => (
                <span title={formatDate(row.original.createdAt, locale)} className="text-muted-foreground text-xs">
                    {formatRelativeTime(row.original.createdAt, locale)}
                </span>
            ),
        },
        {
            id: "tags",
            header: t("table.tags"),
            cell: ({ row }) => {
                const visible = row.original.tags.slice(0, 3);
                const overflow = Math.max(0, row.original.tags.length - 3);
                if (visible.length === 0) return <span className="text-muted-foreground">—</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {visible.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                        {overflow > 0 && (
                            <Badge variant="outline" className="text-xs">
                                +{overflow}
                            </Badge>
                        )}
                    </div>
                );
            },
        },
        {
            id: "status",
            header: t("table.status"),
            cell: ({ row }) => {
                const status = row.original.status;
                const tone = status === "active" ? "secondary" : status === "suspended" ? "destructive" : "outline";
                return (
                    <Badge variant={tone} className="text-xs">
                        {row.original.hasAccount === false ? t("guest") : statusT(status)}
                    </Badge>
                );
            },
        },
        {
            id: "actions",
            header: () => <span className="sr-only">{t("table.actions")}</span>,
            cell: ({ row }) => {
                const c = row.original;
                return (
                    <div className="flex items-center justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => onOpenPreview(c)}
                            aria-label={t("rowActions.quickPreview")}
                        >
                            <ArrowUpRight className="size-4" aria-hidden="true" />
                        </Button>
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
                                        <Link {...props} href={`/customers/${c.id}` as never}>
                                            {t("rowActions.viewProfile")}
                                        </Link>
                                    )}
                                />
                                <DropdownMenuItem
                                    render={(props) => (
                                        <Link {...props} href={`/orders?customer_id=${c.id}` as never}>
                                            {t("rowActions.viewOrders")}
                                        </Link>
                                    )}
                                />
                                {c.hasAccount ? (
                                    <DropdownMenuItem onClick={() => onSendReset(c)}>
                                        <ShieldCheck className="me-2 size-4" aria-hidden="true" />
                                        {t("rowActions.sendPasswordReset")}
                                    </DropdownMenuItem>
                                ) : null}
                                {c.hasAccount && c.status === "active" ? (
                                    <DropdownMenuItem onClick={() => onSuspend(c)}>
                                        <UserX className="me-2 size-4" aria-hidden="true" />
                                        {t("rowActions.suspend")}
                                    </DropdownMenuItem>
                                ) : null}
                                {c.hasAccount && c.status === "suspended" ? (
                                    <DropdownMenuItem onClick={() => onUnsuspend(c)}>
                                        <UserCheck className="me-2 size-4" aria-hidden="true" />
                                        {t("rowActions.activate")}
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator />
                                {c.status !== "deleted" ? (
                                    <DropdownMenuItem onClick={() => onSoftDelete(c)} className="text-destructive">
                                        <ShieldOff className="me-2 size-4" aria-hidden="true" />
                                        {t("rowActions.delete")}
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem onClick={() => onRestore(c)}>{t("rowActions.restore")}</DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 96,
        },
    ];
}
