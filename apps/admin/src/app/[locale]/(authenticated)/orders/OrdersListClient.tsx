"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { SearchInput } from "#/components/SearchInput";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useOrdersList } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

export function OrdersListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Orders");
    const cols = t.raw("table") as Record<string, string>;
    const { data, isPending, isError } = useOrdersList({ perPage: 100 });

    if (isPending) {
        return (
            <>
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-96 w-full" />
            </>
        );
    }
    if (isError || data === undefined) {
        return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
    }

    return (
        <>
            <SearchInput placeholder={t("search")} />

            <DataTable<AdminOrder>
                columns={[
                    {
                        id: "order",
                        header: cols.order,
                        cell: (row) => (
                            <Link href={`/orders/${row.id}` as never} className="flex flex-col hover:underline">
                                <span className="font-medium">#{formatNumber(row.orderNumber, locale)}</span>
                                <span className="text-muted-foreground text-xs">{row.orderKey.slice(0, 12)}…</span>
                            </Link>
                        ),
                    },
                    {
                        id: "customer",
                        header: cols.customer,
                        cell: (row) => (
                            <div className="flex flex-col">
                                <span className="font-medium">{row.customerName}</span>
                                <span className="text-muted-foreground text-xs">{row.billingEmail}</span>
                            </div>
                        ),
                    },
                    {
                        id: "total",
                        header: cols.total,
                        cell: (row) => <span className="font-medium">{formatMoney(row.grandTotal, locale)}</span>,
                        className: "text-end",
                    },
                    {
                        id: "status",
                        header: cols.status,
                        cell: (row) => <OrderStatusBadge status={row.status} />,
                    },
                    {
                        id: "payment",
                        header: cols.payment,
                        cell: (row) => <span className="text-muted-foreground">{row.paymentMethodTitle[locale]}</span>,
                    },
                    {
                        id: "placedAt",
                        header: cols.placedAt,
                        cell: (row) => (
                            <span className="text-muted-foreground text-xs">{formatDateTime(row.createdAt, locale)}</span>
                        ),
                    },
                ]}
                rows={data.data}
                getRowKey={(row) => row.id}
                emptyState={t("empty")}
            />
        </>
    );
}
