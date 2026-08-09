"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Skeleton } from "#/components/ui/skeleton";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Plus } from "#/icons";
import { formatDate, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import { useContentCalendar } from "./queries";
import { ContentStatusBadge, ContentTypeBadge, SectionTitle } from "./ui";
import type { ContentPost } from "./types";

type CalendarPost = Pick<
    ContentPost,
    "id" | "title" | "type" | "status" | "scheduled_at" | "published_at" | "author_user_id" | "seo_score" | "quality_score"
>;

function dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function isoBoundary(date: Date, end = false): string {
    const value = new Date(date);
    if (end) value.setHours(23, 59, 59, 999);
    else value.setHours(0, 0, 0, 0);
    return value.toISOString();
}

export function ContentCalendarPage() {
    const locale = useLocale() as Locale;
    const [cursor, setCursor] = useState(() => new Date());
    const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
    const gridStart = useMemo(() => {
        const value = new Date(monthStart);
        const day = value.getDay();
        const offset = (day + 1) % 7;
        value.setDate(value.getDate() - offset);
        return value;
    }, [monthStart]);
    const gridEnd = useMemo(() => {
        const value = new Date(gridStart);
        value.setDate(value.getDate() + 41);
        return value;
    }, [gridStart]);
    const calendar = useContentCalendar(isoBoundary(gridStart), isoBoundary(gridEnd, true));
    const rows = calendar.data?.data ?? [];
    const days = useMemo(
        () =>
            Array.from({ length: 42 }, (_, index) => {
                const value = new Date(gridStart);
                value.setDate(gridStart.getDate() + index);
                return value;
            }),
        [gridStart],
    );
    const grouped = useMemo(() => {
        const map = new Map<string, CalendarPost[]>();
        for (const row of rows) {
            const date = row.scheduled_at ?? row.published_at;
            if (!date) continue;
            const key = dateKey(new Date(date));
            map.set(key, [...(map.get(key) ?? []), row]);
        }
        return map;
    }, [rows]);
    const scheduled = rows.filter((row) => row.status === "scheduled").length;
    const published = rows.filter((row) => row.status === "published").length;

    const monthTitle = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", {
        month: "long",
        year: "numeric",
    }).format(monthStart);
    const weekdayNames =
        locale === "fa" ? ["ش", "ی", "د", "س", "چ", "پ", "ج"] : ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="تقویم و انتشار"
                subtitle="برنامه‌ریزی، بازبینی و کنترل صف انتشار محتوا در Tenant جاری."
                actions={
                    <Button asChild>
                        <Link href={"/content/studio" as never}>
                            <Plus className="size-4" />
                            نوشته جدید
                        </Link>
                    </Button>
                }
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Card>
                    <CardHeader className="flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="size-5 text-primary" />
                            <h2 className="font-semibold">{monthTitle}</h2>
                        </div>
                        <div className="flex gap-1">
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label="ماه قبل"
                                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                            >
                                <ChevronRight className="size-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                                امروز
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label="ماه بعد"
                                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                            >
                                <ChevronLeft className="size-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {calendar.isPending ? (
                            <Skeleton className="h-[42rem]" />
                        ) : calendar.isError ? (
                            <EmptyState
                                icon={CalendarDays}
                                title="دریافت تقویم ناموفق بود"
                                description="API تقویم را بررسی کنید."
                            />
                        ) : (
                            <div className="overflow-hidden rounded-lg border">
                                <div className="grid grid-cols-7 border-b bg-muted/40">
                                    {weekdayNames.map((day) => (
                                        <div key={day} className="p-2 text-center font-medium text-muted-foreground text-xs">
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7">
                                    {days.map((day) => {
                                        const key = dateKey(day);
                                        const items = grouped.get(key) ?? [];
                                        const outside = day.getMonth() !== cursor.getMonth();
                                        const today = key === dateKey(new Date());
                                        return (
                                            <div
                                                key={key}
                                                className={cn(
                                                    "min-h-28 border-s border-b p-2 first:border-s-0",
                                                    outside && "bg-muted/20 text-muted-foreground",
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "inline-grid size-7 place-items-center rounded-full text-xs",
                                                        today && "bg-primary text-primary-foreground",
                                                    )}
                                                >
                                                    {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(
                                                        day.getDate(),
                                                    )}
                                                </span>
                                                <div className="mt-1 space-y-1">
                                                    {items.slice(0, 3).map((item) => (
                                                        <Link
                                                            key={item.id}
                                                            href={`/content/studio/${item.id}` as never}
                                                            className={cn(
                                                                "block truncate rounded-md px-2 py-1 text-[11px] leading-4",
                                                                item.status === "published"
                                                                    ? "bg-success/10 text-success-foreground"
                                                                    : "bg-primary/10 text-primary",
                                                            )}
                                                            title={item.title}
                                                        >
                                                            {item.title}
                                                        </Link>
                                                    ))}
                                                    {items.length > 3 ? (
                                                        <span className="block px-1 text-[10px] text-muted-foreground">
                                                            + {formatNumber(items.length - 3, locale)} مورد
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <SectionTitle title="خلاصه ماه" />
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <span className="flex items-center gap-2 text-sm">
                                    <Clock3 className="size-4 text-primary" />
                                    زمان‌بندی‌شده
                                </span>
                                <strong>{formatNumber(scheduled, locale)}</strong>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <span className="flex items-center gap-2 text-sm">
                                    <FileText className="size-4 text-success-foreground" />
                                    منتشرشده
                                </span>
                                <strong>{formatNumber(published, locale)}</strong>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <SectionTitle title="صف انتشار" description="موارد دارای زمان انتشار در محدوده نمایش‌داده‌شده." />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {rows
                                .filter((row) => row.scheduled_at)
                                .slice(0, 8)
                                .map((row) => (
                                    <Link
                                        key={row.id}
                                        href={`/content/studio/${row.id}` as never}
                                        className="block rounded-lg border p-3 transition-colors hover:bg-muted/40"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <ContentTypeBadge type={row.type} />
                                            <ContentStatusBadge status={row.status} />
                                        </div>
                                        <p className="mt-2 line-clamp-2 font-medium text-sm leading-6">{row.title}</p>
                                        <p className="mt-1 text-muted-foreground text-xs">
                                            {row.scheduled_at ? formatDate(row.scheduled_at, locale) : "—"}
                                        </p>
                                    </Link>
                                ))}
                            {rows.filter((row) => row.scheduled_at).length === 0 ? (
                                <p className="text-muted-foreground text-sm">موردی برای انتشار زمان‌بندی نشده است.</p>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
