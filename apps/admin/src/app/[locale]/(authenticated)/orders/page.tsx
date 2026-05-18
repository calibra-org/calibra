import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { PageHeader } from "#/components/PageHeader";
import { SearchInput } from "#/components/SearchInput";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listOrders } from "#/lib/mock/repos";
import type { AdminOrder } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders" });
    return { title: t("title") };
}

export default async function OrdersPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Orders");
    const cols = t.raw("table") as Record<string, string>;
    const { data } = await listOrders({ perPage: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />

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
                rows={data}
                getRowKey={(row) => row.id}
                emptyState={t("empty")}
            />
        </section>
    );
}
