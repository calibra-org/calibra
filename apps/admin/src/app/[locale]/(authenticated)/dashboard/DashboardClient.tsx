"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Package, PiggyBank, ReceiptText, RefreshCw, Truck, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { OrdersByStatusChart } from "#/components/charts/OrdersByStatusChart";
import { SalesAreaChart } from "#/components/charts/SalesAreaChart";
import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { StatCard } from "#/components/StatCard";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import {
    useActiveProductsCount,
    useNewCustomersTodayStats,
    useOrdersByStatus,
    useOrdersTodayStats,
    usePendingFulfilmentsStats,
    useRecentCustomers,
    useRecentOrders,
    useRevenueTodayStats,
    useSalesSeries,
    useTopProducts,
} from "#/lib/queries/dashboard";
import { CustomerInsightsCard } from "#/views/dashboard/customer-insights-card";
import { RegionalMapCard } from "#/views/dashboard/regional/regional-map-card";

/**
 * The dashboard renders its full shell on first paint and each widget streams in independently
 * through its own `useQuery`. The page never blocks on a single network call, and the Refresh
 * button invalidates every `["dashboard", …]` key in one go — see `lib/queries/dashboard.ts`.
 */
export function DashboardClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Dashboard");
    const tCommon = useTranslations("Common");
    const queryClient = useQueryClient();

    const comparison = t("comparedTo");

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["dashboard"] })}>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {tCommon("refresh")}
                </Button>
            </header>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <OrdersTodayCard label={t("ordersToday")} comparison={comparison} locale={locale} />
                <RevenueTodayCard label={t("revenueToday")} comparison={comparison} locale={locale} />
                <ActiveProductsCard label={t("activeProducts")} comparison={comparison} locale={locale} />
                <PendingFulfilmentsCard label={t("pendingFulfilments")} locale={locale} />
                <NewCustomersCard
                    label={t("newCustomers")}
                    comparison={t("newCustomersComparison")}
                    description={t("newCustomersDescription")}
                    locale={locale}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-base">{t("salesTrend")}</CardTitle>
                        <CardDescription>{t("salesTrendSubtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <SalesSeriesWidget />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-base">{t("ordersByStatus")}</CardTitle>
                        <CardDescription>{t("ordersByStatusSubtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <OrdersByStatusWidget />
                    </CardContent>
                </Card>
            </div>

            <CustomerInsightsCard />

            <RegionalMapCard />

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
                                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="px-0">
                        <RecentOrdersTable locale={locale} headerLabel={t("recentOrders")} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="border-b pb-4">
                        <CardTitle className="text-base">{t("topProducts")}</CardTitle>
                        <CardDescription>{t("topProductsSubtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 pt-5">
                        <TopProductsList locale={locale} emptyLabel={tCommon("noResults")} />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex items-center justify-between border-b pb-4">
                    <div>
                        <CardTitle className="text-base">{t("recentCustomers")}</CardTitle>
                        <CardDescription>{t("recentCustomersSubtitle")}</CardDescription>
                    </div>
                    <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                        <Link href="/customers">
                            {t("viewAll")}
                            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent className="px-0">
                    <RecentCustomersList locale={locale} emptyLabel={t("noNewCustomers")} />
                </CardContent>
            </Card>
        </section>
    );
}

/* --- KPI cards ----------------------------------------------------------- */

interface StatCardWrapperProps {
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    isPending: boolean;
    isError: boolean;
    value: string;
    delta?: { percent: number; comparison: string };
    description?: string;
}

/**
 * Wraps `StatCard` with a per-card skeleton while loading and a dashed empty value on error. The
 * page-level Refresh button drives recovery, so individual cards stay quiet about retries.
 */
function StatCardSlot({ label, icon, isPending, isError, value, delta, description }: StatCardWrapperProps) {
    const displayValue = isPending ? "" : isError ? "—" : value;
    return (
        <div className="relative">
            <StatCard
                label={label}
                value={displayValue}
                delta={isPending || isError ? undefined : delta}
                description={description}
                icon={icon}
            />
            {isPending ? (
                <div className="pointer-events-none absolute inset-0 flex items-end p-5">
                    <Skeleton className="h-7 w-24" />
                </div>
            ) : null}
        </div>
    );
}

function OrdersTodayCard({ label, comparison, locale }: { label: string; comparison: string; locale: Locale }) {
    const { data, isPending, isError } = useOrdersTodayStats();
    return (
        <StatCardSlot
            label={label}
            icon={ReceiptText}
            isPending={isPending}
            isError={isError}
            value={data !== undefined ? formatNumber(data, locale) : ""}
            delta={{ percent: 0, comparison }}
        />
    );
}

function RevenueTodayCard({ label, comparison, locale }: { label: string; comparison: string; locale: Locale }) {
    const { data, isPending, isError } = useRevenueTodayStats();
    return (
        <StatCardSlot
            label={label}
            icon={PiggyBank}
            isPending={isPending}
            isError={isError}
            value={data !== undefined ? formatMoney(data, locale) : ""}
            delta={{ percent: 0, comparison }}
        />
    );
}

function ActiveProductsCard({ label, comparison, locale }: { label: string; comparison: string; locale: Locale }) {
    const { data, isPending, isError } = useActiveProductsCount();
    return (
        <StatCardSlot
            label={label}
            icon={Package}
            isPending={isPending}
            isError={isError}
            value={data !== undefined ? formatNumber(data, locale) : ""}
            delta={{ percent: 0, comparison }}
        />
    );
}

function PendingFulfilmentsCard({ label, locale }: { label: string; locale: Locale }) {
    const { data, isPending, isError } = usePendingFulfilmentsStats();
    return (
        <StatCardSlot
            label={label}
            icon={Truck}
            isPending={isPending}
            isError={isError}
            value={data !== undefined ? formatNumber(data, locale) : ""}
        />
    );
}

function NewCustomersCard({
    label,
    comparison,
    description,
    locale,
}: {
    label: string;
    comparison: string;
    description: string;
    locale: Locale;
}) {
    const { data, isPending, isError } = useNewCustomersTodayStats();
    return (
        <StatCardSlot
            label={label}
            icon={UserPlus}
            isPending={isPending}
            isError={isError}
            value={data !== undefined ? formatNumber(data, locale) : ""}
            delta={{ percent: 0, comparison }}
            description={description}
        />
    );
}

/* --- Charts -------------------------------------------------------------- */

function SalesSeriesWidget() {
    const { data, isPending, isError, refetch } = useSalesSeries(14);
    return (
        <WidgetState isPending={isPending} isError={isError} onRetry={refetch} loadingHeight={260}>
            <SalesAreaChart data={data ?? []} />
        </WidgetState>
    );
}

function OrdersByStatusWidget() {
    const { data, isPending, isError, refetch } = useOrdersByStatus();
    return (
        <WidgetState isPending={isPending} isError={isError} onRetry={refetch} loadingHeight={260}>
            <OrdersByStatusChart data={data ?? []} />
        </WidgetState>
    );
}

/* --- Tables / lists ------------------------------------------------------ */

function RecentOrdersTable({ locale, headerLabel }: { locale: Locale; headerLabel: string }) {
    const { data, isPending, isError, refetch } = useRecentOrders(8);
    return (
        <Table>
            <TableHeader>
                <TableRow className="bg-muted/40">
                    <TableHead className="px-5">{headerLabel}</TableHead>
                    <TableHead>{/* customer */}</TableHead>
                    <TableHead className="text-end">{/* total */}</TableHead>
                    <TableHead className="text-end">{/* status */}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isPending ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`skeleton-${String(i)}`}>
                            <TableCell className="px-5 py-3">
                                <Skeleton className="h-4 w-16" />
                            </TableCell>
                            <TableCell>
                                <Skeleton className="h-4 w-40" />
                            </TableCell>
                            <TableCell className="text-end">
                                <Skeleton className="ms-auto h-4 w-20" />
                            </TableCell>
                            <TableCell className="px-5 text-end">
                                <Skeleton className="ms-auto h-5 w-16" />
                            </TableCell>
                        </TableRow>
                    ))
                ) : isError ? (
                    <TableRow>
                        <TableCell colSpan={4} className="px-5 py-6 text-center text-muted-foreground text-sm">
                            <InlineError onRetry={refetch} />
                        </TableCell>
                    </TableRow>
                ) : (
                    (data ?? []).map((order) => (
                        <TableRow key={order.id}>
                            <TableCell className="px-5 py-3 font-medium">
                                <Link href={`/orders/${order.id}` as never} className="hover:underline">
                                    #{formatNumber(order.orderNumber, locale)}
                                </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{order.customerName}</TableCell>
                            <TableCell className="text-end font-medium">{formatMoney(order.grandTotal, locale)}</TableCell>
                            <TableCell className="px-5 text-end">
                                <OrderStatusBadge status={order.status} />
                            </TableCell>
                        </TableRow>
                    ))
                )}
            </TableBody>
        </Table>
    );
}

