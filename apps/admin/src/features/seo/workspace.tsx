"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Progress } from "#/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import {
    Activity,
    AlertTriangle,
    Banknote,
    BarChart3,
    Bot,
    Boxes,
    Braces,
    Bug,
    CheckCircle2,
    CircleGauge,
    Code2,
    Eye,
    FileSearch,
    FileText,
    Globe2,
    ImageIcon,
    ListChecks,
    Loader2,
    MousePointerClick,
    Network,
    PencilLine,
    Plus,
    RefreshCcw,
    RotateCcw,
    Save,
    Search,
    Settings2,
    ShieldCheck,
    ShoppingCart,
    Sitemap,
    Sparkles,
    Tags,
    Target,
    Trash2,
    TrendingDown,
    TrendingUp,
    TriangleAlert,
} from "#/icons";
import { cn } from "#/lib/utils";

import {
    useSeoAuditMutation,
    useSeoCompetitors,
    useSeoEntities,
    useSeoEntity,
    useSeoIndexNowMutation,
    useSeoIntegrationMutation,
    useSeoIntegrations,
    useSeoInternalLinks,
    useSeoIssueStatusMutation,
    useSeoIssues,
    useSeoKeywordMutations,
    useSeoKeywords,
    useSeoOverview,
    useSeoProfileMutation,
    useSeoRedirects,
    useSeoReports,
    useSeoResourceMutations,
    useSeoRobotsPreview,
    useSeoSettings,
    useSeoSettingsMutation,
    useSeoSitemapPreview,
} from "./queries";
import type {
    SeoCompetitor,
    SeoEntity,
    SeoEntityDetail,
    SeoEntityKind,
    SeoIntegration,
    SeoInternalLink,
    SeoIssue,
    SeoKeyword,
    SeoProfile,
    SeoRedirect,
    SeoSettings,
    SeoSeverity,
} from "./types";

export type SeoWorkspaceMode =
    | "overview"
    | "categories-links"
    | "keywords-content"
    | "technical-health"
    | "schema-preview"
    | "competitors-serp"
    | "images-alt"
    | "products"
    | "rank-tracking"
    | "content-refresh"
    | "control-tower"
    | "crawl-monitoring"
    | "live-editor"
    | "market-radar"
    | "reports"
    | "settings";

interface ModeConfig {
    title: string;
    description: string;
    icon: typeof Activity;
    entityKind?: SeoEntityKind;
}

const modeConfig: Record<SeoWorkspaceMode, ModeConfig> = {
    overview: {
        title: "نمای کلی سئو",
        description: "سلامت فنی، محتوایی، داده محصول، اسکیما و فرصت‌های عملیاتی کل فروشگاه",
        icon: CircleGauge,
    },
    "categories-links": {
        title: "دسته‌بندی‌ها و لینک‌سازی",
        description: "ساختار دسته، برند، ویژگی، صفحات یتیم و پیشنهادهای لینک داخلی",
        icon: Network,
        entityKind: "category",
    },
    "keywords-content": {
        title: "کلمات کلیدی و محتوا",
        description: "هدف‌گذاری Query، اتصال به نوشته‌ها و محصولات و کنترل پوشش محتوایی",
        icon: Target,
        entityKind: "content_post",
    },
    "technical-health": {
        title: "سلامت فنی و کرال",
        description: "خطاهای Indexability، Canonical، URL، دسترسی ربات‌ها و کیفیت فنی صفحات",
        icon: ShieldCheck,
    },
    "schema-preview": {
        title: "اسکیما و پیش‌نمایش",
        description: "بازبینی Structured Data واقعی محصولات، نوشته‌ها، دسته‌ها، برندها و رسانه",
        icon: Braces,
        entityKind: "product",
    },
    "competitors-serp": {
        title: "رقبا و SERP",
        description: "رقبای ثبت‌شده، کلمات هدف و داده‌های قابل ورود از سرویس‌های رسمی",
        icon: BarChart3,
    },
    "images-alt": {
        title: "تصاویر و ALT",
        description: "کیفیت متن جایگزین، ابعاد، فرمت و آمادگی تصاویر برای جست‌وجوی تصویری",
        icon: ImageIcon,
        entityKind: "media",
    },
    products: {
        title: "سئوی محصولات",
        description: "امتیاز محصول، عنوان، متا، URL، برند، دسته، تصویر، Offer و آمادگی Feed",
        icon: Boxes,
        entityKind: "product",
    },
    "rank-tracking": {
        title: "رهگیری رتبه",
        description: "ثبت و مقایسه جایگاه کلمات در موتور، کشور، شهر و دستگاه بدون داده ساختگی",
        icon: TrendingUp,
    },
    "content-refresh": {
        title: "به‌روزرسانی محتوا",
        description: "شناسایی نوشته‌های قدیمی، کم‌امتیاز یا نیازمند بازبینی و اتصال دوباره به محصول",
        icon: RotateCcw,
        entityKind: "content_post",
    },
    "control-tower": {
        title: "برج کنترل سئو",
        description: "صف اول اقدامات، اولویت‌بندی خطاها و اجرای ممیزی کنترل‌شده با گزارش شفاف",
        icon: Sparkles,
    },
    "crawl-monitoring": {
        title: "پایش کرال",
        description: "ممیزی ساختاری موجودیت‌ها و وضعیت دسترسی، ایندکس، Sitemap و ربات‌ها",
        icon: Bug,
    },
    "live-editor": {
        title: "ویرایشگر زنده سئو",
        description: "ویرایش Profile سئو بدون دست‌زدن به داده اصلی محصول یا نوشته و با کنترل نسخه",
        icon: PencilLine,
        entityKind: "product",
    },
    "market-radar": {
        title: "رادار بازار و محتوا",
        description: "ترکیب رقبا، کلمات کلیدی و سیگنال‌های محتوایی برای ساخت صف اقدام واقعی",
        icon: Globe2,
    },
    reports: {
        title: "گزارش‌های سئو",
        description: "امتیاز هر نوع موجودیت، پرتکرارترین خطاها، تاریخچه اقدامات و وضعیت تازگی",
        icon: FileText,
    },
    settings: {
        title: "تنظیمات و ابزارهای فنی",
        description: "K20/K21، robots.txt، Sitemap، Schema، IndexNow و اتصال سرویس‌های رسمی",
        icon: Settings2,
    },
};

const kindLabels: Record<SeoEntityKind, string> = {
    product: "محصول",
    category: "دسته‌بندی",
    brand: "برند",
    attribute: "ویژگی",
    content_post: "نوشته",
    media: "رسانه",
    page: "صفحه",
};

