import { ArrowUpRight, Package, PiggyBank, ReceiptText, Truck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StatCard } from "#/components/StatCard";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "#/components/ui/table";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Dashboard" });
    return { title: t("title") };
}

interface RecentOrder {
    id: string;
    customer: string;
    total: string;
    status: { tone: StatusTone; labelKey: "pending" | "paid" | "shipped" | "delivered" };
}

const recentOrders: RecentOrder[] = [
    { id: "#1042", customer: "Sara M.", total: "$129.00", status: { tone: "warning", labelKey: "pending" } },
    { id: "#1041", customer: "Reza K.", total: "$58.00", status: { tone: "success", labelKey: "paid" } },
    { id: "#1040", customer: "Mahdi A.", total: "$240.00", status: { tone: "info", labelKey: "shipped" } },
    { id: "#1039", customer: "Niloo R.", total: "$75.50", status: { tone: "success", labelKey: "delivered" } },
];

interface TopProduct {
    name: string;
    sku: string;
    revenue: string;
}

const topProducts: TopProduct[] = [
    { name: "Sample Tee", sku: "TEE-001", revenue: "$1,240" },
    { name: "Sample Mug", sku: "MUG-001", revenue: "$890" },
    { name: "Sample Notebook", sku: "NB-001", revenue: "$640" },
];

export default async function DashboardPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Dashboard");
    const status = await getTranslations("Status");

    return (
        <section className="flex flex-col gap-6">
            <header>
                <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t("ordersToday")}
                    value="42"
                    delta={{ percent: 12.4, comparison: "vs last week" }}
                    icon={ReceiptText}
                />
                <StatCard
                    label={t("revenueToday")}
                    value="$2,840"
                    delta={{ percent: 8.1, comparison: "vs last week" }}
                    icon={PiggyBank}
                />
                <StatCard
                    label={t("activeProducts")}
                    value="128"
                    delta={{ percent: -2.3, comparison: "vs last month" }}
                    icon={Package}
                />
                <StatCard label={t("pendingFulfilments")} value="6" icon={Truck} />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader className="flex items-center justify-between border-b">
                        <CardTitle className="text-sm">{t("recentOrders")}</CardTitle>
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                            {t("viewAll")}
                            <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        </Button>
                    </CardHeader>
                    <CardContent className="px-0">
                        <Table>
                            <TableBody>
                                {recentOrders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="px-5 py-3 font-medium">{order.id}</TableCell>
                                        <TableCell className="px-5 py-3 text-muted-foreground">{order.customer}</TableCell>
                                        <TableCell className="px-5 py-3 text-end font-medium">{order.total}</TableCell>
                                        <TableCell className="px-5 py-3 text-end">
                                            <StatusBadge tone={order.status.tone}>{status(order.status.labelKey)}</StatusBadge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b">
                        <CardTitle className="text-sm">{t("topProducts")}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-0">
                        <ul className="flex flex-col">
                            {topProducts.map((product) => (
                                <li
                                    key={product.sku}
                                    className="flex items-center justify-between border-border border-b px-5 py-3 text-sm last:border-b-0"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium">{product.name}</span>
                                        <span className="text-muted-foreground text-xs">{product.sku}</span>
                                    </div>
                                    <span className="font-medium">{product.revenue}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}