function RecentCustomersList({ locale, emptyLabel }: { locale: Locale; emptyLabel: string }) {
    const { data, isPending, isError, refetch } = useRecentCustomers(5);

    if (isPending) {
        return (
            <ul className="flex flex-col">
                {Array.from({ length: 5 }).map((_, i) => (
                    <li
                        key={`skeleton-${String(i)}`}
                        className="flex items-center justify-between gap-3 border-border border-b px-5 py-3 last:border-b-0"
                    >
                        <div className="flex items-center gap-3">
                            <Skeleton className="size-9 rounded-full" />
                            <div className="flex flex-col gap-1.5">
                                <Skeleton className="h-3.5 w-32" />
                                <Skeleton className="h-3 w-44" />
                            </div>
                        </div>
                        <Skeleton className="h-3 w-12" />
                    </li>
                ))}
            </ul>
        );
    }

    if (isError) {
        return (
            <div className="px-5 py-6 text-center text-sm">
                <InlineError onRetry={refetch} />
            </div>
        );
    }

    if ((data ?? []).length === 0) {
        return <p className="px-5 py-6 text-center text-muted-foreground text-sm">{emptyLabel}</p>;
    }

    return (
        <ul className="flex flex-col">
            {(data ?? []).map((customer) => {
                const initials = `${customer.firstName.charAt(0)}${customer.lastName.charAt(0)}`.toUpperCase();
                return (
                    <li
                        key={customer.id}
                        className="flex items-center justify-between gap-3 border-border border-b px-5 py-3 last:border-b-0"
                    >
                        <Link
                            href={`/customers/${customer.id}` as never}
                            className="flex flex-1 items-center gap-3 hover:underline"
                        >
                            <span className="grid size-9 place-items-center rounded-full bg-accent font-semibold text-accent-foreground text-xs">
                                {initials || "—"}
                            </span>
                            <div className="flex min-w-0 flex-col">
                                <span className="truncate font-medium text-sm">
                                    {customer.firstName} {customer.lastName}
                                </span>
                                <span className="truncate text-muted-foreground text-xs">{customer.email}</span>
                            </div>
                        </Link>
                        <span className="shrink-0 text-muted-foreground text-xs">
                            {formatRelativeTime(customer.createdAt, locale)}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function TopProductsList({ locale, emptyLabel }: { locale: Locale; emptyLabel: string }) {
    const { data, isPending, isError, refetch } = useTopProducts({ days: 30, limit: 5 });

    if (isPending) {
        return (
            <div className="flex flex-col gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={`skeleton-${String(i)}`} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <Skeleton className="h-3.5 w-40" />
                            <Skeleton className="h-3.5 w-20" />
                        </div>
                        <Skeleton className="h-2 w-full" />
                        <div className="flex items-center justify-between text-xs">
                            <Skeleton className="h-2.5 w-16" />
                            <Skeleton className="h-2.5 w-10" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (isError) {
        return <InlineError onRetry={refetch} />;
    }

    const rows = data ?? [];
    if (rows.length === 0) {
        return <p className="py-6 text-center text-muted-foreground text-sm">{emptyLabel}</p>;
    }

    const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);
    return (
        <>
            {rows.map((product) => {
                const percent = (product.revenue / maxRevenue) * 100;
                return (
                    <div key={product.productId} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <Link
                                href={`/products/${product.productId}` as never}
                                className="truncate font-medium hover:underline"
                            >
                                {product.name}
                            </Link>
                            <span className="font-medium tabular-nums">{formatMoney(product.revenue, locale)}</span>
                        </div>
                        <Progress value={percent} />
                        <div className="flex items-center justify-between text-muted-foreground text-xs">
                            <span>{product.sku}</span>
                            <span>{formatNumber(product.units, locale)} ×</span>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

/* --- Shared state slots -------------------------------------------------- */

function WidgetState({
    isPending,
    isError,
    onRetry,
    loadingHeight,
    children,
}: {
    isPending: boolean;
    isError: boolean;
    onRetry: () => void;
    loadingHeight: number;
    children: ReactNode;
}) {
    if (isPending) {
        return <Skeleton className="w-full" style={{ height: loadingHeight }} />;
    }
    if (isError) {
        return (
            <div className="flex items-center justify-center" style={{ height: loadingHeight }}>
                <InlineError onRetry={onRetry} />
            </div>
        );
    }
    return <>{children}</>;
}

function InlineError({ onRetry }: { onRetry: () => void }) {
    const tCommon = useTranslations("Common");
    return (
        <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <span>{tCommon("errorLoading")}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
                {tCommon("retry")}
            </Button>
        </div>
    );
}
