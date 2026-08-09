"use client";

import type { Locale } from "@calibra/shared/i18n";
import Image from "next/image";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { MediaPicker } from "#/components/media-picker";
import { PageHeader } from "#/components/PageHeader";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { RichTextEditor } from "#/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import {
    CalendarClock,
    Check,
    FileCheck2,
    ImageIcon,
    Link2,
    Package,
    Save,
    Search,
    Send,
    ShieldCheck,
    Sparkles,
    Tag,
    Trash2,
    UserRound,
} from "#/icons";
import { formatDateTime, formatNumber } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import {
    useContentAttributionMutations,
    useContentPost,
    useContentResources,
    useContentTaxonomy,
    useCreateContentPost,
    useTransitionContentPost,
    useUpdateContentPost,
} from "./queries";
import { ContentStatusBadge, ScoreBar, SectionTitle } from "./ui";
import type {
    ContentMedia,
    ContentOrder,
    ContentPost,
    ContentPostInput,
    ContentProduct,
    ContentStatus,
    ContentUser,
} from "./types";

interface FormState extends ContentPostInput {
    category_ids: number[];
    tag_ids: number[];
    product_ids: number[];
}

const EMPTY_FORM: FormState = {
    type: "article",
    locale: "fa",
    title: "",
    slug: "",
    excerpt: "",
    content_html: "",
    featured_media_id: null,
    author_user_id: null,
    reviewer_user_id: null,
    source_signal_id: null,
    seo_title: "",
    meta_description: "",
    canonical_url: "",
    robots_index: true,
    robots_follow: true,
    schema_type: "BlogPosting",
    search_intent: "informational",
    focus_keyword: "",
    structured_data: {},
    scheduled_at: null,
    category_ids: [],
    tag_ids: [],
    product_ids: [],
    change_summary: "",
};

function localMetrics(form: FormState) {
    const text = form.content_html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const words = text ? text.split(" ").length : 0;
    let seo = 0;
    if (form.title.trim().length >= 20 && form.title.trim().length <= 90) seo += 20;
    if ((form.seo_title ?? "").trim().length >= 20 && (form.seo_title ?? "").trim().length <= 65) seo += 20;
    if ((form.meta_description ?? "").trim().length >= 80 && (form.meta_description ?? "").trim().length <= 170) seo += 20;
    if (form.featured_media_id) seo += 10;
    if (form.category_ids.length > 0) seo += 10;
    if (words >= 300) seo += 10;
    if (form.focus_keyword && `${form.title} ${text}`.includes(form.focus_keyword)) seo += 10;
    const quality = Math.min(
        100,
        (words >= 500 ? 35 : words >= 250 ? 20 : 0) +
            (/<h2[\s>]/i.test(form.content_html) ? 20 : 0) +
            (/<(ul|ol|table)[\s>]/i.test(form.content_html) ? 15 : 0) +
            ((form.excerpt ?? "").length >= 60 ? 15 : 0) +
            (form.featured_media_id ? 15 : 0),
    );
    const commerce = Math.min(
        100,
        (form.product_ids.length > 0 ? 55 : 0) +
            (form.product_ids.length > 1 ? 15 : 0) +
            (/خرید|قیمت|سفارش|مقایسه|راهنمای انتخاب/.test(`${form.title} ${text}`) ? 30 : 0),
    );
    return { words, seo: Math.min(100, seo), quality, commerce };
}

function fromPost(post: ContentPost): FormState {
    return {
        type: post.type,
        locale: post.locale,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt ?? "",
        content_html: post.content_html,
        featured_media_id: post.featured_media_id,
        author_user_id: post.author_user_id,
        reviewer_user_id: post.reviewer_user_id,
        source_signal_id: post.source_signal_id,
        seo_title: post.seo_title ?? "",
        meta_description: post.meta_description ?? "",
        canonical_url: post.canonical_url ?? "",
        robots_index: post.robots_index,
        robots_follow: post.robots_follow,
        schema_type: post.schema_type,
        search_intent: post.search_intent ?? "informational",
        focus_keyword: post.focus_keyword ?? "",
        structured_data: post.structured_data,
        scheduled_at: post.scheduled_at,
        category_ids: post.categories.map((item) => item.id),
        tag_ids: post.tags.map((item) => item.id),
        product_ids: post.products.map((item) => item.id),
        change_summary: "",
    };
}

