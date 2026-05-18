import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SearchInput } from "#/components/SearchInput";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listCustomers } from "#/lib/mock/repos";
import type { AdminCustomer } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Customers" });
    return { title: t("title") };
}

export default async function CustomersPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Customers");
    const cols = t.raw("table") as Record<string, string>;
    const { data } = await listCustomers({ perPage: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
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
                    { id: "email", header: cols.email, cell: (row) => <span className="text-muted-foreground text-sm">{row.email}</span> },
                    { id: "phone", header: cols.phone, cell: (row) => <span className="font-mono text-xs">{row.phone}</span> },
                    { id: "orders", header: cols.orders, cell: (row) => formatNumber(row.ordersCount, locale), className: "text-end" },
                    {
                        id: "spent",
                        header: cols.spent,
                        cell: (row) => <span className="font-medium">{formatMoney(row.totalSpent, locale)}</span>,
                        className: "text-end",
                    },
                    {
                        id: "lastOrder",
                        header: cols.lastOrder,
                        cell: (row) => <span className="text-muted-foreground text-xs">{row.lastOrderAt === null ? "—" : formatDate(row.lastOrderAt, locale)}</span>,
                    },
                ]}
                rows={data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
