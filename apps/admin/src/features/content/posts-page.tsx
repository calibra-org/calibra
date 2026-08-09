"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import {
    Activity,
    Bot,
    CalendarClock,
    Eye,
    FilePenLine,
    FileText,
    MousePointerClick,
    Plus,
    Search,
    ShoppingCart,
    Sparkles,
} from "#/icons";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { useContentPosts, useContentSummary } from "./queries";
import { ContentStatCard, ContentStatusBadge, ContentTypeBadge, ScoreBar, SectionTitle } from "./ui";

export function ContentPostsPage() {
    const locale = useLocale() as Locale;
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [status, setStatus] = useState("all");
    const [type, setType] = useState("all");
    const [page, setPage] = useState(1);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    const filters = useMemo(
        () => ({
            page,
            limit: 20,
            q: debounced || undefined,
            status: status === "all" ? undefined : status,
            type: type === "all" ? undefined : type,
            sort: "updated_desc",
        }),
        [debounced, page, status, type],
    );
    const posts = useContentPosts(filters);
    const summary = useContentSummary();
    const metrics = summary.data?.data;

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="مدیریت نوشته‌ها"
                subtitle="مرکز مدیریت مقاله، خبر، راهنما و محتوای متصل به محصولات و سفارش‌ها."
                actions={
                    <Button asChild>
                        <Link href={"/content/studio" as never}>
                            <Plus className="size-4" />
                            نوشته جدید
                        </Link>
                    </Button>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <ContentStatCard
                    icon={FileText}
                    label="کل محتوا"
                    value={formatNumber(metrics?.totals.total ?? 0, locale)}
                    hint={`${formatNumber(metrics?.totals.published ?? 0, locale)} منتشرشده`}
                />
                <ContentStatCard
                    icon={Activity}
                    label="سلامت محتوا"
                    value={`${formatNumber(metrics?.scores.quality ?? 0, locale)} / ۱۰۰`}
                    hint={`SEO: ${formatNumber(metrics?.scores.seo ?? 0, locale)}`}
                />
                <ContentStatCard
                    icon={Eye}
                    label="بازدید"
                    value={formatNumber(metrics?.performance.views ?? 0, locale)}
                    hint={`${formatNumber(metrics?.performance.product_clicks ?? 0, locale)} کلیک محصول`}
                />
                <ContentStatCard
                    icon={ShoppingCart}
                    label="درآمد منتسب"
                    value={formatMoney(metrics?.performance.assisted_revenue_minor ?? 0, locale)}
                    hint="از سفارش‌های متصل به محتوا"
                />
                <ContentStatCard
                    icon={Sparkles}
                    label="نیازمند اقدام"
                    value={formatNumber(
                        (metrics?.action_counts.high_opportunity_signals ?? 0) + (metrics?.action_counts.active_agent_runs ?? 0),
                        locale,
                    )}
                    hint={`${formatNumber(metrics?.action_counts.scheduled_next_7_days ?? 0, locale)} انتشار نزدیک`}
                    attention
                />
            </div>

            <Card>
                <CardHeader className="gap-4">
                    <SectionTitle title="فهرست نوشته‌ها" description="فیلتر، بازبینی و ادامه ویرایش همه محتواهای Tenant جاری." />
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
                        <div className="relative">
                            <Search
                                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                value={search}
                                onChange={(event) => {
                                    setSearch(event.target.value);
                                    setPage(1);
                                }}
                                className="ps-9"
                                placeholder="جست‌وجو در عنوان، نامک یا کلمه کلیدی..."
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
                                <SelectValue placeholder="همه وضعیت‌ها" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                                <SelectItem value="draft">پیش‌نویس</SelectItem>
                                <SelectItem value="in_review">در انتظار بازبینی</SelectItem>
                                <SelectItem value="approved">تأییدشده</SelectItem>
                                <SelectItem value="scheduled">زمان‌بندی‌شده</SelectItem>
                                <SelectItem value="published">منتشرشده</SelectItem>
                                <SelectItem value="archived">بایگانی‌شده</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={type}
                            onValueChange={(value) => {
                                if (typeof value !== "string") return;
                                setType(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="همه نوع‌ها" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">همه نوع‌ها</SelectItem>
                                <SelectItem value="article">مقاله</SelectItem>
                                <SelectItem value="news">خبر</SelectItem>
                                <SelectItem value="guide">راهنما</SelectItem>
                                <SelectItem value="case_study">مطالعه موردی</SelectItem>
                                <SelectItem value="landing">صفحه فرود</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {posts.isPending ? (
                        <div className="space-y-2 p-5">
                            {["post-1", "post-2", "post-3", "post-4", "post-5", "post-6", "post-7"].map((key) => (
                                <Skeleton key={key} className="h-16" />
                            ))}
                        </div>
                    ) : posts.isError ? (
                        <div className="p-5">
                            <EmptyState
                                icon={FileText}
                                title="دریافت نوشته‌ها ناموفق بود"
                                description="اتصال API و وضعیت Migration را بررسی کنید."
                            />
                        </div>
                    ) : (posts.data?.data.length ?? 0) === 0 ? (
                        <div className="p-5">
                            <EmptyState
                                icon={FilePenLine}
                                title="نوشته‌ای پیدا نشد"
                                description="فیلترها را تغییر دهید یا نخستین نوشته را بسازید."
                                action={
                                    <Button asChild>
                                        <Link href={"/content/studio" as never}>ساخت نوشته</Link>
                                    </Button>
                                }
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-72">نوشته</TableHead>
                                        <TableHead>وضعیت</TableHead>
                                        <TableHead className="min-w-40">امتیازها</TableHead>
                                        <TableHead>تعامل</TableHead>
                                        <TableHead>به‌روزرسانی</TableHead>
                                        <TableHead className="text-end">عملیات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {posts.data?.data.map((post) => (
                                        <TableRow key={post.id}>
                                            <TableCell>
                                                <div className="flex items-start gap-3">
                                                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                                                        <FileText className="size-4 text-muted-foreground" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <Link
                                                            href={`/content/studio/${post.id}` as never}
                                                            className="line-clamp-1 font-medium hover:text-primary"
                                                        >
                                                            {post.title}
                                                        </Link>
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                                                            <ContentTypeBadge type={post.type} />
                                                            <span dir="ltr">/{post.slug}</span>
                                                            {post.products.length > 0 ? (
                                                                <span>{formatNumber(post.products.length, locale)} محصول</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <ContentStatusBadge status={post.status} />
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-2">
                                                    <ScoreBar value={post.seo_score} label="SEO" />
                                                    <ScoreBar value={post.quality_score} label="کیفیت" />
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1 text-sm">
                                                    <span className="flex items-center gap-1.5">
                                                        <Eye className="size-3.5 text-muted-foreground" />
                                                        {formatNumber(post.views_count, locale)}
                                                    </span>
                                                    <span className="flex items-center gap-1.5">
                                                        <MousePointerClick className="size-3.5 text-muted-foreground" />
                                                        {formatNumber(post.product_clicks_count, locale)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                                                {formatDate(post.updated_at, locale)}
                                            </TableCell>
                                            <TableCell className="text-end">
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/content/studio/${post.id}` as never}>
                                                        <FilePenLine className="size-4" />
                                                        ویرایش
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {posts.data && posts.data.meta.last_page > 1 ? (
                        <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                            <span className="text-muted-foreground">
                                صفحه {formatNumber(posts.data.meta.page, locale)} از{" "}
                                {formatNumber(posts.data.meta.last_page, locale)}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                                >
                                    قبلی
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= posts.data.meta.last_page}
                                    onClick={() => setPage((value) => value + 1)}
                                >
                                    بعدی
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <SectionTitle title="صف انتشار" description="مواردی که در هفت روز آینده منتشر می‌شوند." />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <CalendarClock className="size-8 text-primary" />
                            <strong className="text-2xl">
                                {formatNumber(metrics?.action_counts.scheduled_next_7_days ?? 0, locale)}
                            </strong>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <SectionTitle title="فرصت‌های بازار" description="سیگنال‌های تازه با امتیاز فرصت بالا." />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <MousePointerClick className="size-8 text-primary" />
                            <strong className="text-2xl">
                                {formatNumber(metrics?.action_counts.high_opportunity_signals ?? 0, locale)}
                            </strong>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <SectionTitle title="Agentهای در حال اجرا" description="پردازش‌های صف‌شده یا فعال با بازبینی انسانی." />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <Bot className="size-8 text-primary" />
                            <strong className="text-2xl">
                                {formatNumber(metrics?.action_counts.active_agent_runs ?? 0, locale)}
                            </strong>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