export function ContentStudioPage({ postId = null }: { postId?: number | null }) {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const detail = useContentPost(postId);
    const taxonomy = useContentTaxonomy();
    const create = useCreateContentPost();
    const update = useUpdateContentPost(postId ?? 0);
    const transition = useTransitionContentPost(postId ?? 0);
    const attribution = useContentAttributionMutations(postId ?? 0);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [baseline, setBaseline] = useState(JSON.stringify(EMPTY_FORM));
    const [mediaOpen, setMediaOpen] = useState(false);
    const [currentVersion, setCurrentVersion] = useState<number | null>(null);
    const [selectedMedia, setSelectedMedia] = useState<ContentMedia | null>(null);
    const [productSearch, setProductSearch] = useState("");
    const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
    const [orderSearch, setOrderSearch] = useState("");
    const [debouncedOrderSearch, setDebouncedOrderSearch] = useState("");
    const products = useContentResources<ContentProduct>("products", debouncedProductSearch, debouncedProductSearch.length >= 2);
    const orders = useContentResources<ContentOrder>(
        "orders",
        debouncedOrderSearch,
        Boolean(postId) && debouncedOrderSearch.length >= 2,
    );
    const users = useContentResources<ContentUser>("users", "", true);
    const post = detail.data?.data ?? null;

    useEffect(() => {
        if (!post) return;
        const next = fromPost(post);
        setForm(next);
        setBaseline(JSON.stringify(next));
        setSelectedMedia(post.featured_media ?? null);
        setCurrentVersion(post.version);
    }, [post]);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedProductSearch(productSearch.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [productSearch]);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedOrderSearch(orderSearch.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [orderSearch]);

    const dirty = JSON.stringify(form) !== baseline;
    useEffect(() => {
        const handler = (event: BeforeUnloadEvent) => {
            if (!dirty) return;
            event.preventDefault();
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    const metrics = useMemo(() => localMetrics(form), [form]);
    const busy = create.isPending || update.isPending || transition.isPending;
    const categories = taxonomy.data?.data.categories ?? [];
    const tags = taxonomy.data?.data.tags ?? [];
    const selectedProducts = useMemo(() => {
        const fromPostProducts = post?.products ?? [];
        const result = new Map(fromPostProducts.map((product) => [product.id, product]));
        for (const product of products.data?.data ?? [])
            if (form.product_ids.includes(product.id)) result.set(product.id, product);
        return form.product_ids.map(
            (id) => result.get(id) ?? { id, name: `محصول #${id}`, sku: null, slug: null, status: "unknown" },
        );
    }, [form.product_ids, post?.products, products.data?.data]);

    function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function validate(): boolean {
        if (form.title.trim().length < 3) {
            toast.add({ title: "عنوان نوشته را کامل کنید.", data: { tone: "error" } });
            return false;
        }
        if (form.content_html.replace(/<[^>]+>/g, "").trim().length < 20) {
            toast.add({ title: "متن نوشته هنوز کامل نیست.", data: { tone: "error" } });
            return false;
        }
        return true;
    }

    function payload(): ContentPostInput {
        return {
            ...form,
            title: form.title.trim(),
            slug: form.slug?.trim() || undefined,
            excerpt: form.excerpt?.trim() || null,
            seo_title: form.seo_title?.trim() || null,
            meta_description: form.meta_description?.trim() || null,
            canonical_url: form.canonical_url?.trim() || null,
            focus_keyword: form.focus_keyword?.trim() || null,
            change_summary: form.change_summary?.trim() || null,
            scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        };
    }

    async function save(nextStatus?: ContentStatus) {
        if (!validate()) return null;
        try {
            if (post) {
                const result = await update.mutateAsync({ ...payload(), expected_version: currentVersion ?? post.version });
                setForm(fromPost(result.data));
                setBaseline(JSON.stringify(fromPost(result.data)));
                setCurrentVersion(result.data.version);
                toast.add({ title: "تغییرات نوشته ذخیره شد.", data: { tone: "success" } });
                if (nextStatus && nextStatus !== result.data.status) {
                    const transitioned = await transition.mutateAsync({
                        to_status: nextStatus,
                        expected_version: result.data.version,
                        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
                    });
                    setForm(fromPost(transitioned.data));
                    setBaseline(JSON.stringify(fromPost(transitioned.data)));
                    setCurrentVersion(transitioned.data.version);
                    toast.add({
                        title: nextStatus === "published" ? "نوشته منتشر شد." : "وضعیت نوشته به‌روزرسانی شد.",
                        data: { tone: "success" },
                    });
                    return transitioned.data;
                }
                return result.data;
            }
            const result = await create.mutateAsync({ ...payload(), status: nextStatus ?? "draft" });
            toast.add({ title: "نوشته ساخته شد.", data: { tone: "success" } });
            router.replace(`/content/studio/${result.data.id}` as never);
            return result.data;
        } catch (error) {
            toast.add({
                title: "ذخیره نوشته ناموفق بود.",
                description: error instanceof Error ? error.message : String(error),
                data: { tone: "error" },
            });
            return null;
        }
    }

    if (postId && detail.isPending)
        return (
            <div className="space-y-5">
                <Skeleton className="h-20" />
                <Skeleton className="h-[36rem]" />
            </div>
        );
    if (postId && detail.isError)
        return (
            <Card>
                <CardHeader>
                    <CardTitle>نوشته پیدا نشد</CardTitle>
                    <CardDescription>ممکن است حذف شده باشد یا به Tenant دیگری تعلق داشته باشد.</CardDescription>
                </CardHeader>
            </Card>
        );

    return (
        <div className="flex flex-col gap-6 pb-24">
            <PageHeader
                title={post ? `ویرایش: ${post.title}` : "استودیو محتوا و AI"}
                subtitle="نگارش، سئو، اتصال به محصول، بازبینی و انتشار در یک گردش‌کار کنترل‌شده."
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href={"/content/posts" as never}>بازگشت</Link>
                        </Button>
                        {post ? (
                            <Button variant="outline" asChild>
                                <Link href={`/seo/live-editor?kind=content_post&id=${post.id}` as never}>
                                    <ShieldCheck className="size-4" />
                                    سئو
                                </Link>
                            </Button>
                        ) : null}
                        <Button variant="outline" disabled={busy || !dirty} onClick={() => void save()}>
                            <Save className="size-4" />
                            ذخیره
                        </Button>
                        {post?.status === "in_review" ? (
                            <Button disabled={busy} onClick={() => void save("approved")}>
                                <Check className="size-4" />
                                تأیید نوشته
                            </Button>
                        ) : post?.status === "approved" || post?.status === "scheduled" ? (
                            <Button disabled={busy} onClick={() => void save("published")}>
                                <Send className="size-4" />
                                انتشار
                            </Button>
                        ) : (
                            <Button disabled={busy} onClick={() => void save("in_review")}>
                                <FileCheck2 className="size-4" />
                                ارسال برای بازبینی
                            </Button>
                        )}
                    </>
                }
            />

            {post ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                    <ContentStatusBadge status={post.status} />
                    <span className="text-muted-foreground">نسخه {formatNumber(post.version, locale)}</span>
                    <span className="text-muted-foreground">آخرین تغییر: {formatDateTime(post.updated_at, locale)}</span>
                    {dirty ? (
                        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground">
                            تغییر ذخیره‌نشده
                        </Badge>
                    ) : (
                        <Badge variant="outline">
                            <Check className="size-3" />
                            ذخیره‌شده
                        </Badge>
                    )}
                </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
                <div className="min-w-0 space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">متن اصلی</CardTitle>
                            <CardDescription>
                                عنوان و متن برای انتشار عمومی ذخیره می‌شوند؛ HTML در مرورگر و API پاک‌سازی می‌شود.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="content-title">عنوان نوشته</Label>
                                <Input
                                    id="content-title"
                                    value={form.title}
                                    onChange={(event) => patch("title", event.target.value)}
                                    placeholder="عنوان دقیق و روشن بنویسید"
                                />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="content-slug">نامک</Label>
                                    <Input
                                        id="content-slug"
                                        dir="ltr"
                                        value={form.slug ?? ""}
                                        onChange={(event) => patch("slug", event.target.value)}
                                        placeholder="auto-generated-when-empty"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>نوع محتوا</Label>
                                    <Select
                                        value={form.type}
                                        onValueChange={(value) => {
                                            if (typeof value !== "string") return;
                                            patch("type", value as FormState["type"]);
                                            patch("schema_type", value === "news" ? "NewsArticle" : "BlogPosting");
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="article">مقاله</SelectItem>
                                            <SelectItem value="news">خبر</SelectItem>
                                            <SelectItem value="guide">راهنما</SelectItem>
                                            <SelectItem value="case_study">مطالعه موردی</SelectItem>
                                            <SelectItem value="landing">صفحه فرود</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="content-excerpt">خلاصه</Label>
                                <Textarea
                                    id="content-excerpt"
                                    rows={3}
                                    value={form.excerpt ?? ""}
                                    onChange={(event) => patch("excerpt", event.target.value)}
                                    placeholder="خلاصه‌ای که در کارت‌ها و نتایج داخلی نمایش داده می‌شود"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>بدنه نوشته</Label>
                                <RichTextEditor
                                    value={form.content_html}
                                    onChange={(value) => patch("content_html", value)}
                                    placeholder="متن را با ساختار H2/H3، فهرست و منابع قابل بررسی بنویسید..."
                                    minHeightClass="min-h-[28rem]"
                                    dir={form.locale === "fa" ? "rtl" : "ltr"}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <SectionTitle
                                title="اتصال محتوا به فروش"
                                description="فقط محصولات واقعی همین Tenant قابل انتخاب‌اند؛ این ارتباط برای CTA، پیشنهاد مرتبط و گزارش درآمد استفاده می‌شود."
                            />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    className="ps-9"
                                    value={productSearch}
                                    onChange={(event) => setProductSearch(event.target.value)}
                                    placeholder="نام یا SKU محصول را جست‌وجو کنید..."
                                />
                            </div>
                            {debouncedProductSearch.length >= 2 ? (
                                <div className="grid gap-2 md:grid-cols-2">
                                    {(products.data?.data ?? []).map((product) => {
                                        const selected = form.product_ids.includes(product.id);
                                        return (
                                            <button
                                                key={product.id}
                                                type="button"
                                                onClick={() =>
                                                    patch(
                                                        "product_ids",
                                                        selected
                                                            ? form.product_ids.filter((id) => id !== product.id)
                                                            : [...form.product_ids, product.id],
                                                    )
                                                }
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg border p-3 text-start transition-colors",
                                                    selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                                                )}
                                            >
                                                <Checkbox checked={selected} />
                                                <Package className="size-4 text-muted-foreground" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm">
                                                        {product.name ?? `محصول #${product.id}`}
                                                    </span>
                                                    <span className="block text-muted-foreground text-xs" dir="ltr">
                                                        {product.sku ?? "بدون SKU"}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm">برای نمایش نتیجه حداقل دو حرف وارد کنید.</p>
                            )}
                            {selectedProducts.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {selectedProducts.map((product) => (
                                        <Badge key={product.id} variant="secondary" className="gap-1.5">
                                            <Package className="size-3" />
                                            {product.name ?? `محصول #${product.id}`}
                                            <button
                                                type="button"
                                                aria-label="حذف محصول"
                                                onClick={() =>
                                                    patch(
                                                        "product_ids",
                                                        form.product_ids.filter((id) => id !== product.id),
                                                    )
                                                }
                                            >
                                                <Trash2 className="size-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    {post ? (
                        <Card>
                            <CardHeader>
                                <SectionTitle
                                    title="اتصال به سفارش‌های واقعی"
                                    description="فقط سفارش تکمیل‌شده قابل انتساب است؛ این عدد برای Attribution محتواست و جایگزین گزارش مالی نیست."
                                />
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="ps-9"
                                        value={orderSearch}
                                        onChange={(event) => setOrderSearch(event.target.value)}
                                        placeholder="شماره سفارش یا نام مشتری..."
                                    />
                                </div>
                                {debouncedOrderSearch.length >= 2 ? (
                                    <div className="grid gap-2 md:grid-cols-2">
                                        {(orders.data?.data ?? []).map((order) => {
                                            const alreadyLinked =
                                                post.attributed_orders?.some((item) => item.id === order.id) ?? false;
                                            return (
                                                <div
                                                    key={order.id}
                                                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-sm">
                                                            سفارش #{formatNumber(order.order_number, locale)}
                                                        </p>
                                                        <p className="mt-1 truncate text-muted-foreground text-xs">
                                                            {[order.first_name, order.last_name].filter(Boolean).join(" ") ||
                                                                order.status}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={
                                                            alreadyLinked ||
                                                            order.status !== "completed" ||
                                                            attribution.add.isPending
                                                        }
                                                        onClick={async () => {
                                                            try {
                                                                const result = await attribution.add.mutateAsync({
                                                                    order_id: order.id,
                                                                });
                                                                setOrderSearch("");
                                                                if (result.data) {
                                                                    setCurrentVersion(result.data.version);
                                                                }
                                                                toast.add({
                                                                    title: "سفارش به نوشته منتسب شد",
                                                                    data: { tone: "success" },
                                                                });
                                                            } catch {
                                                                toast.add({
                                                                    title: "انتساب سفارش ناموفق بود",
                                                                    description: "فقط سفارش تکمیل‌شده و غیرتکراری قابل اتصال است.",
                                                                    data: { tone: "error" },
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        {alreadyLinked ? "متصل" : "اتصال"}
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">برای جست‌وجوی سفارش حداقل دو نویسه وارد کنید.</p>
                                )}
                                {(post.attributed_orders?.length ?? 0) > 0 ? (
                                    <div className="space-y-2">
                                        {post.attributed_orders?.map((order) => (
                                            <div
                                                key={order.id}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"
                                            >
                                                <div>
                                                    <p className="font-medium text-sm">
                                                        سفارش #{formatNumber(order.order_number, locale)}
                                                    </p>
                                                    <p className="mt-1 text-muted-foreground text-xs">
                                                        {formatDateTime(order.created_at, locale)} · {order.status}
                                                    </p>
                                                </div>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    aria-label="حذف انتساب سفارش"
                                                    disabled={attribution.remove.isPending}
                                                    onClick={() => attribution.remove.mutate(order.id)}
                                                >
                                                    <Trash2 className="size-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : null}
                </div>

                <aside className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">امتیاز زنده</CardTitle>
                            <CardDescription>پیش‌نمایش محلی؛ امتیاز قطعی هنگام ذخیره در API محاسبه می‌شود.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ScoreBar value={metrics.seo} label="SEO" />
                            <ScoreBar value={metrics.quality} label="کیفیت و خوانایی" />
                            <ScoreBar value={metrics.commerce} label="اتصال به فروش" />
                            <p className="text-muted-foreground text-xs">{formatNumber(metrics.words, locale)} واژه</p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <ImageIcon className="size-4" />
                                تصویر شاخص
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {selectedMedia ? (
                                <div className="relative aspect-video overflow-hidden rounded-lg border">
                                    <Image
                                        src={selectedMedia.url}
                                        alt={selectedMedia.alt ?? "تصویر شاخص"}
                                        fill
                                        unoptimized
                                        sizes="(max-width: 1280px) 100vw, 320px"
                                        className="object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="grid aspect-video place-items-center rounded-lg border border-dashed bg-muted/30 text-muted-foreground">
                                    <ImageIcon className="size-7" />
                                </div>
                            )}
                            <Button type="button" variant="outline" className="w-full" onClick={() => setMediaOpen(true)}>
                                انتخاب از رسانه‌ها
                            </Button>
                            {form.featured_media_id ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full text-danger"
                                    onClick={() => {
                                        patch("featured_media_id", null);
                                        setSelectedMedia(null);
                                    }}
                                >
                                    حذف تصویر
                                </Button>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Tag className="size-4" />
                                دسته و برچسب
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="mb-2 block">دسته‌ها</Label>
                                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">
                                    {categories.map((category) => (
                                        <div key={category.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={form.category_ids.includes(category.id)}
                                                onCheckedChange={(checked) =>
                                                    patch(
                                                        "category_ids",
                                                        checked === true
                                                            ? [...form.category_ids, category.id]
                                                            : form.category_ids.filter((id) => id !== category.id),
                                                    )
                                                }
                                            />
                                            {category.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label className="mb-2 block">برچسب‌ها</Label>
                                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                                    {tags.map((tag) => (
                                        <button
                                            type="button"
                                            key={tag.id}
                                            onClick={() =>
                                                patch(
                                                    "tag_ids",
                                                    form.tag_ids.includes(tag.id)
                                                        ? form.tag_ids.filter((id) => id !== tag.id)
                                                        : [...form.tag_ids, tag.id],
                                                )
                                            }
                                        >
                                            <Badge variant={form.tag_ids.includes(tag.id) ? "default" : "outline"}>
                                                {tag.name}
                                            </Badge>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Sparkles className="size-4" />
                                SEO و نمایش جست‌وجو
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>کلمه کلیدی اصلی</Label>
                                <Input
                                    value={form.focus_keyword ?? ""}
                                    onChange={(event) => patch("focus_keyword", event.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>عنوان SEO</Label>
                                <Input
                                    value={form.seo_title ?? ""}
                                    onChange={(event) => patch("seo_title", event.target.value)}
                                />
                                <p className="text-muted-foreground text-xs">
                                    {formatNumber((form.seo_title ?? "").length, locale)} نویسه
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>توضیح متا</Label>
                                <Textarea
                                    rows={4}
                                    value={form.meta_description ?? ""}
                                    onChange={(event) => patch("meta_description", event.target.value)}
                                />
                                <p className="text-muted-foreground text-xs">
                                    {formatNumber((form.meta_description ?? "").length, locale)} نویسه
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Canonical URL</Label>
                                <div className="relative">
                                    <Link2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        className="ps-9"
                                        dir="ltr"
                                        value={form.canonical_url ?? ""}
                                        onChange={(event) => patch("canonical_url", event.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <Label htmlFor="robots-index">اجازه ایندکس</Label>
                                <Switch
                                    id="robots-index"
                                    checked={form.robots_index}
                                    onCheckedChange={(value) => patch("robots_index", value === true)}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <Label htmlFor="robots-follow">دنبال‌کردن لینک‌ها</Label>
                                <Switch
                                    id="robots-follow"
                                    checked={form.robots_follow}
                                    onCheckedChange={(value) => patch("robots_follow", value === true)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <UserRound className="size-4" />
                                مالکیت و انتشار
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>نویسنده</Label>
                                <Select
                                    value={form.author_user_id ? String(form.author_user_id) : "none"}
                                    onValueChange={(value) => {
                                        if (typeof value !== "string") return;
                                        patch("author_user_id", value === "none" ? null : Number(value));
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">کاربر جاری</SelectItem>
                                        {(users.data?.data ?? []).map((user) => (
                                            <SelectItem key={user.id} value={String(user.id)}>
                                                {user.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>بازبین</Label>
                                <Select
                                    value={form.reviewer_user_id ? String(form.reviewer_user_id) : "none"}
                                    onValueChange={(value) => {
                                        if (typeof value !== "string") return;
                                        patch("reviewer_user_id", value === "none" ? null : Number(value));
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">تعیین نشده</SelectItem>
                                        {(users.data?.data ?? []).map((user) => (
                                            <SelectItem key={user.id} value={String(user.id)}>
                                                {user.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>زمان انتشار</Label>
                                <Input
                                    type="datetime-local"
                                    value={form.scheduled_at ? form.scheduled_at.slice(0, 16) : ""}
                                    onChange={(event) => patch("scheduled_at", event.target.value || null)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>خلاصه تغییر</Label>
                                <Textarea
                                    rows={3}
                                    value={form.change_summary ?? ""}
                                    onChange={(event) => patch("change_summary", event.target.value)}
                                    placeholder="چه چیزی تغییر کرد؟"
                                />
                            </div>
                            {post && ["approved", "scheduled"].includes(post.status) ? (
                                <Button
                                    className="w-full"
                                    variant="outline"
                                    disabled={busy || !form.scheduled_at}
                                    onClick={() => void save("scheduled")}
                                >
                                    <CalendarClock className="size-4" />
                                    زمان‌بندی انتشار
                                </Button>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/[0.02]">
                        <CardContent className="flex gap-3 p-4">
                            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                            <div>
                                <p className="font-medium text-sm">انتشار کنترل‌شده</p>
                                <p className="mt-1 text-muted-foreground text-xs leading-5">
                                    خروجی Agent مستقیماً منتشر نمی‌شود. آستانه کیفیت، نسخه، منبع و تأیید انسانی در API کنترل می‌شوند.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </aside>
            </div>

            <MediaPicker
                open={mediaOpen}
                mode="single"
                value={form.featured_media_id ?? null}
                onOpenChange={setMediaOpen}
                onSelect={(selection) => {
                    const media = Array.isArray(selection) ? selection[0] : selection;
                    if (!media) return;
                    patch("featured_media_id", media.id);
                    setSelectedMedia({ id: media.id, url: media.url, alt: media.alt });
                }}
            />
        </div>
    );
}
