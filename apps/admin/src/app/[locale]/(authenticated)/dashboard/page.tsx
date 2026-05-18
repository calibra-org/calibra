import type { Locale } from "@calibra/shared/i18n";
import { ArrowUpRight, Package, PiggyBank, ReceiptText, Truck, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrdersByStatusChart } from "#/components/charts/OrdersByStatusChart";
import { SalesAreaChart } from "#/components/charts/SalesAreaChart";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { StatCard } from "#/components/StatCard";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { getDashboardStats } from "#/lib/mock/repos";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Dashboard" });
    return { title: t("title") };
}

export default async function DashboardPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Dashboard");
    const stats = await getDashboardStats();

    const comparison = t("comparedTo");
    const maxTopRevenue = Math.max(...stats.topProducts.map((p) => p.revenue), 1);

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={t("ordersToday")}
                    value={formatNumber(stats.ordersToday, locale)}
                    delta={{ percent: stats.ordersDeltaPercent, comparison }}
                    icon={ReceiptText}
                />
                <StatCard
                    label={t("revenueToday")}
                    value={formatMoney(stats.revenueToday, locale)}
                    delta={{ percent: stats.revenueDeltaPercent, comparison }}
                    icon={PiggyBank}
                />
                <StatCard
                    label={t("activeProducts")}
                    value={formatNumber(stats.activeProducts, locale)}
                    delta={{ percent: stats.activeProductsDeltaPercent, comparison }}
                    icon={Package}
                />
                <StatCard
                    label={t("pendingFulfilments")}
                    value={formatNumber(stats.pendingFulfilments, locale)}
                    icon={Truck}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                    <CardHeader className="flex items-start justify-between gap-2 border-b pb-4">
                        <div>
                            <CardTitle className="text-base">{t("salesTrend")}</CardTitle>
                            <CardDescription>{t("salesTrendSubtitle")}</CardDescription>
                        </div>
                        <StatCard
                            label={t("newCustomers")}
                            value={formatNumber(stats.newCustomersToday, locale)}
                            icon={UserPlus}
                        />
                    </CardHeader>
                    <CardContent className="pt-6">
                        <SalesAreaChart data={stats.salesSeries} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-base">{t("ordersByStatus")}</CardTitle>
                        <CardDescription>{t("ordersByStatusSubtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <OrdersByStatusChart data={stats.ordersByStatus} />
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                    <CardHeader className="flex items-center justify-between border-b pb-4">
                        <div>
                            <CardTitle className="text-base">{t("recentOrders")}</CardTitle>
                            <CardDescription>{t("salesTrendSubtitle")}</CardDescription>
                        </div>
                        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                            <Link href="/orders">
                                {t("viewAll")}
                                <ArrowUpRight className="size-3.5" aria-hidden="true" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="px-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40">
                                    <TableHead className="px-5">{t("recentOrders")}</TableHead>
                                    <TableHead>{/* customer */}</TableHead>
                                    <TableHead className="text-end">{/* total */}</TableHead>
                                    <TableHead className="text-end">{/* status */}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stats.recentOrders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="px-5 py-3 font-medium">
                                            <Link href={`/orders/${order.id}` as never} className="hover:underline">
                                                #{formatNumber(order.orderNumber, locale)}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{order.customerName}</TableCell>
                                        <TableCell className="text-end font-medium">
                                            {formatMoney(order.grandTotal, locale)}
                                        </TableCell>
                                        <TableCell className="px-5 text-end">
                                            <OrderStatusBadge status={order.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-base">{t("topProducts")}</CardTitle>
                        <CardDescription>{t("topProductsSubtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 pt-5">
                        {stats.topProducts.map((product) => {
                            const percent = (product.revenue / maxTopRevenue) * 100;
                            return (
                                <div key={product.productId} className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between gap-2 text-sm">
                                        <Link
                                            href={`/products/${product.productId}` as never}
                                            className="truncate font-medium hover:underline"
                                        >
                                            {product.name[locale]}
                                        </Link>
                                        <span className="font-medium tabular-nums">
                                            {formatMoney(product.revenue, locale)}
                                        </span>
                                    </div>
                                    <Progress value={percent} />
                                    <div className="flex items-center justify-between text-muted-foreground text-xs">
                                        <span>{product.sku}</span>
                                        <span>{formatNumber(product.units, locale)} ×</span>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="border-b pb-4">
                    <CardTitle className="text-base">{t("recentOrders")}</CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40">
                                <TableHead className="px-5">#</TableHead>
                                <TableHead>{/* customer */}</TableHead>
                                <TableHead className="text-end">{/* total */}</TableHead>
                                <TableHead className="text-end">{/* placedAt */}</TableHead>
                                <TableHead className="px-5 text-end">{/* status */}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.recentOrders.map((order) => (
                                <TableRow key={`activity-${order.id}`}>
                                    <TableCell className="px-5 py-3 font-medium">
                                        <Link href={`/orders/${order.id}` as never} className="hover:underline">
                                            #{formatNumber(order.orderNumber, locale)}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{order.customerName}</TableCell>
                                    <TableCell className="text-end font-medium">
                                        {formatMoney(order.grandTotal, locale)}
                                    </TableCell>
                                    <TableCell className="text-end text-muted-foreground text-xs">
                                        {formatRelativeTime(order.createdAt, locale)}
                                    </TableCell>
                                    <TableCell className="px-5 text-end">
                                        <OrderStatusBadge status={order.status} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </section>
    );
}
