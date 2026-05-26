"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowDownRight, ArrowUpRight, Eye, Receipt } from "lucide-react";
import type { useTranslations } from "next-intl";

type TFunction = ReturnType<typeof useTranslations>;

import { type ColumnDef, DataTableColumnHeader, type SortState } from "#/components/data-table";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#/components/ui/hover-card";
import { formatDate, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminOrder, OrderStatus } from "#/lib/types";

import { RiskFlagsRow } from "../shared/risk-flag-chip";

import { RowActions } from "./row-actions";

interface ColumnContext {
    locale: Locale;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHideColumn: (columnId: string) => void;
    onOpenPreview: (row: AdminOrder) => void;
    onOpenDetail: (row: AdminOrder) => void;
    onMarkCompleted: (row: AdminOrder) => void;
    isMarkingCompleted: (orderId: number) => boolean;
    t: TFunction;
    statusT: TFunction;
    sortLabels: { asc: string; desc: string; hide: string };
}

/**
 * Builds the order table's columns. The first cluster (`select`, `number`, `date`, `status`,
 * `customer`) is the always-visible spine; subsequent columns can be toggled off through the
 * view-options popover and survive across reloads via the DataTable's localStorage layer.
 */
export function buildOrderColumns(ctx: ColumnContext): ColumnDef<AdminOrder>[] {
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
            id: "number",
            header: sortableHeader("order_number", ctx.t("columns.number")),
            size: 168,
            cell: ({ row }) => {
                const order = row.original;
                return (
                    <div className="flex flex-col">
                        <Link
                            href={`/orders/${order.id}` as never}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                        >
                            #{formatNumber(order.orderNumber, ctx.locale)}
                        </Link>
                        <span className="text-muted-foreground text-xs">{ctx.t(`source.${order.createdVia}` as never)}</span>
                    </div>
                );
            },
        },
        {
            id: "date",
            header: sortableHeader("created_at", ctx.t("columns.date")),
            size: 160,
            cell: ({ row }) => {
                const order = row.original;
                return (
                    <time
                        dateTime={order.createdAt}
                        title={formatDate(order.createdAt, ctx.locale)}
                        className="text-muted-foreground text-xs"
                    >
                        {formatRelativeTime(order.createdAt, ctx.locale)}
                    </time>
                );
            },
        },
        {
            id: "status",
            header: sortableHeader("status", ctx.t("columns.status")),
            size: 160,
            cell: ({ row }) => {
                const order = row.original;
                return (
                    <span className="inline-flex items-center gap-2">
                        <OrderStatusBadge status={order.status} />
                        {order.riskFlags.length > 0 && <RiskFlagsRow flags={order.riskFlags} />}
                    </span>
                );
            },
        },
        {
            id: "customer",
            header: () => (
                <DataTableColumnHeader
                    columnId="customer"
                    title={ctx.t("columns.customer")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            size: 240,
            cell: ({ row }) => {
                const order = row.original;
                const name = order.customerName || order.billingEmail || ctx.t("guest");
                return (
                    <HoverCard>
                        <HoverCardTrigger
                            render={(props) => (
                                <button {...props} type="button" className="flex max-w-full flex-col text-start">
                                    <span className="truncate font-medium text-sm hover:underline">{name}</span>
                                    {order.billingEmail.length > 0 && (
                                        <span className="truncate text-muted-foreground text-xs">{order.billingEmail}</span>
                                    )}
                                </button>
                            )}
                        />
                        <HoverCardContent className="w-64">
                            <div className="flex flex-col gap-1.5 text-xs">
                                <p className="font-medium text-sm">{name}</p>
                                {order.billingEmail && <p className="text-muted-foreground">{order.billingEmail}</p>}
                                {order.customerId !== null ? (
                                    <Link
                                        href={`/customers/${order.customerId}` as never}
                                        className="text-primary hover:underline"
                                    >
                                        {ctx.t("openCustomer")}
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">{ctx.t("guest")}</span>
                                )}
                            </div>
                        </HoverCardContent>
                    </HoverCard>
                );
            },
        },
        {
            id: "shipTo",
            header: () => (
                <DataTableColumnHeader
                    columnId="shipTo"
                    title={ctx.t("columns.shipTo")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            cell: ({ row }) => {
                const ship = row.original.shippingAddress;
                if (!ship.city) return <span className="text-muted-foreground">—</span>;
                return (
                    <span className="text-muted-foreground text-xs">
                        {ship.city}
                        {ship.country ? ` · ${ship.country}` : ""}
                    </span>
                );
            },
            size: 160,
            enableSorting: false,
        },
        {
            id: "total",
            header: sortableHeader("grand_total", ctx.t("columns.total")),
            meta: { cellClassName: "text-start" },
            size: 180,
            cell: ({ row }) => {
                const order = row.original;
                return (
                    <div className="flex flex-col items-start tabular-nums">
                        <span className="font-medium">{formatMoney(order.grandTotal, ctx.locale, { display: "IRT" })}</span>
                        {order.itemCount > 0 && (
                            <span className="text-muted-foreground text-xs">
                                {ctx.t("itemsCount", { count: formatNumber(order.itemCount, ctx.locale) })}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            id: "payment",
            header: () => (
                <DataTableColumnHeader
                    columnId="payment"
                    title={ctx.t("columns.payment")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            size: 160,
            cell: ({ row }) => {
                const order = row.original;
                const title = order.paymentMethodTitle[ctx.locale] || order.paymentMethodTitle.fa || "—";
                return (
                    <div className="flex flex-col text-xs">
                        <span>{title || "—"}</span>
                        {order.paidAt !== null && (
                            <span className="text-muted-foreground" title={formatDate(order.paidAt, ctx.locale)}>
                                <ArrowUpRight className="me-1 inline size-3" aria-hidden="true" />
                                {formatRelativeTime(order.paidAt, ctx.locale)}
                            </span>
                        )}
                        {order.status === "refunded" && (
                            <span className="text-danger dark:text-danger">
                                <ArrowDownRight className="me-1 inline size-3" aria-hidden="true" />
                                {ctx.t("refundedShort")}
                            </span>
                        )}
                    </div>
                );
            },
        },
        {
            id: "source",
            header: () => (
                <DataTableColumnHeader
                    columnId="source"
                    title={ctx.t("columns.source")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            size: 120,
            cell: ({ row }) => (
                <Badge variant="outline" className="font-normal text-xs">
                    {ctx.t(`source.${row.original.createdVia}` as never)}
                </Badge>
            ),
            enableSorting: false,
        },
        {
            id: "items",
            header: () => (
                <DataTableColumnHeader
                    columnId="items"
                    title={ctx.t("columns.items")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            meta: { cellClassName: "text-end" },
            size: 90,
            cell: ({ row }) => (
                <span className="text-muted-foreground text-xs tabular-nums">
                    {formatNumber(row.original.itemCount, ctx.locale)}
                </span>
            ),
            enableSorting: false,
        },
        {
            id: "coupon",
            header: () => (
                <DataTableColumnHeader
                    columnId="coupon"
                    title={ctx.t("columns.coupon")}
                    canSort={false}
                    sort={ctx.sort}
                    onSort={ctx.onSort}
                    labels={ctx.sortLabels}
                />
            ),
            size: 140,
            cell: ({ row }) => {
                const codes = row.original.couponCodes;
                if (codes.length === 0) return <span className="text-muted-foreground">—</span>;
                const head = codes.slice(0, 1);
                return (
                    <div className="flex items-center gap-1">
                        {head.map((code) => (
                            <Badge key={code} variant="secondary" className="font-mono text-xs">
                                {code}
                            </Badge>
                        ))}
                        {codes.length > 1 && (
                            <Badge variant="outline" className="text-[10px] tabular-nums">
                                +{codes.length - 1}
                            </Badge>
                        )}
                    </div>
                );
            },
            enableSorting: false,
        },
        {
            id: "actions",
            meta: { headerClassName: "!px-2", cellClassName: "!px-2 sticky end-0 bg-card" },
            header: () => (
                <span className="sr-only" aria-hidden="true">
                    {ctx.t("columns.actions")}
                </span>
            ),
            cell: ({ row }) => {
                const order = row.original;
                const canMarkCompleted = order.status === "processing";
                return (
                    <div className="flex items-center justify-end gap-1">
                        {canMarkCompleted && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="invisible size-7 opacity-0 transition-opacity group-focus-within/row:visible group-focus-within/row:opacity-100 group-hover/row:visible group-hover/row:opacity-100"
                                title={ctx.t("quickComplete")}
                                disabled={ctx.isMarkingCompleted(order.id)}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    ctx.onMarkCompleted(order);
                                }}
                            >
                                <Receipt className="size-3.5" aria-hidden="true" />
                            </Button>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            className="invisible size-7 opacity-0 transition-opacity group-focus-within/row:visible group-focus-within/row:opacity-100 group-hover/row:visible group-hover/row:opacity-100"
                            title={ctx.t("quickPreview")}
                            onClick={(event) => {
                                event.stopPropagation();
                                ctx.onOpenPreview(order);
                            }}
                        >
                            <Eye className="size-3.5" aria-hidden="true" />
                        </Button>
                        <RowActions
                            order={order}
                            onOpenPreview={() => ctx.onOpenPreview(order)}
                            onOpenDetail={() => ctx.onOpenDetail(order)}
                        />
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 116,
        },
    ];
}

/** Maps an order status to a short Persian label used in the bulk-action confirmations. */
export function _shortStatusLabel(status: OrderStatus, statusT: TFunction): string {
    return statusT(status);
}
