import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listRefunds } from "#/lib/server-repos";
import type { AdminRefund } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Refunds" });
    return { title: t("title") };
}

export default async function RefundsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Refunds");
    const cols = t.raw("table") as Record<string, string>;
    const { data } = await listRefunds({ limit: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <DataTable<AdminRefund>
                columns={[
                    {
                        id: "refundNumber",
                        header: cols.refundNumber,
                        cell: (row) => <span className="font-medium">#{formatNumber(row.refundNumber, locale)}</span>,
                    },
                    {
                        id: "order",
                        header: cols.order,
                        cell: (row) => (
                            <Link href={`/orders/${row.orderId}` as never} className="text-sm hover:underline">
                                #{formatNumber(row.orderNumber, locale)}
                            </Link>
                        ),
                    },
                    {
                        id: "amount",
                        header: cols.amount,
                        cell: (row) => <span className="font-medium">{formatMoney(row.amount, locale)}</span>,
                        className: "text-end",
                    },
                    {
                        id: "reason",
                        header: cols.reason,
                        cell: (row) => <span className="text-muted-foreground text-sm">{row.reason ?? "—"}</span>,
                    },
                    { id: "by", header: cols.refundedBy, cell: (row) => row.refundedByName },
                    {
                        id: "processedAt",
                        header: cols.processedAt,
                        cell: (row) => (
                            <span className="text-muted-foreground text-xs">{formatDateTime(row.processedAt, locale)}</span>
                        ),
                    },
                ]}
                rows={data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
