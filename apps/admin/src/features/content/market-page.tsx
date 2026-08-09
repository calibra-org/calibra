"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import {
    AlertTriangle,
    Check,
    ExternalLink,
    FilePlus2,
    Newspaper,
    Plus,
    Radar,
    RefreshCw,
    Rss,
    Search,
    ShieldCheck,
    Trash2,
    X,
} from "#/icons";
import { formatDate, formatNumber } from "#/lib/format";

import { useContentSignals, useContentSources, useMarketMutations } from "./queries";
import { ContentStatCard, SectionTitle } from "./ui";

const signalStatusLabel = { new: "جدید", reviewed: "بررسی‌شده", converted: "تبدیل‌شده", ignored: "نادیده‌گرفته‌شده" } as const;

export function ContentMarketPage() {
    const locale = useLocale() as Locale;
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [status, setStatus] = useState("new");
    const [page, setPage] = useState(1);
    const [sourceName, setSourceName] = useState("");
    const [feedUrl, setFeedUrl] = useState("");
    const [manualTitle, setManualTitle] = useState("");
    const [manualUrl, setManualUrl] = useState("");
    const [manualSummary, setManualSummary] = useState("");

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    const signals = useContentSignals({
        page,
        limit: 20,
        q: debounced || undefined,
        status: status === "all" ? undefined : status,
    });
    const sources = useContentSources();
    const mutations = useMarketMutations();
    const sourceRows = sources.data?.data ?? [];
    const signalRows = signals.data?.data ?? [];
    const metrics = useMemo(
        () => ({
            total: signals.data?.meta.total ?? 0,
            highOpportunity: signalRows.filter((row) => row.opportunity_score >= 70).length,
            highRisk: signalRows.filter((row) => row.risk_score >= 60).length,
            sourceErrors: sourceRows.filter((row) => row.status === "error").length,
        }),
        [signalRows, signals.data?.meta.total, sourceRows],
    );

    async function createSource() {
        if (!sourceName.trim() || !feedUrl.trim()) return;
        try {
            await mutations.createSource.mutateAsync({
                name: sourceName.trim(),
                feed_url: feedUrl.trim(),
                url: feedUrl.trim(),
                source_type: "rss",
                status: "active",
                trust_score: 60,
                topics: [],
                crawl_interval_minutes: 360,
            });
            setSourceName("");
            setFeedUrl("");
            toast.add({ title: "منبع رصد اضافه شد", data: { tone: "success" } });
        } catch {
            toast.add({
                title: "افزودن منبع ناموفق بود",
                description: "نشانی Feed و دسترسی منبع را بررسی کنید.",
                data: { tone: "error" },
            });
        }
    }

    async function createManualSignal() {
        if (!manualTitle.trim()) return;
        try {
            await mutations.createSignal.mutateAsync({
                title: manualTitle.trim(),
                url: manualUrl.trim() || null,
                summary: manualSummary.trim() || null,
                language: "fa",
                sentiment: "neutral",
                source_trust_score: 50,
                business_relevance_score: 50,
                opportunity_score: 50,
                risk_score: 0,
            });
            setManualTitle("");
            setManualUrl("");
            setManualSummary("");
            toast.add({ title: "سیگنال دستی ثبت شد", data: { tone: "success" } });
        } catch {
            toast.add({ title: "ثبت سیگنال ناموفق بود", data: { tone: "error" } });
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="اخبار و رصد بازار"
                subtitle="جمع‌آوری کنترل‌شده منابع، امتیازدهی فرصت و تبدیل خبر معتبر به پیش‌نویس قابل بازبینی."
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ContentStatCard icon={Newspaper} label="سیگنال‌های فیلترشده" value={formatNumber(metrics.total, locale)} />
                <ContentStatCard
                    icon={Radar}
                    label="فرصت بالا در این صفحه"
                    value={formatNumber(metrics.highOpportunity, locale)}
                    hint="امتیاز فرصت ۷۰ یا بیشتر"
                />
                <ContentStatCard
                    icon={AlertTriangle}
                    label="نیازمند احتیاط"
                    value={formatNumber(metrics.highRisk, locale)}
                    hint="ریسک ادعا یا منبع"
                    attention={metrics.highRisk > 0}
                />
                <ContentStatCard
                    icon={Rss}
                    label="خطای منبع"
                    value={formatNumber(metrics.sourceErrors, locale)}
                    hint={`${formatNumber(sourceRows.length, locale)} منبع ثبت‌شده`}
                    attention={metrics.sourceErrors > 0}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <Card>
                    <CardHeader className="gap-4">
                        <SectionTitle
                            title="سیگنال‌های بازار"
                            description="هر مورد قبل از استفاده باید از نظر منبع، ادعا و ارتباط با کسب‌وکار بررسی شود."
                        />
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_13rem]">
                            <div className="relative">
                                <Search
                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <Input
                                    className="ps-9"
                                    value={search}
                                    onChange={(event) => {
                                        setSearch(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder="جست‌وجو در عنوان و خلاصه خبر..."
                                />
                            </div>
                            <Select
                                value={status}
                                onValueChange={(value) => {
                                    if (typeof value !== "string") return;
                                    setStatus(value);
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                                    <SelectItem value="new">جدید</SelectItem>
                                    <SelectItem value="reviewed">بررسی‌شده</SelectItem>
                                    <SelectItem value="converted">تبدیل‌شده</SelectItem>
                                    <SelectItem value="ignored">نادیده‌گرفته‌شده</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {signals.isPending ? (
                            <div className="space-y-2 p-5">
                                {["signal-1", "signal-2", "signal-3", "signal-4", "signal-5", "signal-6"].map((key) => (
                                    <Skeleton key={key} className="h-20" />
                                ))}
                            </div>
                        ) : signals.isError ? (
                            <div className="p-5">
                                <EmptyState
                                    icon={AlertTriangle}
                                    title="دریافت رصد بازار ناموفق بود"
                                    description="اتصال API و Migration ماژول نوشته‌ها را بررسی کنید."
                                />
                            </div>
                        ) : signalRows.length === 0 ? (
                            <div className="p-5">
                                <EmptyState
                                    icon={Radar}
                                    title="سیگنالی در این وضعیت نیست"
                                    description="یک منبع RSS را واکشی کنید یا سیگنال دستی بسازید."
                                />
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="min-w-80">خبر و منبع</TableHead>
                                            <TableHead>امتیازها</TableHead>
                                            <TableHead>وضعیت</TableHead>
                                            <TableHead>تاریخ</TableHead>
                                            <TableHead className="text-end">عملیات</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {signalRows.map((signal) => (
                                            <TableRow key={signal.id}>
                                                <TableCell>
                                                    <div className="max-w-xl space-y-1.5">
                                                        <div className="flex items-start gap-2">
                                                            <p className="font-medium leading-6">{signal.title}</p>
                                                            {signal.url ? (
                                                                <a
                                                                    href={signal.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    aria-label="بازکردن منبع"
                                                                >
                                                                    <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                                                                </a>
                                                            ) : null}
                                                        </div>
                                                        <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                                                            {signal.summary || "خلاصه‌ای ثبت نشده است."}
                                                        </p>
                                                        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                                                            <ShieldCheck className="size-3.5" />
                                                            {signal.source_name || "ورود دستی"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="grid min-w-36 grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                                        <span className="text-muted-foreground">اعتماد</span>
                                                        <strong className="tabular-nums">
                                                            {formatNumber(signal.source_trust_score, locale)}
                                                        </strong>
                                                        <span className="text-muted-foreground">ارتباط</span>
                                                        <strong className="tabular-nums">
                                                            {formatNumber(signal.business_relevance_score, locale)}
                                                        </strong>
                                                        <span className="text-muted-foreground">فرصت</span>
                                                        <strong className="tabular-nums">
                                                            {formatNumber(signal.opportunity_score, locale)}
                                                        </strong>
                                                        <span className="text-muted-foreground">ریسک</span>
                                                        <strong className="tabular-nums">
                                                            {formatNumber(signal.risk_score, locale)}
                                                        </strong>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{signalStatusLabel[signal.status]}</Badge>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                                                    {formatDate(signal.published_at ?? signal.fetched_at, locale)}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex justify-end gap-1">
                                                        {signal.status !== "converted" ? (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                disabled={mutations.convertSignal.isPending}
                                                                onClick={async () => {
                                                                    try {
                                                                        const result = (await mutations.convertSignal.mutateAsync(
                                                                            signal.id,
                                                                        )) as { data: { id: number } };
                                                                        toast.add({
                                                                            title: "پیش‌نویس ساخته شد",
                                                                            data: { tone: "success" },
                                                                        });
                                                                        window.location.href = `/${locale}/content/studio/${result.data.id}`;
                                                                    } catch {
                                                                        toast.add({
                                                                            title: "تبدیل خبر ناموفق بود",
                                                                            data: { tone: "error" },
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <FilePlus2 className="size-4" />
                                                                پیش‌نویس
                                                            </Button>
                                                        ) : null}
                                                        {signal.status === "new" ? (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                aria-label="بررسی شد"
                                                                onClick={() =>
                                                                    mutations.signalStatus.mutate({
                                                                        id: signal.id,
                                                                        status: "reviewed",
                                                                    })
                                                                }
                                                            >
                                                                <Check className="size-4" />
                                                            </Button>
                                                        ) : null}
                                                        {signal.status === "new" ? (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                aria-label="نادیده گرفتن"
                                                                onClick={() =>
                                                                    mutations.signalStatus.mutate({
                                                                        id: signal.id,
                                                                        status: "ignored",
                                                                    })
                                                                }
                                                            >
                                                                <X className="size-4" />
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {signals.data && signals.data.meta.last_page > 1 ? (
                            <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                                <span className="text-muted-foreground">
                                    صفحه {formatNumber(page, locale)} از {formatNumber(signals.data.meta.last_page, locale)}
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page <= 1}
                                        onClick={() => setPage((value) => value - 1)}
                                    >
                                        قبلی
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={page >= signals.data.meta.last_page}
                                        onClick={() => setPage((value) => value + 1)}
                                    >
                                        بعدی
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">افزودن منبع RSS/Atom</CardTitle>
                            <CardDescription>منابع فقط پس از اعتبارسنجی شبکه و بدون Redirect واکشی می‌شوند.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="source-name">نام منبع</Label>
                                <Input
                                    id="source-name"
                                    value={sourceName}
                                    onChange={(event) => setSourceName(event.target.value)}
                                    placeholder="مثلاً خبرگزاری تخصصی"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="feed-url">نشانی Feed</Label>
                                <Input
                                    id="feed-url"
                                    dir="ltr"
                                    value={feedUrl}
                                    onChange={(event) => setFeedUrl(event.target.value)}
                                    placeholder="https://example.com/feed.xml"
                                />
                            </div>
                            <Button
                                className="w-full"
                                disabled={!sourceName.trim() || !feedUrl.trim() || mutations.createSource.isPending}
                                onClick={createSource}
                            >
                                <Plus className="size-4" />
                                افزودن منبع
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">منابع فعال</CardTitle>
                            <CardDescription>واکاوی دستی برای کنترل بار و مشاهده خطاها.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {sources.isPending ? (
                                ["source-1", "source-2", "source-3"].map((key) => <Skeleton key={key} className="h-14" />)
                            ) : sourceRows.length === 0 ? (
                                <p className="text-muted-foreground text-sm">هنوز منبعی ثبت نشده است.</p>
                            ) : (
                                sourceRows.map((source) => (
                                    <div
                                        key={source.id}
                                        className="flex items-center justify-between gap-2 rounded-lg border p-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-sm">{source.name}</p>
                                            <p className="truncate text-muted-foreground text-xs">
                                                {source.status === "error"
                                                    ? source.last_error || "خطای واکشی"
                                                    : source.status === "fetching"
                                                      ? "در حال واکشی منبع…"
                                                      : `اعتماد ${formatNumber(source.trust_score, locale)}`}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 gap-1">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label="واکاوی منبع"
                                                disabled={mutations.ingestSource.isPending}
                                                onClick={() => mutations.ingestSource.mutate(source.id)}
                                            >
                                                <RefreshCw className="size-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label="حذف منبع"
                                                disabled={mutations.removeSource.isPending}
                                                onClick={() => mutations.removeSource.mutate(source.id)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">ثبت سیگنال دستی</CardTitle>
                            <CardDescription>برای تماس مشتری، نمایشگاه، تأمین‌کننده یا مشاهده‌ای که Feed ندارد.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Input
                                value={manualTitle}
                                onChange={(event) => setManualTitle(event.target.value)}
                                placeholder="عنوان فرصت یا خبر"
                            />
                            <Input
                                dir="ltr"
                                value={manualUrl}
                                onChange={(event) => setManualUrl(event.target.value)}
                                placeholder="نشانی منبع (اختیاری)"
                            />
                            <Textarea
                                value={manualSummary}
                                onChange={(event) => setManualSummary(event.target.value)}
                                placeholder="خلاصه، شواهد و دلیل اهمیت"
                                rows={4}
                            />
                            <Button
                                variant="outline"
                                className="w-full"
                                disabled={!manualTitle.trim() || mutations.createSignal.isPending}
                                onClick={createManualSignal}
                            >
                                <Plus className="size-4" />
                                ثبت سیگنال
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
