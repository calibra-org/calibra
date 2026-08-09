"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { StatCard } from "#/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { AlertCircle, Banknote, ChartNoAxesCombined, CircleDollarSign, ClockAlert, Inbox } from "#/icons";
import { formatDate, formatMoney } from "#/lib/format";

import { FactorHeader, FactorQueryMessage } from "./components";
import { useFactorReports, useFactorSummary } from "./queries";

const AGING_LABELS: Record<string, string> = {
    current: "جاری و بدون سررسید",
    "1_30": "۱ تا ۳۰ روز",
    "31_60": "۳۱ تا ۶۰ روز",
    "61_90": "۶۱ تا ۹۰ روز",
    "90_plus": "بیشتر از ۹۰ روز",
};

const CHANNEL_LABELS: Record<string, string> = {
    none: "بدون کانال ترجیحی",
    sms: "پیامک",
    email: "ایمیل",
    whatsapp: "واتساپ",
};

export function FactorReportsPage() {
    const locale = useLocale() as Locale;
    const reports = useFactorReports();
    const summary = useFactorSummary();
    const collectionRate = summary.data?.total_issued_minor
        ? (summary.data.collected_minor / summary.data.total_issued_minor) * 100
        : 0;

    if (reports.isLoading || summary.isLoading) {
        return (
            <div className="space-y-4">
                {["report-1", "report-2", "report-3", "report-4", "report-5", "report-6", "report-7", "report-8"].map((key) => (
                    <Skeleton key={key} className="h-28" />
                ))}
            </div>
        );
    }

    if (reports.isError || summary.isError) {
        return (
            <div className="flex flex-col gap-6">
                <FactorHeader
                    title="گزارش‌های فاکتور"
                    subtitle="تحلیل وصول، مانده مطالبات، سن بدهی و عملکرد روش‌های تحویل و درگاه‌ها"
                />
                <Card>
                    <CardContent className="pt-6">
                        <FactorQueryMessage
                            icon={AlertCircle}
                            title="دریافت گزارش‌ها ناموفق بود"
                            description="داده‌های گزارش از سرور دریافت نشد. اتصال را بررسی و دوباره تلاش کنید."
                            actionLabel="تلاش دوباره"
                            onAction={() => {
                                void reports.refetch();
                                void summary.refetch();
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const monthly = reports.data?.monthly ?? [];
    const maxAging = Math.max(...(reports.data?.aging ?? []).map((row) => row.amount_minor), 1);
    const maxChannel = Math.max(...(reports.data?.channels ?? []).map((row) => row.count), 1);

    return (
        <div className="flex flex-col gap-6">
            <FactorHeader title="گزارش‌های فاکتور" subtitle="تحلیل وصول، مانده مطالبات، سن بدهی و عملکرد روش‌های تحویل و درگاه‌ها" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="نرخ وصول" value={`${collectionRate.toFixed(1)}%`} icon={ChartNoAxesCombined} tone="success" />
                <StatCard
                    label="کل صادرشده"
                    value={formatMoney(summary.data?.total_issued_minor ?? 0, locale)}
                    icon={Banknote}
                    tone="info"
                />
                <StatCard
                    label="مانده مطالبات"
                    value={formatMoney(summary.data?.outstanding_minor ?? 0, locale)}
                    icon={CircleDollarSign}
                    tone="warning"
                />
                <StatCard
                    label="سررسید گذشته"
                    value={formatMoney(summary.data?.overdue_minor ?? 0, locale)}
                    icon={ClockAlert}
                    tone="danger"
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">روند صدور و وصول</CardTitle>
                    <CardDescription>مقایسه ماهانه مبلغ اسناد صادرشده و اسناد پرداخت‌شده در ۱۲ ماه گذشته</CardDescription>
                </CardHeader>
                <CardContent>
                    {monthly.length === 0 ? (
                        <FactorQueryMessage
                            icon={Inbox}
                            title="داده‌ای برای نمودار وجود ندارد"
                            description="پس از صدور نخستین سند، روند ماهانه صدور و وصول در این بخش نمایش داده می‌شود."
                        />
                    ) : (
                        <ResponsiveContainer width="100%" height={320}>
                            <AreaChart data={monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="factorIssued" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="factorPaid" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                                        <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis
                                    dataKey="bucket"
                                    tickFormatter={(value) => formatDate(String(value), locale, { month: "short" })}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                />
                                <YAxis
                                    tickFormatter={(value: number) => formatMoney(value, locale, { withSymbol: false })}
                                    tickLine={false}
                                    axisLine={false}
                                    width={70}
                                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "hsl(var(--popover))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: 8,
                                        color: "hsl(var(--popover-foreground))",
                                        fontSize: 12,
                                    }}
                                    labelFormatter={(value) =>
                                        formatDate(String(value), locale, { year: "numeric", month: "long" })
                                    }
                                    formatter={(value: number, name: string) => [
                                        formatMoney(value, locale),
                                        name === "issued_minor" ? "صادرشده" : "وصول‌شده",
                                    ]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="issued_minor"
                                    stroke="hsl(var(--chart-1))"
                                    strokeWidth={2}
                                    fill="url(#factorIssued)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="paid_minor"
                                    stroke="hsl(var(--chart-2))"
                                    strokeWidth={2}
                                    fill="url(#factorPaid)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">سن مطالبات</CardTitle>
                        <CardDescription>تفکیک مانده اسناد پرداخت‌نشده بر اساس فاصله از سررسید</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(reports.data?.aging ?? []).length === 0 ? (
                            <FactorQueryMessage
                                icon={Inbox}
                                title="مطالبه بازی وجود ندارد"
                                description="مانده اسناد پرداخت‌نشده بر اساس سررسید در این بخش تفکیک می‌شود."
                                compact
                            />
                        ) : (
                            (reports.data?.aging ?? []).map((row) => (
                                <div key={row.bucket} className="space-y-2">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span>{AGING_LABELS[row.bucket] ?? row.bucket}</span>
                                        <span className="font-medium tabular-nums">{formatMoney(row.amount_minor, locale)}</span>
                                    </div>
                                    <Progress value={(row.amount_minor / maxAging) * 100} />
                                    <p className="text-muted-foreground text-xs">
                                        {row.count.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} سند
                                    </p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">روش‌های تحویل</CardTitle>
                        <CardDescription>تعداد و ارزش اسناد بر اساس روش ترجیحی ثبت‌شده هنگام صدور</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(reports.data?.channels ?? []).length === 0 ? (
                            <FactorQueryMessage
                                icon={Inbox}
                                title="روش تحویلی ثبت نشده است"
                                description="روش ترجیحی تحویل اسناد صادرشده در این بخش تحلیل می‌شود."
                                compact
                            />
                        ) : (
                            (reports.data?.channels ?? []).map((row) => (
                                <div key={row.delivery_channel} className="space-y-2">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span>{CHANNEL_LABELS[row.delivery_channel] ?? row.delivery_channel}</span>
                                        <span className="font-medium">
                                            {row.count.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                                        </span>
                                    </div>
                                    <Progress value={(row.count / maxChannel) * 100} />
                                    <p className="text-muted-foreground text-xs">{formatMoney(row.amount_minor, locale)}</p>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">وصول بر اساس درگاه یا روش</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {(reports.data?.gateways ?? []).length === 0 ? (
                        <div className="sm:col-span-2 xl:col-span-4">
                            <FactorQueryMessage
                                icon={Inbox}
                                title="وصولی ثبت نشده است"
                                description="پس از ثبت پرداخت دستی یا تأیید تراکنش درگاه، عملکرد روش‌های وصول نمایش داده می‌شود."
                                compact
                            />
                        </div>
                    ) : (
                        (reports.data?.gateways ?? []).map((row) => (
                            <div key={row.gateway} className="rounded-lg border p-4">
                                <p className="font-medium text-sm">{row.gateway === "manual" ? "پرداخت دستی" : row.gateway}</p>
                                <p className="mt-2 font-semibold text-lg tabular-nums">{formatMoney(row.amount_minor, locale)}</p>
                                <p className="text-muted-foreground text-xs">
                                    {row.count.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} پرداخت
                                </p>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
