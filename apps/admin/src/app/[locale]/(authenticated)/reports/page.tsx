import type { Locale } from "@calibra/shared/i18n";
import { CheckCircle2, PiggyBank, RefreshCcw, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SalesComparisonChart } from "#/components/charts/SalesComparisonChart";
import { PageHeader } from "#/components/PageHeader";
import { StatCard } from "#/components/StatCard";
import { SubTabs } from "#/components/SubTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMoney, formatNumber } from "#/lib/format";
import { getSalesReport } from "#/lib/mock/repos";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Reports.sales" });
    return { title: t("title") };
}

export default async function ReportsSalesPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Reports");
    const salesT = await getTranslations("Reports.sales");
    const data = await getSalesReport();

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <SubTabs
                namespace="Reports.tabs"
                tabs={[
                    { href: "/reports", labelKey: "sales" },
                    { href: "/reports/top-sellers", labelKey: "topSellers" },
                ]}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard label={salesT("totalRevenue")} value={formatMoney(data.totalRevenue, locale)} icon={PiggyBank} />
                <StatCard label={salesT("netRevenue")} value={formatMoney(data.netRevenue, locale)} icon={CheckCircle2} />
                <StatCard label={salesT("refundedAmount")} value={formatMoney(data.refundedAmount, locale)} icon={RefreshCcw} />
                <StatCard label={salesT("averageOrder")} value={formatMoney(data.averageOrderValue, locale)} />
                <StatCard label={salesT("orderCount")} value={formatNumber(data.orderCount, locale)} icon={ShoppingBag} />
            </div>

            <Card>
                <CardHeader className="border-b pb-4">
                    <CardTitle className="text-base">{salesT("chartTitle")}</CardTitle>
                    <CardDescription>{salesT("subtitle")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <SalesComparisonChart data={data.series} />
                </CardContent>
            </Card>
        </section>
    );
}
