import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Input } from "#/components/ui/input";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders" });
    return { title: t("title") };
}

interface OrderRow {
    id: string;
    customer: string;
    total: string;
    placedAt: string;
    status: { tone: StatusTone; labelKey: "pending" | "paid" | "shipped" | "delivered" | "refunded" | "cancelled" };
}

const sampleRows: OrderRow[] = [
    { id: "#1042", customer: "Sara M.", total: "$129.00", placedAt: "2m ago", status: { tone: "warning", labelKey: "pending" } },
    { id: "#1041", customer: "Reza K.", total: "$58.00", placedAt: "1h ago", status: { tone: "success", labelKey: "paid" } },
    { id: "#1040", customer: "Mahdi A.", total: "$240.00", placedAt: "5h ago", status: { tone: "info", labelKey: "shipped" } },
    {
        id: "#1039",
        customer: "Niloo R.",
        total: "$75.50",
        placedAt: "yesterday",
        status: { tone: "success", labelKey: "delivered" },
    },
];

export default async function OrdersPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Orders");
    const status = await getTranslations("Status");
    const cols = t.raw("table") as {
        order: string;
        customer: string;
        total: string;
        status: string;
        placedAt: string;
        actions: string;
    };

    return (
        <section className="flex flex-col gap-6">
            <header>
                <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
            </header>

            <div className="relative max-w-sm">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input type="search" placeholder={t("search")} className="ps-9" />
            </div>

            <DataTable
                columns={[
                    { id: "order", header: cols.order, cell: (row: OrderRow) => <span className="font-medium">{row.id}</span> },
                    { id: "customer", header: cols.customer, cell: (row: OrderRow) => row.customer },
                    {
                        id: "total",
                        header: cols.total,
                        cell: (row: OrderRow) => <span className="font-medium">{row.total}</span>,
                        className: "text-end",
                    },
                    {
                        id: "status",
                        header: cols.status,
                        cell: (row: OrderRow) => <StatusBadge tone={row.status.tone}>{status(row.status.labelKey)}</StatusBadge>,
                    },
                    {
                        id: "placedAt",
                        header: cols.placedAt,
                        cell: (row: OrderRow) => <span className="text-muted-foreground">{row.placedAt}</span>,
                    },
                ]}
                rows={sampleRows}
                getRowKey={(row: OrderRow) => row.id}
                emptyState={t("empty")}
            />
        </section>
    );
}
