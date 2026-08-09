"use client";

import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import type { LucideIcon } from "#/icons";
import { cn } from "#/lib/utils";

import type { ContentAgentKind, ContentStatus, ContentType } from "./types";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
    draft: "پیش‌نویس",
    in_review: "در انتظار بازبینی",
    approved: "تأییدشده",
    scheduled: "زمان‌بندی‌شده",
    published: "منتشرشده",
    archived: "بایگانی‌شده",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
    article: "مقاله",
    news: "خبر",
    guide: "راهنما",
    case_study: "مطالعه موردی",
    landing: "صفحه فرود",
};

export const AGENT_LABELS: Record<ContentAgentKind, string> = {
    trend_scout: "رصد روندها",
    source_intelligence: "اعتبارسنجی منابع",
    strategist: "استراتژی محتوا",
    writer: "نویسنده",
    editor: "ویراستار",
    seo: "بهینه‌سازی جست‌وجو",
    commerce: "اتصال به فروش",
    governance: "حاکمیت و کنترل ادعا",
    publisher: "انتشار",
    refresh: "به‌روزرسانی محتوا",
};

const statusClasses: Record<ContentStatus, string> = {
    draft: "border-border bg-muted text-muted-foreground",
    in_review: "border-warning/25 bg-warning/10 text-warning-foreground",
    approved: "border-info/25 bg-info/10 text-info-foreground",
    scheduled: "border-primary/25 bg-primary/10 text-primary",
    published: "border-success/25 bg-success/10 text-success-foreground",
    archived: "border-border bg-muted/60 text-muted-foreground",
};

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
    return (
        <Badge variant="outline" className={cn("whitespace-nowrap", statusClasses[status])}>
            {CONTENT_STATUS_LABELS[status]}
        </Badge>
    );
}

export function ContentTypeBadge({ type }: { type: ContentType }) {
    return <Badge variant="secondary">{CONTENT_TYPE_LABELS[type]}</Badge>;
}

export function ScoreBar({ value, label }: { value: number; label: string }) {
    const tone = value >= 80 ? "text-success-foreground" : value >= 60 ? "text-warning-foreground" : "text-danger";
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn("font-semibold tabular-nums", tone)}>{value}</span>
            </div>
            <Progress value={value} className="h-1.5" />
        </div>
    );
}

export function ContentStatCard({
    icon: Icon,
    label,
    value,
    hint,
    attention = false,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    hint?: string;
    attention?: boolean;
}) {
    return (
        <Card className={attention ? "border-warning/30" : undefined}>
            <CardContent className="flex items-start gap-3 p-4">
                <span
                    className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        attention ? "bg-warning/10 text-warning-foreground" : "bg-primary/10 text-primary",
                    )}
                >
                    <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-muted-foreground text-xs">{label}</p>
                    <p className="mt-1 font-semibold text-xl tabular-nums">{value}</p>
                    {hint ? <p className="mt-1 text-muted-foreground text-xs">{hint}</p> : null}
                </div>
            </CardContent>
        </Card>
    );
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="font-semibold text-base">{title}</h2>
                {description ? <p className="mt-1 text-muted-foreground text-sm">{description}</p> : null}
            </div>
            {action}
        </div>
    );
}
