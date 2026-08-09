"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Activity, Bot, Eye, MousePointerClick, PackageSearch, ShoppingCart, TrendingUp } from "#/icons";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";

import { useContentReports, useContentSummary } from "./queries";
import { AGENT_LABELS, CONTENT_STATUS_LABELS, ContentStatCard, SectionTitle } from "./ui";
import type { ContentAgentKind, ContentStatus } from "./types";

interface ReportData {
    monthly: Array<{
        month: string;
        posts: number;
        views: number;
        product_clicks: number;
        assisted_orders: number;
        assisted_revenue_minor: number;
    }>;
    status: Array<{ status: ContentStatus; count: number }>;
    products: Array<{
        id: number;
        name: string | null;
        sku: string | null;
        posts: number;
        product_clicks: number;
        assisted_revenue_minor: number;
    }>;
    sources: Array<{ id: number; name: string; trust_score: number; status: string; signals: number; avg_opportunity: number }>;
    agents: Array<{ agent_kind: ContentAgentKind; status: string; count: number }>;
}

export function ContentReportsPage() {
    const locale = useLocale() as Locale;
    const reports = useContentReports();
    const summary = useContentSummary();
    const data = reports.data?.data as ReportData | undefined;
    const metrics = summary.data?.data;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="تحلیل و گزارش‌ها"
                subtitle="اثر محتوا بر دیده‌شدن، تعامل، محصولات و سفارش‌های منتسب؛ بدون ترکیب با درآمد قطعی فروش."
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ContentStatCard icon={Eye} label="بازدید محتوا" value={formatNumber(metrics?.performance.views ?? 0, locale)} />
                <ContentStatCard
                    icon={MousePointerClick}
                    label="کلیک محصول"
                    value={formatNumber(metrics?.performance.product_clicks ?? 0, locale)}
                />
                <ContentStatCard
                    icon={ShoppingCart}
                    label="درآمد منتسب"
                    value={formatMoney(metrics?.performance.assisted_revenue_minor ?? 0, locale)}
                    hint="شاخص Attribution، نه درآمد حسابداری"
                />
                <ContentStatCard
                    icon={Activity}
                    label="میانگین کیفیت"
                    value={`${formatNumber(metrics?.scores.quality ?? 0, locale)} / ۱۰۰`}
                    hint={`SEO: ${formatNumber(metrics?.scores.seo ?? 0, locale)}`}
                />
            </div>

            {reports.isPending ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    {["report-1", "report-2", "report-3", "report-4"].map((key) => (
                        <Skeleton key={key} className="h-72" />
                    ))}
                </div>
            ) : reports.isError || !data ? (
                <EmptyState
                    icon={TrendingUp}
                    title="دریافت گزارش‌ها ناموفق بود"
                    description="Migration، RLS و Queryهای گزارش را بررسی کنید."
                />
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <SectionTitle
                                title="روند ماهانه"
                                description="انتشار، بازدید، کلیک محصول و سفارش منتسب در ۱۸ ماه اخیر."
                            />
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>ماه</TableHead>
                                            <TableHead>نوشته</TableHead>
                                            <TableHead>بازدید</TableHead>
                                            <TableHead>کلیک محصول</TableHead>
                                            <TableHead>سفارش منتسب</TableHead>
                                            <TableHead>درآمد منتسب</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.monthly.map((row) => (
                                            <TableRow key={row.month}>
                                                <TableCell className="whitespace-nowrap">
                                                    {formatDate(row.month, locale)}
                                                </TableCell>
                                                <TableCell>{formatNumber(row.posts, locale)}</TableCell>
                                                <TableCell>{formatNumber(row.views, locale)}</TableCell>
                                                <TableCell>{formatNumber(row.product_clicks, locale)}</TableCell>
                                                <TableCell>{formatNumber(row.assisted_orders, locale)}</TableCell>
                                                <TableCell>{formatMoney(row.assisted_revenue_minor, locale)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <SectionTitle
                                    title="محصولات متصل به محتوا"
                                    description="محصولاتی که در نوشته‌ها حضور دارند و تعامل منتسب گرفته‌اند."
                                />
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.products.length === 0 ? (
                                    <EmptyState icon={PackageSearch} title="داده محصولی ثبت نشده است" />
                                ) : (
                                    data.products.slice(0, 12).map((row) => (
                                        <div
                                            key={row.id}
                                            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border p-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-sm">{row.name || `محصول #${row.id}`}</p>
                                                <p className="mt-1 text-muted-foreground text-xs" dir="ltr">
                                                    {row.sku || `ID ${row.id}`}
                                                </p>
                                            </div>
                                            <div className="text-end text-xs">
                                                <p>{formatNumber(row.posts, locale)} نوشته</p>
                                                <p className="mt-1 text-muted-foreground">
                                                    {formatNumber(row.product_clicks, locale)} کلیک
                                                </p>
                                                <p className="mt-1 font-medium">
                                                    {formatMoney(row.assisted_revenue_minor, locale)}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <SectionTitle title="منابع رصد" description="حجم سیگنال، اعتماد و متوسط فرصت هر منبع." />
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.sources.length === 0 ? (
                                    <EmptyState title="منبعی ثبت نشده است" />
                                ) : (
                                    data.sources.slice(0, 12).map((row) => (
                                        <div
                                            key={row.id}
                                            className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-sm">{row.name}</p>
                                                <p className="mt-1 text-muted-foreground text-xs">
                                                    اعتماد {formatNumber(row.trust_score, locale)} · فرصت{" "}
                                                    {formatNumber(row.avg_opportunity, locale)}
                                                </p>
                                            </div>
                                            <Badge variant="outline">{formatNumber(row.signals, locale)} سیگنال</Badge>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <SectionTitle title="ترکیب وضعیت محتوا" />
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                {data.status.map((row) => (
                                    <div key={row.status} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                                        <span className="text-sm">{CONTENT_STATUS_LABELS[row.status]}</span>
                                        <strong className="tabular-nums">{formatNumber(row.count, locale)}</strong>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <SectionTitle title="عملکرد Agentها" />
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {data.agents.length === 0 ? (
                                    <EmptyState icon={Bot} title="اجرای Agent ثبت نشده است" />
                                ) : (
                                    data.agents.map((row) => (
                                        <div
                                            key={`${row.agent_kind}-${row.status}`}
                                            className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                        >
                                            <span className="text-sm">{AGENT_LABELS[row.agent_kind]}</span>
                                            <span className="text-muted-foreground text-xs">
                                                {row.status} · {formatNumber(row.count, locale)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