const severityLabels: Record<SeoSeverity, string> = {
    critical: "بحرانی",
    warning: "نیازمند بهبود",
    info: "پیشنهاد",
};

const severityClasses: Record<SeoSeverity, string> = {
    critical: "border-danger/25 bg-danger/10 text-danger",
    warning: "border-warning/25 bg-warning/10 text-warning-foreground",
    info: "border-info/25 bg-info/10 text-info-foreground",
};

function formatNumber(value: number | null | undefined) {
    return Number(value ?? 0).toLocaleString("fa-IR");
}

function scoreTone(value: number) {
    if (value >= 85) return "text-success-foreground";
    if (value >= 60) return "text-warning-foreground";
    return "text-danger";
}

function PageHeader({ mode, onRefresh, refreshing }: { mode: SeoWorkspaceMode; onRefresh: () => void; refreshing: boolean }) {
    const config = modeConfig[mode];
    const Icon = config.icon;
    return (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                    <h1 className="font-semibold text-2xl tracking-tight">{config.title}</h1>
                    <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">{config.description}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-success/25 bg-success/10 text-success-foreground">
                    <span className="me-2 size-1.5 rounded-full bg-success" />
                    داده واقعی کالیبرا
                </Badge>
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                    <RefreshCcw className={cn("size-4", refreshing && "animate-spin")} aria-hidden="true" />
                    تازه‌سازی
                </Button>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = "default",
}: {
    label: string;
    value: string;
    hint?: string;
    icon: typeof Activity;
    tone?: "default" | "success" | "warning" | "danger";
}) {
    const classes = {
        default: "bg-primary/10 text-primary",
        success: "bg-success/10 text-success-foreground",
        warning: "bg-warning/10 text-warning-foreground",
        danger: "bg-danger/10 text-danger",
    }[tone];
    return (
        <Card>
            <CardContent className="flex items-start gap-3 p-4">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", classes)}>
                    <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-muted-foreground text-xs">{label}</p>
                    <p className="mt-1 font-semibold text-xl tabular-nums">{value}</p>
                    {hint ? <p className="mt-1 text-muted-foreground text-xs">{hint}</p> : null}
                </div>
            </CardContent>
        </Card>
    );
}

