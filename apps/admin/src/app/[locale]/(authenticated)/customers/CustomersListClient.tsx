"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { SearchInput } from "#/components/SearchInput";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useCustomersList } from "#/lib/queries/customers";
import type { AdminCustomer } from "#/lib/types";

export function CustomersListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Customers");
    const cols = t.raw("table") as Record<string, string>;
    const { data, isPending, isError } = useCustomersList({ perPage: 100 });

    if (isPending) {
        return (
            <>
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-96 w-full" />
            </>
        );
    }
    if (isError || data === undefined) {
        return <p className="text-muted-foreground text-sm">—</p>;
    }

    return (
        <>
            <SearchInput placeholder={t("search")} />

            <DataTable<AdminCustomer>
                columns={[
                    {
                        id: "name",
                        header: cols.name,
                        cell: (row) => {
                            const initials = `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`.toUpperCase();
                            return (
                                <Link href={`/customers/${row.id}` as never} className="flex items-center gap-3 hover:underline">
                                    <span className="grid size-9 place-items-center rounded-full bg-accent font-semibold text-accent-foreground text-xs">
                                        {initials}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {row.firstName} {row.lastName}
                                        </span>
                                        {row.companyName !== null && (
                                            <span className="text-muted-foreground text-xs">{row.companyName}</span>
                                        )}
                                    </div>
                                </Link>
                            );
                        },
                    },
                    {
                        id: "email",
                        header: cols.email,
                        cell: (row) => <span className="text-muted-foreground text-sm">{row.email}</span>,
                    },
                    { id: "phone", header: cols.phone, cell: (row) => <span className="font-mono text-xs">{row.phone}</span> },
                    {
                        id: "orders",
                        header: cols.orders,
                        cell: (row) => formatNumber(row.ordersCount, locale),
                        className: "text-end",
                    },
                    {
                        id: "spent",
                        header: cols.spent,
                        cell: (row) => <span className="font-medium">{formatMoney(row.totalSpent, locale)}</span>,
                        className: "text-end",
                    },
                    {
                        id: "lastOrder",
                        header: cols.lastOrder,
                        cell: (row) => (
                            <span className="text-muted-foreground text-xs">
                                {row.lastOrderAt === null ? "—" : formatDate(row.lastOrderAt, locale)}
                            </span>
                        ),
                    },
                ]}
                rows={data.data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </>
    );
}
