"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { AlertTriangle, Bot, Check, Clock3, ExternalLink, FilePenLine, Play, ShieldCheck, Sparkles, X } from "#/icons";
import { formatDate, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";

import { useAgentMutations, useContentAgents, useContentPosts } from "./queries";
import { AGENT_LABELS, ContentStatCard, SectionTitle } from "./ui";
import type { ContentAgentKind } from "./types";

const RUN_STATUS: Record<string, string> = {
    queued: "در صف",
    running: "در حال اجرا",
    completed: "تکمیل‌شده",
    failed: "ناموفق",
    blocked: "مسدود",
    approved: "تأیید انسانی",
    rejected: "ردشده",
};

const agentDescriptions: Record<ContentAgentKind, string> = {
    trend_scout: "رصد روندها و فرصت‌های تازه با تمرکز بر ارتباط واقعی با کسب‌وکار.",
    source_intelligence: "بررسی اعتماد منبع، تضادها، تاریخ و ادعاهای نیازمند راستی‌آزمایی.",
    strategist: "ساخت Brief، نیت جست‌وجو، ساختار و مسیر اتصال محتوا به محصول.",
    writer: "تولید پیش‌نویس ساختاریافته بدون انتشار خودکار.",
    editor: "ویرایش زبانی، خوانایی، انسجام و حذف ادعاهای ضعیف.",
    seo: "بهینه‌سازی عنوان، متا، ساختار، لینک داخلی و داده ساختاریافته.",
    commerce: "پیشنهاد محصول مرتبط، CTA و فرصت‌های تبدیل بدون تبلیغ اجباری.",
    governance: "کنترل موضوعات ممنوع، ادعا، منبع، نقش‌ها و الزام بازبینی انسانی.",
    publisher: "آماده‌سازی چک‌لیست انتشار؛ انتشار مستقیم برای Agent غیرفعال است.",
    refresh: "تشخیص فرسودگی محتوا و پیشنهاد به‌روزرسانی مبتنی بر تغییر واقعی.",
};

export function ContentAgentsPage() {
    const locale = useLocale() as Locale;
    const [kind, setKind] = useState<ContentAgentKind>("strategist");
    const [instruction, setInstruction] = useState("");
    const [postId, setPostId] = useState("none");
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);

    const runs = useContentAgents({ page, limit: 20, status: status === "all" ? undefined : status });
    const posts = useContentPosts({ page: 1, limit: 50, sort: "updated_desc" });
    const mutations = useAgentMutations();
    const rows = runs.data?.data ?? [];
    const metrics = useMemo(
        () => ({
            active: rows.filter((row) => row.status === "queued" || row.status === "running").length,
            review: rows.filter((row) => row.status === "completed" && row.human_review_required).length,
            approved: rows.filter((row) => row.status === "approved").length,
            failed: rows.filter((row) => row.status === "failed" || row.status === "blocked").length,
        }),
        [rows],
    );

    async function runAgent() {
        if (instruction.trim().length < 3) return;
        try {
            await mutations.run.mutateAsync({
                agent_kind: kind,
                instruction: instruction.trim(),
                post_id: postId === "none" ? null : Number(postId),
                use_web_search: useWebSearch,
            });
            setInstruction("");
            toast.add({
                title: "اجرای Agent وارد صف شد",
                description: "خروجی تا تأیید انسانی منتشر نخواهد شد.",
                data: { tone: "success" },
            });
        } catch {
            toast.add({
                title: "اجرای Agent ناموفق بود",
                description: "تنظیمات مدل و سرویس صف را بررسی کنید.",
                data: { tone: "error" },
            });
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="مرکز فرمان Agent"
                subtitle="اجرای کنترل‌شده Agentهای محتوا با شواهد، ثبت تاریخچه و بازبینی انسانی اجباری."
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ContentStatCard icon={Play} label="در حال اجرا" value={formatNumber(metrics.active, locale)} />
                <ContentStatCard
                    icon={Clock3}
                    label="در انتظار بازبینی"
                    value={formatNumber(metrics.review, locale)}
                    attention={metrics.review > 0}
                />
                <ContentStatCard icon={Check} label="تأییدشده در این صفحه" value={formatNumber(metrics.approved, locale)} />
                <ContentStatCard
                    icon={AlertTriangle}
                    label="خطا یا انسداد"
                    value={formatNumber(metrics.failed, locale)}
                    attention={metrics.failed > 0}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle className="text-base">اجرای جدید</CardTitle>
                        <CardDescription>Agent فقط پیشنهاد و پیش‌نویس می‌سازد؛ تصمیم نهایی با مدیر محتواست.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>نوع Agent</Label>
                            <Select value={kind} onValueChange={(value) => setKind(value as ContentAgentKind)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(AGENT_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-muted-foreground text-xs leading-5">{agentDescriptions[kind]}</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>نوشته مرتبط</Label>
                            <Select
                                value={postId}
                                onValueChange={(value) => {
                                    if (typeof value === "string") setPostId(value);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="بدون نوشته" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">بدون نوشته مشخص</SelectItem>
                                    {posts.data?.data.map((post) => (
                                        <SelectItem key={post.id} value={String(post.id)}>
                                            {post.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="agent-instruction">دستور دقیق</Label>
                            <Textarea
                                id="agent-instruction"
                                value={instruction}
                                onChange={(event) => setInstruction(event.target.value)}
                                rows={8}
                                placeholder="هدف، مخاطب، محدودیت‌ها، داده‌های لازم و خروجی مورد انتظار را بنویسید..."
                            />
                        </div>
                        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                            <span>
                                <span className="block font-medium text-sm">جست‌وجوی وب</span>
                                <span className="mt-1 block text-muted-foreground text-xs leading-5">
                                    فقط برای Agentهای نیازمند اطلاعات تازه و با ثبت شواهد.
                                </span>
                            </span>
                            <Switch checked={useWebSearch} onCheckedChange={(checked) => setUseWebSearch(checked === true)} />
                        </div>
                        <Button
                            className="w-full"
                            disabled={instruction.trim().length < 3 || mutations.run.isPending}
                            onClick={runAgent}
                        >
                            <Sparkles className="size-4" />
                            اجرای کنترل‌شده
                        </Button>
                        <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-muted-foreground text-xs leading-5">
                            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                            <span>
                                انتشار خودکار Agent غیرفعال است. خروجی‌ها در تاریخچه ثبت و برای تأیید یا رد نمایش داده می‌شوند.
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="gap-4">
                        <SectionTitle
                            title="تاریخچه اجراها"
                            description="ورودی، خروجی، شواهد و تصمیم انسانی هر اجرا قابل رهگیری است."
                        />
                        <Select
                            value={status}
                            onValueChange={(value) => {
                                if (typeof value !== "string") return;
                                setStatus(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="max-w-52">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                                {Object.entries(RUN_STATUS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {runs.isPending ? (
                            ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"].map((key) => (
                                <Skeleton key={key} className="h-36" />
                            ))
                        ) : runs.isError ? (
                            <EmptyState
                                icon={AlertTriangle}
                                title="دریافت اجراها ناموفق بود"
                                description="اتصال صف و API را بررسی کنید."
                            />
                        ) : rows.length === 0 ? (
                            <EmptyState
                                icon={Bot}
                                title="اجرایی ثبت نشده است"
                                description="یک Agent را با دستور مشخص اجرا کنید."
                            />
                        ) : (
                            rows.map((run) => {
                                const output = run.output ?? {};
                                const draft =
                                    output.draft && typeof output.draft === "object"
                                        ? (output.draft as Record<string, unknown>)
                                        : null;
                                const title = draft && typeof draft.title === "string" ? draft.title : null;
                                const summary =
                                    typeof output.summary === "string"
                                        ? output.summary
                                        : draft && typeof draft.excerpt === "string"
                                          ? draft.excerpt
                                          : null;
                                return (
                                    <article key={run.id} className="rounded-xl border bg-card p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="secondary">{AGENT_LABELS[run.agent_kind]}</Badge>
                                                    <Badge variant="outline">{RUN_STATUS[run.status] ?? run.status}</Badge>
                                                    {run.human_review_required ? (
                                                        <Badge variant="outline" className="border-warning/30 bg-warning/10">
                                                            بازبینی انسانی
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <p className="mt-2 font-medium text-sm">
                                                    {title || String(run.input.instruction ?? "اجرای Agent")}
                                                </p>
                                                <p className="mt-1 text-muted-foreground text-xs">
                                                    {formatDate(run.created_at, locale)}
                                                </p>
                                            </div>
                                            {run.applied_post_id || run.post_id ? (
                                                <Button size="sm" variant="outline" asChild>
                                                    <Link href={`/content/studio/${run.applied_post_id ?? run.post_id}` as never}>
                                                        بازکردن نوشته
                                                    </Link>
                                                </Button>
                                            ) : null}
                                        </div>
                                        {summary ? (
                                            <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm leading-6">{summary}</p>
                                        ) : null}
                                        {run.review_note ? (
                                            <p className="mt-3 rounded-lg bg-muted/50 p-3 text-muted-foreground text-xs">
                                                یادداشت بازبینی: {run.review_note}
                                            </p>
                                        ) : null}
                                        {run.error_message ? (
                                            <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger text-sm">
                                                {run.error_message}
                                            </p>
                                        ) : null}
                                        {run.evidence.length > 0 ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {run.evidence.slice(0, 5).map((evidence) => (
                                                    <a
                                                        key={evidence.url}
                                                        href={evidence.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                                                    >
                                                        <ExternalLink className="size-3" />
                                                        {evidence.title || "منبع"}
                                                    </a>
                                                ))}
                                            </div>
                                        ) : null}
                                        {run.status === "completed" && run.human_review_required ? (
                                            <div className="mt-4 flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={mutations.review.isPending}
                                                    onClick={() =>
                                                        mutations.review.mutate({
                                                            id: run.id,
                                                            decision: "rejected",
                                                            note: "نیازمند اصلاح",
                                                        })
                                                    }
                                                >
                                                    <X className="size-4" />
                                                    رد خروجی
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    disabled={mutations.review.isPending}
                                                    onClick={() =>
                                                        mutations.review.mutate({
                                                            id: run.id,
                                                            decision: "approved",
                                                            note: "بازبینی و تأیید انسانی",
                                                        })
                                                    }
                                                >
                                                    <Check className="size-4" />
                                                    تأیید خروجی
                                                </Button>
                                            </div>
                                        ) : null}
                                        {run.status === "approved" && draft && !run.applied_at ? (
                                            <div className="mt-4 flex justify-end">
                                                <Button
                                                    size="sm"
                                                    disabled={mutations.apply.isPending}
                                                    onClick={async () => {
                                                        try {
                                                            const result = await mutations.apply.mutateAsync(run.id);
                                                            toast.add({
                                                                title: "خروجی در استودیو اعمال شد",
                                                                description: String(
                                                                    result.post.title ?? "پیش‌نویس آماده ویرایش است.",
                                                                ),
                                                                data: { tone: "success" },
                                                            });
                                                        } catch {
                                                            toast.add({
                                                                title: "اعمال خروجی ناموفق بود",
                                                                description: "وضعیت اجرا یا نسخه نوشته را دوباره بررسی کنید.",
                                                                data: { tone: "error" },
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <FilePenLine className="size-4" />
                                                    اعمال در استودیو
                                                </Button>
                                            </div>
                                        ) : null}
                                        {run.applied_at ? (
                                            <p className="mt-4 text-success text-xs">خروجی این اجرا در استودیو اعمال شده است.</p>
                                        ) : null}
                                    </article>
                                );
                            })
                        )}
                        {runs.data && runs.data.meta.last_page > 1 ? (
                            <div className="flex items-center justify-between pt-2 text-sm">
                                <span className="text-muted-foreground">
                                    صفحه {formatNumber(page, locale)} از {formatNumber(runs.data.meta.last_page, locale)}
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={page <= 1}
                                        onClick={() => setPage((value) => value - 1)}
                                    >
                                        قبلی
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={page >= runs.data.meta.last_page}
                                        onClick={() => setPage((value) => value + 1)}
                                    >
                                        بعدی
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