function OverviewSection() {
    const overview = useSeoOverview();
    if (overview.isLoading) return <LoadingCards />;
    if (overview.isError || !overview.data)
        return <ErrorCard title="داده داشبورد دریافت نشد" onRetry={() => overview.refetch()} />;
    const data = overview.data.data;
    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="میانگین سلامت سئو"
                    value={`${formatNumber(data.health.average_score)} از ۱۰۰`}
                    hint={`${formatNumber(data.health.healthy)} موجودیت سالم`}
                    icon={CircleGauge}
                    tone={data.health.average_score >= 85 ? "success" : "warning"}
                />
                <StatCard
                    label="خطاهای باز"
                    value={formatNumber(data.issues.open)}
                    hint={`${formatNumber(data.issues.critical)} مورد بحرانی`}
                    icon={TriangleAlert}
                    tone={data.issues.critical > 0 ? "danger" : "success"}
                />
                <StatCard
                    label="موجودیت‌های تحلیل‌شده"
                    value={formatNumber(data.entities.analyzed)}
                    hint={`${formatNumber(data.entities.unanalyzed)} مورد هنوز ممیزی نشده`}
                    icon={ListChecks}
                />
                <StatCard
                    label="کلمات رهگیری‌شده"
                    value={formatNumber(data.keywords.total)}
                    hint={`${formatNumber(data.keywords.top_ten)} کلمه در ده نتیجه اول`}
                    icon={TrendingUp}
                    tone="success"
                />
            </div>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">اثر واقعی نوشته‌ها بر فروش</CardTitle>
                    <CardDescription>
                        این شاخص‌ها مستقیماً از شمارنده‌های Content OS و انتساب سفارش خوانده می‌شوند و مقدار فرضی ندارند.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="بازدید نوشته‌ها" value={formatNumber(data.content_impact.views)} icon={Eye} />
                    <StatCard
                        label="کلیک محصول از نوشته"
                        value={formatNumber(data.content_impact.product_clicks)}
                        icon={MousePointerClick}
                    />
                    <StatCard
                        label="سفارش منتسب"
                        value={formatNumber(data.content_impact.assisted_orders)}
                        icon={ShoppingCart}
                        tone={data.content_impact.assisted_orders > 0 ? "success" : "default"}
                    />
                    <StatCard
                        label="درآمد منتسب؛ واحد پایه"
                        value={formatNumber(data.content_impact.assisted_revenue_minor)}
                        icon={Banknote}
                        tone={data.content_impact.assisted_revenue_minor > 0 ? "success" : "default"}
                    />
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">پوشش داده سئو</CardTitle>
                    <CardDescription>
                        محصولات، نوشته‌ها و رسانه‌ها مستقیماً از پایگاه داده Tenant فعال خوانده می‌شوند.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                    <Coverage label="محصولات" value={data.entities.products} analyzed={data.entities.analyzed} icon={Boxes} />
                    <Coverage
                        label="نوشته‌ها"
                        value={data.entities.content_posts}
                        analyzed={data.entities.analyzed}
                        icon={FileText}
                    />
                    <Coverage label="رسانه‌ها" value={data.entities.media} analyzed={data.entities.analyzed} icon={ImageIcon} />
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">اتصال سرویس‌ها</CardTitle>
                    <CardDescription>هیچ داده‌ای تا پیش از تنظیم Credential محیطی به‌عنوان متصل نمایش داده نمی‌شود.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {data.integrations.map((integration) => (
                        <div key={integration.provider} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                                <p className="font-medium text-sm">{providerLabel(integration.provider)}</p>
                                <p className="mt-1 text-muted-foreground text-xs">
                                    {integration.last_synced_at
                                        ? `آخرین همگام‌سازی: ${new Date(integration.last_synced_at).toLocaleString("fa-IR")}`
                                        : "هنوز همگام‌سازی نشده"}
                                </p>
                            </div>
                            <ConnectionBadge status={integration.status} />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

function Coverage({
    label,
    value,
    analyzed,
    icon: Icon,
}: {
    label: string;
    value: number;
    analyzed: number;
    icon: typeof Activity;
}) {
    const ratio = value <= 0 ? 0 : Math.min(100, Math.round((analyzed / value) * 100));
    return (
        <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium text-sm">
                    <Icon className="size-4 text-primary" />
                    {label}
                </span>
                <span className="font-semibold text-sm tabular-nums">{formatNumber(value)}</span>
            </div>
            <Progress value={ratio} className="mt-3 h-1.5" />
            <p className="mt-2 text-muted-foreground text-xs">پوشش ممیزی محاسبه‌شده: {formatNumber(ratio)}٪</p>
        </div>
    );
}

function EntitiesSection({
    kind,
    editor = false,
    schema = false,
    initialId = null,
}: {
    kind?: SeoEntityKind;
    editor?: boolean;
    schema?: boolean;
    initialId?: number | null;
}) {
    const [q, setQ] = useState("");
    const [selectedKind, setSelectedKind] = useState<SeoEntityKind>(kind ?? "product");
    const [selected, setSelected] = useState<SeoEntity | null>(null);
    const entities = useSeoEntities({ kind: selectedKind, q: q || undefined, limit: 50, sort: "score_asc" });
    const audit = useSeoAuditMutation();
    useEffect(() => {
        if (!initialId || selected?.id === initialId) return;
        const match = entities.data?.data.find((entity) => entity.id === initialId);
        if (match) setSelected(match);
    }, [entities.data?.data, initialId, selected?.id]);
    return (
        <div className={cn("grid gap-4", (editor || schema) && "2xl:grid-cols-[minmax(0,1fr)_460px]")}>
            <Card className="min-w-0">
                <CardHeader className="gap-3 pb-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <CardTitle className="text-base">موجودیت‌های سئو</CardTitle>
                            <CardDescription>امتیاز از داده واقعی صفحه و Profile مستقل سئو محاسبه می‌شود.</CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => audit.all.mutate({ kinds: [selectedKind] })}
                            disabled={audit.all.isPending}
                        >
                            {audit.all.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            ممیزی همه
                        </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <Select
                            value={selectedKind}
                            onValueChange={(value) => {
                                setSelectedKind(value as SeoEntityKind);
                                setSelected(null);
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(kindLabels)
                                    .filter(([key]) => key !== "page")
                                    .map(([key, value]) => (
                                        <SelectItem key={key} value={key}>
                                            {value}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                        <div className="relative">
                            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                                placeholder="جست‌وجوی عنوان، نامک یا SKU"
                                className="ps-9"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {entities.isLoading ? (
                        <TableSkeleton />
                    ) : entities.isError ? (
                        <div className="p-4">
                            <ErrorCard title="فهرست موجودیت‌ها دریافت نشد" onRetry={() => entities.refetch()} />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>عنوان</TableHead>
                                        <TableHead>نوع</TableHead>
                                        <TableHead>وضعیت</TableHead>
                                        <TableHead>امتیاز</TableHead>
                                        <TableHead>خطا</TableHead>
                                        <TableHead className="w-20">عملیات</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(entities.data?.data ?? []).map((entity) => (
                                        <TableRow
                                            key={entity.key}
                                            data-state={selected?.key === entity.key ? "selected" : undefined}
                                        >
                                            <TableCell>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelected(entity)}
                                                    className="max-w-[340px] text-start"
                                                >
                                                    <span className="block truncate font-medium text-sm">
                                                        {entity.title || "بدون عنوان"}
                                                    </span>
                                                    <span className="mt-1 block truncate text-muted-foreground text-xs">
                                                        {entity.slug || entity.key}
                                                    </span>
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{kindLabels[entity.kind]}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{entity.status || "—"}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className={cn("font-semibold tabular-nums", scoreTone(entity.score.total))}>
                                                    {formatNumber(entity.score.total)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-muted-foreground text-sm">
                                                    {formatNumber(entity.score.issues.length)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8"
                                                    onClick={() => audit.entity.mutate({ kind: entity.kind, id: entity.id })}
                                                    aria-label="ممیزی موجودیت"
                                                >
                                                    <RefreshCcw
                                                        className={cn("size-4", audit.entity.isPending && "animate-spin")}
                                                    />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {entities.data?.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                موردی مطابق فیلتر پیدا نشد.
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {editor || schema ? <EntityInspector selected={selected} schemaOnly={schema && !editor} /> : null}
        </div>
    );
}

function EntityInspector({ selected, schemaOnly }: { selected: SeoEntity | null; schemaOnly: boolean }) {
    const detail = useSeoEntity(selected?.kind ?? null, selected?.id ?? null);
    if (!selected)
        return (
            <Card className="min-h-[460px]">
                <CardContent className="grid h-full min-h-[460px] place-items-center p-6 text-center text-muted-foreground">
                    <div>
                        <FileSearch className="mx-auto size-10 opacity-50" />
                        <p className="mt-3 text-sm">برای مشاهده جزئیات، یک ردیف را انتخاب کنید.</p>
                    </div>
                </CardContent>
            </Card>
        );
    if (detail.isLoading)
        return (
            <Card>
                <CardContent className="space-y-3 p-5">
                    <Skeleton className="h-7 w-2/3" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-40 w-full" />
                </CardContent>
            </Card>
        );
    if (!detail.data) return <ErrorCard title="جزئیات موجودیت دریافت نشد" onRetry={() => detail.refetch()} />;
    if (schemaOnly) return <SchemaInspector entity={detail.data.data} />;
    return <ProfileEditor entity={detail.data.data} />;
}

function SchemaInspector({ entity }: { entity: SeoEntityDetail }) {
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="text-base">پیش‌نمایش JSON-LD</CardTitle>
                <CardDescription>{entity.title || entity.key}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <ScoreMini label="فنی" value={entity.score.technical} />
                    <ScoreMini label="اسکیما" value={entity.score.schema} />
                </div>
                <pre
                    dir="ltr"
                    className="max-h-[520px] overflow-auto rounded-xl border bg-muted/40 p-4 text-left text-xs leading-6"
                >
                    {JSON.stringify(entity.schema, null, 2)}
                </pre>
                {!entity.schema ? (
                    <p className="text-danger text-sm">
                        برای این موجودیت اسکیما تولید نشده است؛ robots یا داده‌های ضروری را بررسی کنید.
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}

function ProfileEditor({ entity }: { entity: SeoEntityDetail }) {
    const mutation = useSeoProfileMutation(entity.kind, entity.id);
    const [form, setForm] = useState<SeoProfile>({});
    useEffect(() => setForm(entity.profile ?? {}), [entity]);
    const update = <K extends keyof SeoProfile>(key: K, value: SeoProfile[K]) =>
        setForm((current) => ({ ...current, [key]: value }));
    return (
        <Card className="min-w-0">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-base">ویرایش Profile سئو</CardTitle>
                        <CardDescription className="mt-1 line-clamp-2">{entity.title || entity.key}</CardDescription>
                    </div>
                    <Badge variant="outline" className={scoreTone(entity.score.total)}>
                        {formatNumber(entity.score.total)} / ۱۰۰
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <ScoreMini label="محتوا" value={entity.score.content} />
                    <ScoreMini label="رسانه" value={entity.score.media} />
                    <ScoreMini label="فنی" value={entity.score.technical} />
                    <ScoreMini label="تجارت" value={entity.score.commerce} />
                </div>
                <Field
                    label="عنوان سئو"
                    value={form.metaTitle ?? ""}
                    onChange={(value) => update("metaTitle", value || null)}
                    maxLength={255}
                />
                <div className="space-y-1.5">
                    <Label>توضیحات متا</Label>
                    <Textarea
                        value={form.metaDescription ?? ""}
                        onChange={(event) => update("metaDescription", event.target.value || null)}
                        rows={4}
                        maxLength={500}
                    />
                    <p className="text-end text-muted-foreground text-xs">
                        {formatNumber((form.metaDescription ?? "").length)} نویسه
                    </p>
                </div>
                <Field
                    label="کلمه کلیدی اصلی"
                    value={form.focusKeyword ?? ""}
                    onChange={(value) => update("focusKeyword", value || null)}
                    maxLength={180}
                />
                <Field
                    label="Canonical"
                    value={form.canonicalUrl ?? ""}
                    onChange={(value) => update("canonicalUrl", value || null)}
                    dir="ltr"
                    maxLength={2000}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>پروفایل موتور</Label>
                        <Select
                            value={form.engineProfile ?? "k20"}
                            onValueChange={(value) => update("engineProfile", value as "k20" | "k21")}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="k20">K20 — استاندارد</SelectItem>
                                <SelectItem value="k21">K21 — پیشرفته</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>نوع اسکیما</Label>
                        <Input
                            value={form.schemaType ?? ""}
                            onChange={(event) => update("schemaType", event.target.value || null)}
                            placeholder="Product / BlogPosting"
                        />
                    </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                    <ToggleRow
                        label="اجازه ایندکس"
                        checked={form.robotsIndex !== false}
                        onCheckedChange={(value) => update("robotsIndex", value)}
                    />
                    <ToggleRow
                        label="دنبال‌کردن لینک‌ها"
                        checked={form.robotsFollow !== false}
                        onCheckedChange={(value) => update("robotsFollow", value)}
                    />
                </div>
                <Button
                    className="w-full"
                    onClick={() => mutation.mutate({ ...form, expected_version: entity.profile.version })}
                    disabled={mutation.isPending}
                >
                    {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    ذخیره و ممیزی دوباره
                </Button>
                {mutation.isSuccess ? (
                    <p className="text-center text-sm text-success-foreground">تغییرات با موفقیت ذخیره شد.</p>
                ) : null}
                {mutation.isError ? (
                    <p className="text-center text-danger text-sm">ذخیره انجام نشد. مقدارها و نسخه را بررسی کنید.</p>
                ) : null}
                <div className="space-y-2 border-t pt-4">
                    <p className="font-medium text-sm">خطاهای فعال</p>
                    {entity.issues.slice(0, 6).map((issue) => (
                        <IssueCompact key={issue.id} issue={issue} />
                    ))}
                    {entity.issues.length === 0 ? (
                        <p className="text-muted-foreground text-sm">خطای فعالی ثبت نشده است.</p>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
}

function Field({
    label,
    value,
    onChange,
    dir,
    maxLength,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    dir?: "ltr" | "rtl";
    maxLength?: number;
}) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <Input dir={dir} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} />
        </div>
    );
}

function ToggleRow({
    label,
    checked,
    onCheckedChange,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between rounded-lg border p-3">
            <Label className="cursor-pointer text-sm">{label}</Label>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

function ScoreMini({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border bg-muted/20 p-2.5">
            <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn("font-semibold", scoreTone(value))}>{formatNumber(value)}</span>
            </div>
            <Progress value={value} className="mt-2 h-1" />
        </div>
    );
}

function IssuesSection() {
    const [severity, setSeverity] = useState<string>("all");
    const [q, setQ] = useState("");
    const issues = useSeoIssues({ severity: severity === "all" ? undefined : severity, q: q || undefined, limit: 100 });
    const update = useSeoIssueStatusMutation();
    return (
        <Card>
            <CardHeader className="gap-3 pb-3">
                <div>
                    <CardTitle className="text-base">صف خطاها و پیشنهادها</CardTitle>
                    <CardDescription>هر وضعیت با تاریخچه و اقدام اپراتور ثبت می‌شود.</CardDescription>
                </div>
                <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <Select value={severity} onValueChange={(value) => setSeverity(String(value))}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">همه شدت‌ها</SelectItem>
                            <SelectItem value="critical">بحرانی</SelectItem>
                            <SelectItem value="warning">نیازمند بهبود</SelectItem>
                            <SelectItem value="info">پیشنهاد</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="relative">
                        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={q}
                            onChange={(event) => setQ(event.target.value)}
                            placeholder="جست‌وجوی خطا یا Rule"
                            className="ps-9"
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {issues.isLoading ? (
                    <TableSkeleton />
                ) : issues.isError ? (
                    <div className="p-4">
                        <ErrorCard title="خطاها دریافت نشد" onRetry={() => issues.refetch()} />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>خطا</TableHead>
                                    <TableHead>موجودیت</TableHead>
                                    <TableHead>شدت</TableHead>
                                    <TableHead>وضعیت</TableHead>
                                    <TableHead>اقدام</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(issues.data?.data ?? []).map((issue) => (
                                    <TableRow key={issue.id}>
                                        <TableCell className="max-w-[420px]">
                                            <p className="font-medium text-sm">{issue.title}</p>
                                            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">{issue.description}</p>
                                            <code className="mt-1 inline-block text-[10px] text-muted-foreground">
                                                {issue.rule_code}
                                            </code>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{kindLabels[issue.entity_kind]}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={severityClasses[issue.severity]}>
                                                {severityLabels[issue.severity]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{issueStatusLabel(issue.status)}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => update.mutate({ id: issue.id, status: "resolved" })}
                                                    disabled={update.isPending}
                                                >
                                                    رفع شد
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => update.mutate({ id: issue.id, status: "ignored" })}
                                                    disabled={update.isPending}
                                                >
                                                    نادیده‌گرفتن
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {issues.data?.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                            خطایی مطابق فیلتر وجود ندارد.
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function IssueCompact({ issue }: { issue: SeoIssue }) {
    return (
        <div className="rounded-lg border p-2.5">
            <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-xs">{issue.title}</p>
                <Badge variant="outline" className={cn("shrink-0 text-[10px]", severityClasses[issue.severity])}>
                    {severityLabels[issue.severity]}
                </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">{issue.description}</p>
        </div>
    );
}

function KeywordsSection() {
    const [phrase, setPhrase] = useState("");
    const keywords = useSeoKeywords({ limit: 100 });
    const mutations = useSeoKeywordMutations();
    const submit = () => {
        if (!phrase.trim()) return;
        mutations.create.mutate(
            { phrase: phrase.trim(), locale: "fa", device: "desktop", source: "manual" },
            { onSuccess: () => setPhrase("") },
        );
    };
    return (
        <Card>
            <CardHeader className="gap-3 pb-3">
                <div>
                    <CardTitle className="text-base">کلمات کلیدی هدف</CardTitle>
                    <CardDescription>رتبه فقط از ورودی دستی یا اتصال رسمی ذخیره می‌شود؛ مقدار فرضی ساخته نمی‌شود.</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Input
                        value={phrase}
                        onChange={(event) => setPhrase(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") submit();
                        }}
                        placeholder="افزودن عبارت جدید"
                    />
                    <Button onClick={submit} disabled={mutations.create.isPending || !phrase.trim()}>
                        <Plus className="size-4" />
                        افزودن
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {keywords.isLoading ? (
                    <TableSkeleton />
                ) : keywords.isError ? (
                    <div className="p-4">
                        <ErrorCard title="کلمات کلیدی دریافت نشد" onRetry={() => keywords.refetch()} />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>عبارت</TableHead>
                                    <TableHead>هدف</TableHead>
                                    <TableHead>رتبه فعلی</TableHead>
                                    <TableHead>تغییر</TableHead>
                                    <TableHead>حجم</TableHead>
                                    <TableHead className="w-14" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(keywords.data?.data ?? []).map((row) => (
                                    <KeywordRow
                                        key={row.id}
                                        row={row}
                                        onUpdate={(input) => mutations.update.mutate({ id: row.id, ...input })}
                                        onDelete={() => mutations.remove.mutate(row.id)}
                                    />
                                ))}
                                {keywords.data?.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                            هنوز کلمه‌ای ثبت نشده است.
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function KeywordRow({
    row,
    onUpdate,
    onDelete,
}: {
    row: SeoKeyword;
    onUpdate: (input: Partial<SeoKeyword>) => void;
    onDelete: () => void;
}) {
    const delta = row.current_position && row.previous_position ? row.previous_position - row.current_position : 0;
    return (
        <TableRow>
            <TableCell>
                <p className="font-medium text-sm">{row.phrase}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                    {row.search_engine} · {row.device}
                </p>
            </TableCell>
            <TableCell className="max-w-48 truncate text-muted-foreground text-xs">
                {row.target_url || (row.target_entity_kind ? kindLabels[row.target_entity_kind] : "تعیین نشده")}
            </TableCell>
            <TableCell>
                <Input
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    defaultValue={row.current_position ?? ""}
                    onBlur={(event) => {
                        const value = event.target.value ? Number(event.target.value) : null;
                        if (value !== row.current_position) onUpdate({ current_position: value });
                    }}
                />
            </TableCell>
            <TableCell>
                {delta === 0 ? (
                    <span className="text-muted-foreground">—</span>
                ) : delta > 0 ? (
                    <span className="inline-flex items-center gap-1 text-success-foreground">
                        <TrendingUp className="size-4" />
                        {formatNumber(delta)}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-danger">
                        <TrendingDown className="size-4" />
                        {formatNumber(Math.abs(delta))}
                    </span>
                )}
            </TableCell>
            <TableCell>{row.search_volume === null ? "—" : formatNumber(row.search_volume)}</TableCell>
            <TableCell>
                <Button variant="ghost" size="icon" className="size-8" onClick={onDelete} aria-label="حذف کلمه">
                    <Trash2 className="size-4 text-danger" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

function CompetitorsSection() {
    const [domain, setDomain] = useState("");
    const competitors = useSeoCompetitors({ limit: 100 });
    const mutations = useSeoResourceMutations();
    const submit = () => {
        if (!domain.trim()) return;
        mutations.competitorCreate.mutate(
            { domain: domain.trim(), enabled: true, source: "manual" },
            { onSuccess: () => setDomain("") },
        );
    };
    return (
        <Card>
            <CardHeader className="gap-3 pb-3">
                <div>
                    <CardTitle className="text-base">رقبای ثبت‌شده</CardTitle>
                    <CardDescription>Metrics فقط پس از Import یا اتصال رسمی نمایش داده می‌شود.</CardDescription>
                </div>
                <div className="flex gap-2">
                    <Input
                        dir="ltr"
                        value={domain}
                        onChange={(event) => setDomain(event.target.value)}
                        placeholder="example.com"
                    />
                    <Button onClick={submit} disabled={!domain.trim()}>
                        <Plus className="size-4" />
                        افزودن رقیب
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {(competitors.data?.data ?? []).map((item) => (
                    <CompetitorCard key={item.id} item={item} onDelete={() => mutations.competitorDelete.mutate(item.id)} />
                ))}
                {competitors.isLoading ? (
                    <>
                        <Skeleton className="h-28" />
                        <Skeleton className="h-28" />
                    </>
                ) : null}
                {competitors.data?.data.length === 0 ? (
                    <p className="col-span-full py-12 text-center text-muted-foreground text-sm">رقیبی ثبت نشده است.</p>
                ) : null}
            </CardContent>
        </Card>
    );
}

function CompetitorCard({ item, onDelete }: { item: SeoCompetitor; onDelete: () => void }) {
    return (
        <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p dir="ltr" className="font-medium text-sm">
                        {item.domain}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">{item.label || "بدون عنوان نمایشی"}</p>
                </div>
                <Button variant="ghost" size="icon" className="size-8" onClick={onDelete}>
                    <Trash2 className="size-4 text-danger" />
                </Button>
            </div>
            <div className="mt-4 flex items-center justify-between">
                <ConnectionBadge status={item.enabled ? "configured" : "disabled"} />
                <span className="text-muted-foreground text-xs">
                    {Object.keys(item.metrics ?? {}).length ? "دارای داده واردشده" : "بدون Metrics"}
                </span>
            </div>
        </div>
    );
}

function LinksSection() {
    const links = useSeoInternalLinks({ limit: 100 });
    const mutations = useSeoResourceMutations();
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">پیشنهادها و لینک‌های داخلی</CardTitle>
                <CardDescription>رابطه‌ها مستقل ذخیره می‌شوند و فقط بعد از تأیید به وضعیت Applied می‌رسند.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                {links.isLoading ? (
                    <TableSkeleton />
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>مبدأ</TableHead>
                                    <TableHead>Anchor</TableHead>
                                    <TableHead>مقصد</TableHead>
                                    <TableHead>رابطه</TableHead>
                                    <TableHead>وضعیت</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(links.data?.data ?? []).map((link) => (
                                    <LinkRow
                                        key={link.id}
                                        link={link}
                                        onApply={() => mutations.linkUpdate.mutate({ ...link, status: "applied" })}
                                        onDelete={() => mutations.linkDelete.mutate(link.id)}
                                    />
                                ))}
                                {links.data?.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                            هنوز رابطه‌ای ثبت نشده است؛ ممیزی K21 صفحات یتیم را مشخص می‌کند.
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function LinkRow({ link, onApply, onDelete }: { link: SeoInternalLink; onApply: () => void; onDelete: () => void }) {
    return (
        <TableRow>
            <TableCell className="font-mono text-xs">{link.source_key}</TableCell>
            <TableCell className="font-medium text-sm">{link.anchor}</TableCell>
            <TableCell className="font-mono text-xs">{link.target_key}</TableCell>
            <TableCell>
                <Badge variant="secondary">{link.relation}</Badge>
            </TableCell>
            <TableCell>
                <Badge variant="outline">{link.status}</Badge>
            </TableCell>
            <TableCell>
                <div className="flex gap-1">
                    {link.status !== "applied" ? (
                        <Button variant="ghost" size="sm" onClick={onApply}>
                            اعمال
                        </Button>
                    ) : null}
                    <Button variant="ghost" size="icon" className="size-8" onClick={onDelete}>
                        <Trash2 className="size-4 text-danger" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

function ReportsSection() {
    const report = useSeoReports();
    if (report.isLoading) return <LoadingCards />;
    if (!report.data) return <ErrorCard title="گزارش دریافت نشد" onRetry={() => report.refetch()} />;
    const data = report.data.data;
    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="محصولات منتشرشده" value={formatNumber(data.published_products_count)} icon={Boxes} />
                <StatCard
                    label="محتوای قدیمی"
                    value={formatNumber(data.stale_content_count)}
                    icon={RotateCcw}
                    tone={data.stale_content_count ? "warning" : "success"}
                />
                <StatCard label="انواع تحلیل‌شده" value={formatNumber(data.by_entity.length)} icon={Tags} />
                <StatCard label="رویدادهای اخیر" value={formatNumber(data.events.length)} icon={Activity} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="بازدید نوشته‌ها" value={formatNumber(data.content_impact.views)} icon={Eye} />
                <StatCard
                    label="کلیک محصول از نوشته"
                    value={formatNumber(data.content_impact.product_clicks)}
                    icon={MousePointerClick}
                />
                <StatCard
                    label="سفارش منتسب"
                    value={formatNumber(data.content_impact.assisted_orders)}
                    icon={ShoppingCart}
                    tone={data.content_impact.assisted_orders > 0 ? "success" : "default"}
                />
                <StatCard
                    label="درآمد منتسب؛ واحد پایه"
                    value={formatNumber(data.content_impact.assisted_revenue_minor)}
                    icon={Banknote}
                    tone={data.content_impact.assisted_revenue_minor > 0 ? "success" : "default"}
                />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">امتیاز به تفکیک موجودیت</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {data.by_entity.map((row) => (
                            <div key={row.entity_kind} className="space-y-1.5">
                                <div className="flex items-center justify-between text-sm">
                                    <span>{kindLabels[row.entity_kind]}</span>
                                    <span className={cn("font-semibold", scoreTone(row.average_score))}>
                                        {formatNumber(row.average_score)} / ۱۰۰
                                    </span>
                                </div>
                                <Progress value={row.average_score} className="h-1.5" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">پرتکرارترین خطاها</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {data.top_issues.slice(0, 10).map((row) => (
                            <div
                                key={`${row.severity}-${row.rule_code}`}
                                className="flex items-center justify-between rounded-lg border p-2.5"
                            >
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={severityClasses[row.severity]}>
                                        {severityLabels[row.severity]}
                                    </Badge>
                                    <code className="text-xs">{row.rule_code}</code>
                                </div>
                                <span className="font-semibold tabular-nums">{formatNumber(row.count)}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function SettingsSection() {
    const settings = useSeoSettings();
    const mutation = useSeoSettingsMutation();
    const robots = useSeoRobotsPreview();
    const sitemap = useSeoSitemapPreview();
    const integrations = useSeoIntegrations();
    const integrationMutation = useSeoIntegrationMutation();
    const indexNow = useSeoIndexNowMutation();
    const [form, setForm] = useState<SeoSettings | null>(null);
    useEffect(() => {
        if (settings.data?.data) setForm(settings.data.data);
    }, [settings.data]);
    if (settings.isLoading || !form) return <LoadingCards />;
    const set = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) =>
        setForm((current) => (current ? { ...current, [key]: value } : current));
    return (
        <div className="space-y-4">
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">تنظیمات اصلی</CardTitle>
                        <CardDescription>مقادیر Tenant-safe هستند و Secret در دیتابیس ذخیره نمی‌شود.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>پروفایل تحلیل</Label>
                                <Select
                                    value={form.engine_profile}
                                    onValueChange={(value) => set("engine_profile", value as "k20" | "k21")}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="k20">K20 — استاندارد</SelectItem>
                                        <SelectItem value="k21">K21 — پیشرفته</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Field
                                label="آدرس اصلی سایت"
                                value={form.base_url}
                                onChange={(value) => set("base_url", value)}
                                dir="ltr"
                            />
                            <Field
                                label="نام سازمان در Schema"
                                value={form.organization_name}
                                onChange={(value) => set("organization_name", value)}
                            />
                            <Field
                                label="آدرس لوگوی سازمان"
                                value={form.organization_logo_url ?? ""}
                                onChange={(value) => set("organization_logo_url", value || null)}
                                dir="ltr"
                            />
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                            <ToggleRow
                                label="فعال‌بودن robots.txt"
                                checked={form.robots_enabled}
                                onCheckedChange={(value) => set("robots_enabled", value)}
                            />
                            <ToggleRow
                                label="اجازه OAI-SearchBot"
                                checked={form.openai_searchbot_allowed}
                                onCheckedChange={(value) => set("openai_searchbot_allowed", value)}
                            />
                            <ToggleRow
                                label="فعال‌بودن Sitemap"
                                checked={form.sitemap_enabled}
                                onCheckedChange={(value) => set("sitemap_enabled", value)}
                            />
                            <ToggleRow
                                label="فعال‌بودن Schema"
                                checked={form.schema_enabled}
                                onCheckedChange={(value) => set("schema_enabled", value)}
                            />
                            <ToggleRow
                                label="محصولات در Sitemap"
                                checked={form.sitemap_products}
                                onCheckedChange={(value) => set("sitemap_products", value)}
                            />
                            <ToggleRow
                                label="نوشته‌ها در Sitemap"
                                checked={form.sitemap_content}
                                onCheckedChange={(value) => set("sitemap_content", value)}
                            />
                            <ToggleRow
                                label="IndexNow"
                                checked={form.indexnow_enabled}
                                onCheckedChange={(value) => set("indexnow_enabled", value)}
                            />
                            <div className="space-y-1.5 rounded-lg border p-3">
                                <Label>روزهای قدیمی‌شدن محتوا</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={3650}
                                    value={form.content_stale_days}
                                    onChange={(event) => set("content_stale_days", Number(event.target.value))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>مسیرهای Disallow</Label>
                            <Textarea
                                dir="ltr"
                                value={form.robots_disallow.join("\n")}
                                onChange={(event) =>
                                    set(
                                        "robots_disallow",
                                        event.target.value
                                            .split("\n")
                                            .map((item) => item.trim())
                                            .filter(Boolean),
                                    )
                                }
                                rows={6}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
                                {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                                ذخیره تنظیمات
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => indexNow.mutate({})}
                                disabled={!form.indexnow_enabled || indexNow.isPending}
                            >
                                {indexNow.isPending ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
                                ارسال Sitemap به IndexNow
                            </Button>
                        </div>
                        {indexNow.isSuccess ? (
                            <p className="text-sm text-success-foreground">
                                {formatNumber(indexNow.data.data.count)} نشانی برای IndexNow ارسال شد.
                            </p>
                        ) : null}
                        {indexNow.isError ? (
                            <p className="text-danger text-sm">ارسال IndexNow انجام نشد؛ اتصال و متغیر محیطی را بررسی کنید.</p>
                        ) : null}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">خروجی فنی</CardTitle>
                        <CardDescription>پیش‌نمایش مستقیم از تنظیمات ذخیره‌شده و موجودیت‌های قابل ایندکس.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="mb-2 flex items-center gap-2 font-medium text-sm">
                                <Code2 className="size-4" />
                                robots.txt
                            </p>
                            <pre
                                dir="ltr"
                                className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-left text-xs leading-5"
                            >
                                {robots.data?.data.text ?? "در حال دریافت..."}
                            </pre>
                        </div>
                        <div className="rounded-lg border p-3">
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 font-medium text-sm">
                                    <Sitemap className="size-4" />
                                    Sitemap
                                </span>
                                <Badge variant="secondary">{formatNumber(sitemap.data?.data.total)} URL</Badge>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {Object.entries(sitemap.data?.data.counts ?? {}).map(([key, value]) => (
                                    <Badge key={key} variant="outline">
                                        {kindLabels[key as SeoEntityKind] ?? key}: {formatNumber(value)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <IntegrationsSection
                data={integrations.data?.data ?? []}
                onSave={(integration) => integrationMutation.mutate(integration)}
                saving={integrationMutation.isPending}
            />
        </div>
    );
}

function IntegrationsSection({
    data,
    onSave,
    saving,
}: {
    data: SeoIntegration[];
    onSave: (value: Partial<SeoIntegration> & { provider: string }) => void;
    saving: boolean;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">اتصال‌ها</CardTitle>
                <CardDescription>
                    برای سرویس‌هایی که Token می‌خواهند فقط نام متغیر محیطی ذخیره می‌شود، نه مقدار Secret.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.map((item) => (
                    <IntegrationCard key={item.provider} item={item} onSave={onSave} saving={saving} />
                ))}
            </CardContent>
        </Card>
    );
}

function IntegrationCard({
    item,
    onSave,
    saving,
}: {
    item: SeoIntegration;
    onSave: (value: Partial<SeoIntegration> & { provider: string }) => void;
    saving: boolean;
}) {
    const [envRef, setEnvRef] = useState(item.credential_env_ref ?? "");
    return (
        <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="font-medium text-sm">{providerLabel(item.provider)}</p>
                    <p className="mt-1 text-muted-foreground text-xs">
                        {item.credential_configured ? "متغیر محیطی در Runtime پیدا شد" : "Credential تأیید نشده"}
                    </p>
                </div>
                <ConnectionBadge status={item.status} />
            </div>
            <Input
                dir="ltr"
                className="mt-3 h-8 text-xs"
                value={envRef}
                onChange={(event) => setEnvRef(event.target.value)}
                placeholder="ENV_VARIABLE_NAME"
            />
            <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() =>
                    onSave({
                        provider: item.provider,
                        credential_env_ref: envRef || null,
                        status: envRef ? "configured" : "disconnected",
                        configuration: item.configuration,
                    })
                }
                disabled={saving}
            >
                ثبت پیکربندی
            </Button>
        </div>
    );
}

function ResourcesSection({ kind }: { kind: "redirects" | "links" }) {
    if (kind === "links") return <LinksSection />;
    return <RedirectsSection />;
}

function RedirectsSection() {
    const redirects = useSeoRedirects({ limit: 100 });
    const mutations = useSeoResourceMutations();
    const [source, setSource] = useState("");
    const [target, setTarget] = useState("");
    const submit = () => {
        if (!source.trim() || !target.trim()) return;
        mutations.redirectCreate.mutate(
            { source_path: source.trim(), target_path: target.trim(), status_code: 301, enabled: true },
            {
                onSuccess: () => {
                    setSource("");
                    setTarget("");
                },
            },
        );
    };
    return (
        <Card>
            <CardHeader className="gap-3">
                <div>
                    <CardTitle className="text-base">مدیریت Redirect</CardTitle>
                    <CardDescription>مسیرهای حذف یا تغییرکرده با Redirect مستقیم و بدون Loop مدیریت می‌شوند.</CardDescription>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <Input dir="ltr" value={source} onChange={(event) => setSource(event.target.value)} placeholder="/old-path" />
                    <Input dir="ltr" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="/new-path" />
                    <Button onClick={submit}>
                        <Plus className="size-4" />
                        افزودن
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>مبدأ</TableHead>
                                <TableHead>مقصد</TableHead>
                                <TableHead>کد</TableHead>
                                <TableHead>بازدید</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(redirects.data?.data ?? []).map((row) => (
                                <RedirectRow key={row.id} row={row} onDelete={() => mutations.redirectDelete.mutate(row.id)} />
                            ))}
                            {redirects.data?.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                        Redirect ثبت نشده است.
                                    </TableCell>
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function RedirectRow({ row, onDelete }: { row: SeoRedirect; onDelete: () => void }) {
    return (
        <TableRow>
            <TableCell dir="ltr" className="font-mono text-xs">
                {row.source_path}
            </TableCell>
            <TableCell dir="ltr" className="font-mono text-xs">
                {row.target_path || "Gone"}
            </TableCell>
            <TableCell>
                <Badge variant="outline">{row.status_code}</Badge>
            </TableCell>
            <TableCell>{formatNumber(row.hit_count)}</TableCell>
            <TableCell>
                <Button variant="ghost" size="icon" className="size-8" onClick={onDelete}>
                    <Trash2 className="size-4 text-danger" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

function AuditSection() {
    const audit = useSeoAuditMutation();
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">اجرای ممیزی کامل</CardTitle>
                <CardDescription>
                    ممیزی به‌صورت Write-serial روی تمام محصولات، دسته‌ها، برندها، ویژگی‌ها، نوشته‌ها و تصاویر اجرا می‌شود.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Bot className="size-5" />
                        </span>
                        <div>
                            <p className="font-medium text-sm">موتور قواعد K20/K21</p>
                            <p className="mt-1 text-muted-foreground text-xs leading-5">
                                خروجی شامل امتیاز جزءبه‌جزء، Evidence، Suggested fix و تاریخچه Issue است.
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => audit.all.mutate({})} disabled={audit.all.isPending}>
                        {audit.all.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}شروع
                        ممیزی کامل
                    </Button>
                </div>
                {audit.all.isSuccess ? (
                    <p className="mt-3 text-sm text-success-foreground">ممیزی با موفقیت تکمیل و نتایج ذخیره شد.</p>
                ) : null}
                {audit.all.isError ? (
                    <p className="mt-3 text-danger text-sm">ممیزی متوقف شد؛ خطای API را در لاگ بررسی کنید.</p>
                ) : null}
            </CardContent>
        </Card>
    );
}

function ConnectionBadge({ status }: { status: string }) {
    const connected = status === "connected";
    const configured = status === "configured";
    return (
        <Badge
            variant="outline"
            className={
                connected
                    ? "border-success/25 bg-success/10 text-success-foreground"
                    : configured
                      ? "border-info/25 bg-info/10 text-info-foreground"
                      : "text-muted-foreground"
            }
        >
            {connected ? "متصل" : configured ? "پیکربندی‌شده" : status === "disabled" ? "غیرفعال" : "قطع"}
        </Badge>
    );
}

function providerLabel(provider: string) {
    const labels: Record<string, string> = {
        google_search_console: "Google Search Console",
        bing_webmaster: "Bing Webmaster",
        indexnow: "IndexNow",
        google_merchant: "Google Merchant",
        openai_searchbot: "OAI-SearchBot",
        manual_import: "ورودی دستی",
    };
    return labels[provider] ?? provider;
}

function issueStatusLabel(status: string) {
    return (
        ({ open: "باز", ignored: "نادیده‌گرفته‌شده", resolved: "رفع‌شده", regressed: "بازگشته" } as Record<string, string>)[
            status
        ] ?? status
    );
}

function LoadingCards() {
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {["health", "issues", "entities", "commerce"].map((key) => (
                <Skeleton key={key} className="h-28" />
            ))}
        </div>
    );
}

function TableSkeleton() {
    return (
        <div className="space-y-2 p-4">
            {["row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7"].map((key) => (
                <Skeleton key={key} className="h-11 w-full" />
            ))}
        </div>
    );
}

function ErrorCard({ title, onRetry }: { title: string; onRetry: () => void }) {
    return (
        <Card className="border-danger/25">
            <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertTriangle className="size-8 text-danger" />
                <p className="font-medium text-sm">{title}</p>
                <Button variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCcw className="size-4" />
                    تلاش دوباره
                </Button>
            </CardContent>
        </Card>
    );
}

export function SeoWorkspaceView({ mode }: { mode: SeoWorkspaceMode }) {
    const overview = useSeoOverview();
    const searchParams = useSearchParams();
    const requestedKind = searchParams.get("kind") as SeoEntityKind | null;
    const requestedIdValue = Number(searchParams.get("id"));
    const requestedId = Number.isSafeInteger(requestedIdValue) && requestedIdValue > 0 ? requestedIdValue : null;
    const allowedKinds: SeoEntityKind[] = ["product", "category", "brand", "attribute", "content_post", "media", "page"];
    const deepLinkKind = requestedKind && allowedKinds.includes(requestedKind) ? requestedKind : null;
    const refresh = () => {
        void overview.refetch();
    };
    const sections = useMemo(() => {
        switch (mode) {
            case "overview":
                return (
                    <>
                        <OverviewSection />
                        <IssuesSection />
                    </>
                );
            case "categories-links":
                return (
                    <>
                        <EntitiesSection kind="category" />
                        <ResourcesSection kind="links" />
                    </>
                );
            case "keywords-content":
                return (
                    <>
                        <KeywordsSection />
                        <EntitiesSection kind="content_post" />
                    </>
                );
            case "technical-health":
                return (
                    <>
                        <AuditSection />
                        <IssuesSection />
                    </>
                );
            case "schema-preview":
                return <EntitiesSection kind="product" schema />;
            case "competitors-serp":
                return (
                    <>
                        <CompetitorsSection />
                        <KeywordsSection />
                    </>
                );
            case "images-alt":
                return (
                    <>
                        <EntitiesSection kind="media" editor />
                        <IssuesSection />
                    </>
                );
            case "products":
                return <EntitiesSection kind="product" editor />;
            case "rank-tracking":
                return <KeywordsSection />;
            case "content-refresh":
                return (
                    <>
                        <EntitiesSection kind="content_post" editor />
                        <IssuesSection />
                    </>
                );
            case "control-tower":
                return (
                    <>
                        <OverviewSection />
                        <AuditSection />
                        <IssuesSection />
                    </>
                );
            case "crawl-monitoring":
                return (
                    <>
                        <AuditSection />
                        <IssuesSection />
                        <OverviewSection />
                    </>
                );
            case "live-editor":
                return <EntitiesSection kind={deepLinkKind ?? "product"} initialId={requestedId} editor />;
            case "market-radar":
                return (
                    <>
                        <CompetitorsSection />
                        <KeywordsSection />
                    </>
                );
            case "reports":
                return <ReportsSection />;
            case "settings":
                return (
                    <>
                        <SettingsSection />
                        <ResourcesSection kind="redirects" />
                    </>
                );
        }
    }, [deepLinkKind, mode, requestedId]);
    return (
        <div className="space-y-5 pb-10">
            <PageHeader mode={mode} onRefresh={refresh} refreshing={overview.isFetching} />
            {sections}
            <div className="flex items-center justify-between rounded-xl border bg-muted/20 px-4 py-3 text-muted-foreground text-xs">
                <span>موتور فعال: {overview.data?.data.engine_profile?.toUpperCase() ?? "—"}</span>
                <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-success-foreground" />
                    Tenant-safe · RLS · Audit log
                </span>
            </div>
        </div>
    );
}
