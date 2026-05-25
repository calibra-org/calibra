"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowLeft, Copy, MoreHorizontal, RefreshCw, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DraggableSectionGrid, type SectionSpec } from "#/components/sections/draggable-section-grid";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import {
    type CouponWritePayload,
    useCoupon,
    useCouponCodeCheck,
    useCouponRedemptions,
    useCreateCoupon,
    useDeleteCoupon,
    useUpdateCoupon,
} from "#/lib/queries/coupons";
import type { AdminCoupon, CouponDiscountType } from "#/lib/types";
import { DuplicateCouponDialog } from "#/views/coupons/dialogs/duplicate-dialog";
import { ExpirySheet } from "#/views/coupons/dialogs/expiry-sheet";
import { QuickTestSheet } from "#/views/coupons/dialogs/quick-test-sheet";
import { BrandPicker } from "#/views/coupons/shared/brand-picker";
import { CategoryPicker } from "#/views/coupons/shared/category-picker";
import { IncludeExcludePicker, type IncludeExcludeValue } from "#/views/coupons/shared/include-exclude-picker";
import { ProductPicker } from "#/views/coupons/shared/product-picker";

interface CouponEditorProps {
    /** Existing coupon id when editing; `null` for the create flow. */
    id: number | null;
}

interface FormState {
    code: string;
    descriptionFa: string;
    descriptionEn: string;
    discountType: CouponDiscountType;
    amountPercent: string;
    amountMinor: string;
    startsAt: string;
    expiresAt: string;
    minimumAmount: string;
    maximumAmount: string;
    individualUse: boolean;
    excludeSaleItems: boolean;
    freeShipping: boolean;
    usageLimitGlobal: string;
    usageLimitPerUser: string;
    limitUsageToXItems: string;
    status: "active" | "disabled";
    emailRestrictions: string[];
    productConstraints: IncludeExcludeValue;
    categoryConstraints: IncludeExcludeValue;
    brandConstraints: IncludeExcludeValue;
}

const EMPTY_FORM: FormState = {
    code: "",
    descriptionFa: "",
    descriptionEn: "",
    discountType: "percent",
    amountPercent: "10",
    amountMinor: "",
    startsAt: "",
    expiresAt: "",
    minimumAmount: "",
    maximumAmount: "",
    individualUse: false,
    excludeSaleItems: false,
    freeShipping: false,
    usageLimitGlobal: "",
    usageLimitPerUser: "",
    limitUsageToXItems: "",
    status: "active",
    emailRestrictions: [],
    productConstraints: { include: [], exclude: [] },
    categoryConstraints: { include: [], exclude: [] },
    brandConstraints: { include: [], exclude: [] },
};

function hydrate(coupon: AdminCoupon): FormState {
    return {
        code: coupon.code,
        descriptionFa: coupon.description.fa,
        descriptionEn: coupon.description.en,
        discountType: coupon.discountType,
        amountPercent: coupon.amountPercent === null ? "" : String(coupon.amountPercent),
        amountMinor: coupon.amountMinor === null ? "" : String(coupon.amountMinor),
        startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
        expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
        minimumAmount: coupon.minimumAmount === null ? "" : String(coupon.minimumAmount),
        maximumAmount: coupon.maximumAmount === null ? "" : String(coupon.maximumAmount),
        individualUse: coupon.individualUse,
        excludeSaleItems: coupon.excludeSaleItems,
        freeShipping: coupon.freeShipping,
        usageLimitGlobal: coupon.usageLimitGlobal === null ? "" : String(coupon.usageLimitGlobal),
        usageLimitPerUser: coupon.usageLimitPerUser === null ? "" : String(coupon.usageLimitPerUser),
        limitUsageToXItems: coupon.limitUsageToXItems === null ? "" : String(coupon.limitUsageToXItems),
        status: coupon.status,
        emailRestrictions: coupon.emailRestrictions,
        productConstraints: coupon.productConstraints,
        categoryConstraints: coupon.categoryConstraints,
        brandConstraints: coupon.brandConstraints,
    };
}

function serialize(form: FormState): CouponWritePayload {
    const nullableNumber = (value: string): number | null => {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    };
    const nullableDate = (value: string): string | null => {
        if (value === "") return null;
        return `${value}T00:00:00.000Z`;
    };
    return {
        code: form.code.trim().toUpperCase(),
        discount_type: form.discountType,
        amount_percent: form.discountType === "percent" ? nullableNumber(form.amountPercent) : null,
        amount_minor:
            form.discountType === "fixed_cart" || form.discountType === "fixed_product"
                ? nullableNumber(form.amountMinor)
                : null,
        starts_at: nullableDate(form.startsAt),
        expires_at: nullableDate(form.expiresAt),
        minimum_amount: nullableNumber(form.minimumAmount),
        maximum_amount: nullableNumber(form.maximumAmount),
        individual_use: form.individualUse,
        exclude_sale_items: form.excludeSaleItems,
        free_shipping: form.freeShipping,
        usage_limit_global: nullableNumber(form.usageLimitGlobal),
        usage_limit_per_user: nullableNumber(form.usageLimitPerUser),
        limit_usage_to_x_items: nullableNumber(form.limitUsageToXItems),
        status: form.status,
        translations: [
            { locale: "fa", description: form.descriptionFa || null },
            { locale: "en", description: form.descriptionEn || null },
        ],
        email_restrictions: form.emailRestrictions.filter((e) => e.trim().length > 0),
        product_constraints: [
            ...form.productConstraints.include.map((id) => ({ product_id: id, mode: "include" as const })),
            ...form.productConstraints.exclude.map((id) => ({ product_id: id, mode: "exclude" as const })),
        ],
        category_constraints: [
            ...form.categoryConstraints.include.map((id) => ({ category_id: id, mode: "include" as const })),
            ...form.categoryConstraints.exclude.map((id) => ({ category_id: id, mode: "exclude" as const })),
        ],
        brand_constraints: [
            ...form.brandConstraints.include.map((id) => ({ brand_id: id, mode: "include" as const })),
            ...form.brandConstraints.exclude.map((id) => ({ brand_id: id, mode: "exclude" as const })),
        ],
    };
}

/**
 * Coupon editor used by both `/coupons/new` and `/coupons/[id]`. Sections are rendered through
 * `DraggableSectionGrid` so an operator can reorder + collapse them to taste; order + collapsed
 * state persist per-user in `localStorage`. The dirty-state bar appears as a sticky footer when
 * ≥1 field diverges from the loaded coupon and disappears on save / cancel.
 */
export function CouponEditor({ id }: CouponEditorProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons.editor");
    const tList = useTranslations("Coupons");
    const router = useRouter();
    const searchParams = useSearchParams();
    const isNew = id === null;

    const { data: coupon, isPending } = useCoupon(id);
    const createMutation = useCreateCoupon();
    const updateMutation = useUpdateCoupon(id ?? 0);
    const deleteMutation = useDeleteCoupon();
    const { data: redemptions } = useCouponRedemptions(id ?? 0, 1, 10);

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [committed, setCommitted] = useState<FormState>(EMPTY_FORM);

    const [duplicateOpen, setDuplicateOpen] = useState(false);
    const [expiryOpen, setExpiryOpen] = useState(false);
    const [quickTestOpen, setQuickTestOpen] = useState(false);

    useEffect(() => {
        if (coupon === undefined || isNew) return;
        const next = hydrate(coupon);
        setForm(next);
        setCommitted(next);
    }, [coupon, isNew]);

    /** Dispatch URL-flag-driven panels (`?quickTest=1`, `?duplicate=1`, `?extendExpiry=1`) once the
     * coupon is hydrated. The flags come from the list page's row actions. */
    useEffect(() => {
        if (coupon === undefined) return;
        if (searchParams.get("quickTest") === "1") setQuickTestOpen(true);
        if (searchParams.get("duplicate") === "1") setDuplicateOpen(true);
        if (searchParams.get("extendExpiry") === "1") setExpiryOpen(true);
    }, [coupon, searchParams]);

    const codeCheck = useCouponCodeCheck(form.code, isNew || form.code !== committed.code);

    const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(committed), [form, committed]);
    const dirtyCount = useMemo(() => {
        let n = 0;
        for (const key of Object.keys(form) as (keyof FormState)[]) {
            if (JSON.stringify(form[key]) !== JSON.stringify(committed[key])) n += 1;
        }
        return n;
    }, [form, committed]);

    const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    }, []);

    const generateCode = () => {
        const pool = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        let out = "";
        for (let i = 0; i < 8; i += 1) out += pool[Math.floor(Math.random() * pool.length)];
        update("code", out);
    };

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(form.code);
        } catch {
            /** Older browsers / non-secure contexts can fall back to a manual copy by selecting the cell. */
        }
    };

    const onSave = async () => {
        const payload = serialize(form);
        if (isNew) {
            const result = await createMutation.mutateAsync(payload);
            router.push(`/coupons/${result.data.id}`);
            return;
        }
        await updateMutation.mutateAsync(payload);
        setCommitted(form);
    };

    const onCancel = () => {
        setForm(committed);
    };

    const onDelete = async () => {
        if (id === null) return;
        if (!confirm(tList("rowActions.deleteConfirm"))) return;
        await deleteMutation.mutateAsync(id);
        router.push("/coupons");
    };

    const onExtendExpiry = async (nextDate: string | null) => {
        if (id === null) return;
        await updateMutation.mutateAsync({ expires_at: nextDate });
        setForm((prev) => ({ ...prev, expiresAt: nextDate?.slice(0, 10) ?? "" }));
        setCommitted((prev) => ({ ...prev, expiresAt: nextDate?.slice(0, 10) ?? "" }));
    };

    if (isPending && !isNew) {
        return <Skeleton className="h-96 w-full" />;
    }

    const codeAvailable =
        isNew ? codeCheck.data?.available !== false : codeCheck.data?.available !== false || form.code === committed.code;
    const codeBlocking =
        codeCheck.data !== undefined && codeCheck.data.available === false && (isNew || form.code !== committed.code);

    const isTrashed = coupon?.deletedAt !== null && coupon?.deletedAt !== undefined;

    const sections = buildSections({
        form,
        update,
        t,
        tList,
        locale,
        coupon,
        redemptions: redemptions?.data ?? [],
        codeAvailable,
        codeBlocking,
        codeSuggestion: codeCheck.data?.suggestion ?? null,
        generateCode,
        copyCode,
        isNew,
    });

    return (
        <section className="flex flex-col gap-4 pb-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <Button asChild variant="ghost" size="sm" className="w-fit ps-0">
                        <Link href="/coupons">
                            <ArrowLeft className="me-2 size-4 rtl:-scale-x-100" aria-hidden="true" />
                            {t("backToList")}
                        </Link>
                    </Button>
                    <h1 className="font-semibold text-2xl tracking-tight">
                        {isNew ? t("titleNew") : t("titleEdit", { code: form.code })}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <Switch
                        checked={form.status === "active"}
                        onCheckedChange={(checked) => update("status", checked ? "active" : "disabled")}
                        aria-label={t("toggleStatus")}
                    />
                    <span className="text-muted-foreground text-sm">
                        {form.status === "active" ? t("statusActive") : t("statusDisabled")}
                    </span>
                    {!isNew && (
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(props) => (
                                    <Button {...props} type="button" variant="outline" size="icon" aria-label={t("moreActions")}>
                                        <MoreHorizontal className="size-4" aria-hidden="true" />
                                    </Button>
                                )}
                            />
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => setQuickTestOpen(true)}>{t("actions.quickTest")}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>{t("actions.duplicate")}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setExpiryOpen(true)}>{t("actions.extendExpiry")}</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                                    <Trash2 className="me-2 size-4" aria-hidden="true" />
                                    {t("actions.delete")}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {isTrashed && (
                <Card className="border-destructive/40">
                    <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
                        <span className="text-destructive">{t("trashedBanner")}</span>
                        <Badge variant="outline">{tList("statusBadge.trashed")}</Badge>
                    </CardContent>
                </Card>
            )}

            <DraggableSectionGrid
                storageKey={`admin.coupons.editor.${isNew ? "new" : "edit"}`}
                sections={sections}
                labels={{
                    grabHandle: t("dnd.grabHandle"),
                    collapse: t("dnd.collapse"),
                    expand: t("dnd.expand"),
                }}
            />

            {dirty && (
                <DirtyBar
                    count={dirtyCount}
                    onSave={onSave}
                    onCancel={onCancel}
                    saveLabel={isNew ? t("dirtyBar.create") : t("dirtyBar.save")}
                    cancelLabel={t("dirtyBar.cancel")}
                    dirtyLabel={(n) => t("dirtyBar.dirty", { count: n })}
                    saving={isNew ? createMutation.isPending : updateMutation.isPending}
                    disabled={codeBlocking}
                />
            )}

            {!isNew && coupon !== undefined && (
                <>
                    <DuplicateCouponDialog
                        open={duplicateOpen}
                        onOpenChange={setDuplicateOpen}
                        sourceCoupon={coupon}
                        sourcePayload={serialize(committed)}
                    />
                    <ExpirySheet
                        open={expiryOpen}
                        onOpenChange={setExpiryOpen}
                        currentExpiresAt={committed.expiresAt}
                        onApply={onExtendExpiry}
                    />
                    <QuickTestSheet open={quickTestOpen} onOpenChange={setQuickTestOpen} couponId={Number(coupon.id)} />
                </>
            )}
        </section>
    );
}

interface BuildSectionsArgs {
    form: FormState;
    update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
    t: (key: string, values?: Record<string, string | number>) => string;
    tList: (key: string, values?: Record<string, string | number>) => string;
    locale: Locale;
    coupon: AdminCoupon | undefined;
    redemptions: { id: number; email: string | null; customer_id: number | null; redeemed_at: string; discount_minor: number }[];
    codeAvailable: boolean;
    codeBlocking: boolean;
    codeSuggestion: string | null;
    generateCode: () => void;
    copyCode: () => void;
    isNew: boolean;
}

function buildSections(args: BuildSectionsArgs): SectionSpec[] {
    const { form, update, t, tList, locale, coupon, redemptions, codeAvailable, codeBlocking, codeSuggestion, generateCode, copyCode, isNew } = args;

    const sections: SectionSpec[] = [
        {
            id: "general",
            title: t("sections.general"),
            isCollapsible: true,
            body: <GeneralSection {...{ form, update, t, codeAvailable, codeBlocking, codeSuggestion, generateCode, copyCode }} />,
        },
        {
            id: "discount",
            title: t("sections.discount"),
            isCollapsible: true,
            body: <DiscountSection form={form} update={update} t={t} tList={tList} />,
        },
        {
            id: "time",
            title: t("sections.time"),
            isCollapsible: true,
            body: <TimeSection form={form} update={update} t={t} />,
        },
        {
            id: "cart",
            title: t("sections.cart"),
            isCollapsible: true,
            body: <CartSection form={form} update={update} t={t} />,
        },
        {
            id: "products",
            title: t("sections.products"),
            isCollapsible: true,
            defaultCollapsed: form.productConstraints.include.length === 0 && form.productConstraints.exclude.length === 0,
            body: (
                <IncludeExcludePicker
                    value={form.productConstraints}
                    onChange={(next) => update("productConstraints", next)}
                    labels={{
                        includeTab: t("pickers.includeTab"),
                        excludeTab: t("pickers.excludeTab"),
                        hint: t("pickers.productHint"),
                    }}
                    renderPicker={(ids, setIds) => (
                        <ProductPicker selectedIds={ids} onSelectionChange={setIds} placeholder={t("pickers.addProduct")} />
                    )}
                />
            ),
        },
        {
            id: "categories",
            title: t("sections.categories"),
            isCollapsible: true,
            defaultCollapsed: form.categoryConstraints.include.length === 0 && form.categoryConstraints.exclude.length === 0,
            body: (
                <IncludeExcludePicker
                    value={form.categoryConstraints}
                    onChange={(next) => update("categoryConstraints", next)}
                    labels={{
                        includeTab: t("pickers.includeTab"),
                        excludeTab: t("pickers.excludeTab"),
                        hint: t("pickers.categoryHint"),
                    }}
                    renderPicker={(ids, setIds) => (
                        <CategoryPicker selectedIds={ids} onSelectionChange={setIds} placeholder={t("pickers.addCategory")} />
                    )}
                />
            ),
        },
        {
            id: "brands",
            title: t("sections.brands"),
            isCollapsible: true,
            defaultCollapsed: form.brandConstraints.include.length === 0 && form.brandConstraints.exclude.length === 0,
            body: (
                <IncludeExcludePicker
                    value={form.brandConstraints}
                    onChange={(next) => update("brandConstraints", next)}
                    labels={{
                        includeTab: t("pickers.includeTab"),
                        excludeTab: t("pickers.excludeTab"),
                        hint: t("pickers.brandHint"),
                    }}
                    renderPicker={(ids, setIds) => (
                        <BrandPicker selectedIds={ids} onSelectionChange={setIds} placeholder={t("pickers.addBrand")} />
                    )}
                />
            ),
        },
        {
            id: "emails",
            title: t("sections.emails"),
            isCollapsible: true,
            defaultCollapsed: form.emailRestrictions.length === 0,
            body: <EmailsSection form={form} update={update} t={t} />,
        },
        {
            id: "usageLimits",
            title: t("sections.usageLimits"),
            isCollapsible: true,
            body: <UsageLimitsSection form={form} update={update} t={t} />,
        },
    ];

    if (!isNew && coupon !== undefined) {
        sections.push(
            {
                id: "liveStats",
                title: t("sections.liveStats"),
                isCollapsible: true,
                body: <LiveStatsSection coupon={coupon} locale={locale} t={t} />,
            },
            {
                id: "redemptions",
                title: t("sections.redemptions"),
                isCollapsible: true,
                body: <RedemptionsSection redemptions={redemptions} locale={locale} t={t} />,
            },
        );
    }

    return sections;
}

interface GeneralSectionProps {
    form: FormState;
    update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
    t: (key: string, values?: Record<string, string | number>) => string;
    codeAvailable: boolean;
    codeBlocking: boolean;
    codeSuggestion: string | null;
    generateCode: () => void;
    copyCode: () => void;
}

function GeneralSection({ form, update, t, codeAvailable, codeBlocking, codeSuggestion, generateCode, copyCode }: GeneralSectionProps) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="code">{t("fields.code")}</Label>
                <div className="flex items-center gap-2">
                    <Input
                        id="code"
                        value={form.code}
                        onChange={(e) => update("code", e.target.value.toUpperCase())}
                        className="font-mono"
                    />
                    <Button type="button" variant="outline" size="icon" onClick={generateCode} aria-label={t("fields.generate")}>
                        <RefreshCw className="size-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={copyCode} aria-label={t("fields.copy")}>
                        <Copy className="size-4" aria-hidden="true" />
                    </Button>
                </div>
                {form.code.length >= 2 && (
                    <p
                        className={
                            codeBlocking
                                ? "text-destructive text-xs"
                                : codeAvailable
                                  ? "text-emerald-600 text-xs dark:text-emerald-400"
                                  : "text-muted-foreground text-xs"
                        }
                    >
                        {codeBlocking
                            ? codeSuggestion !== null
                                ? t("codeTakenWithSuggestion", { suggestion: codeSuggestion })
                                : t("codeTaken")
                            : codeAvailable
                              ? t("codeAvailable")
                              : ""}
                    </p>
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor="description-fa">{t("fields.descriptionFa")}</Label>
                <Textarea
                    id="description-fa"
                    value={form.descriptionFa}
                    onChange={(e) => update("descriptionFa", e.target.value)}
                    rows={3}
                    dir="rtl"
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="description-en">{t("fields.descriptionEn")}</Label>
                <Textarea
                    id="description-en"
                    value={form.descriptionEn}
                    onChange={(e) => update("descriptionEn", e.target.value)}
                    rows={3}
                    dir="ltr"
                />
            </div>
        </div>
    );
}

interface SectionShellProps {
    form: FormState;
    update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
    t: (key: string, values?: Record<string, string | number>) => string;
}

function DiscountSection({ form, update, t, tList }: SectionShellProps & { tList: (key: string) => string }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
                {(["percent", "fixed_cart", "fixed_product", "free_shipping"] as CouponDiscountType[]).map((type) => (
                    <Button
                        key={type}
                        type="button"
                        variant={form.discountType === type ? "default" : "outline"}
                        size="sm"
                        onClick={() => update("discountType", type)}
                    >
                        {tList(`discountType.${type}`)}
                    </Button>
                ))}
            </div>
            {form.discountType === "percent" && (
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="amount-percent">{t("fields.amountPercent")}</Label>
                    <Input
                        id="amount-percent"
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={form.amountPercent}
                        onChange={(e) => update("amountPercent", e.target.value)}
                    />
                </div>
            )}
            {(form.discountType === "fixed_cart" || form.discountType === "fixed_product") && (
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="amount-minor">{t("fields.amountMinor")}</Label>
                    <Input
                        id="amount-minor"
                        type="number"
                        step="1"
                        min="0"
                        value={form.amountMinor}
                        onChange={(e) => update("amountMinor", e.target.value)}
                    />
                </div>
            )}
            {form.discountType === "free_shipping" && (
                <p className="text-muted-foreground text-sm">{t("fields.freeShippingOnly")}</p>
            )}
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex flex-col">
                    <span className="font-medium text-sm">{t("fields.freeShipping")}</span>
                    <span className="text-muted-foreground text-xs">{t("fields.freeShippingHint")}</span>
                </div>
                <Switch checked={form.freeShipping} onCheckedChange={(checked) => update("freeShipping", checked)} />
            </div>
        </div>
    );
}

function TimeSection({ form, update, t }: SectionShellProps) {
    const setExpiryRelative = (days: number) => {
        const next = new Date();
        next.setDate(next.getDate() + days);
        update("expiresAt", next.toISOString().slice(0, 10));
    };
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="starts-at">{t("fields.startsAt")}</Label>
                <Input
                    id="starts-at"
                    type="date"
                    value={form.startsAt}
                    onChange={(e) => update("startsAt", e.target.value)}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="expires-at">{t("fields.expiresAt")}</Label>
                <Input
                    id="expires-at"
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => update("expiresAt", e.target.value)}
                />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setExpiryRelative(1)}>
                    {t("fields.preset24h")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setExpiryRelative(7)}>
                    {t("fields.preset7d")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setExpiryRelative(30)}>
                    {t("fields.preset30d")}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const end = new Date();
                        end.setMonth(end.getMonth() + 1, 0);
                        update("expiresAt", end.toISOString().slice(0, 10));
                    }}
                >
                    {t("fields.presetEndOfMonth")}
                </Button>
            </div>
        </div>
    );
}

function CartSection({ form, update, t }: SectionShellProps) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="min-amount">{t("fields.minimumAmount")}</Label>
                <Input
                    id="min-amount"
                    type="number"
                    min="0"
                    value={form.minimumAmount}
                    onChange={(e) => update("minimumAmount", e.target.value)}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="max-amount">{t("fields.maximumAmount")}</Label>
                <Input
                    id="max-amount"
                    type="number"
                    min="0"
                    value={form.maximumAmount}
                    onChange={(e) => update("maximumAmount", e.target.value)}
                />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 md:col-span-2">
                <div className="flex flex-col">
                    <span className="font-medium text-sm">{t("fields.individualUse")}</span>
                    <span className="text-muted-foreground text-xs">{t("fields.individualUseHint")}</span>
                </div>
                <Switch checked={form.individualUse} onCheckedChange={(checked) => update("individualUse", checked)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 md:col-span-2">
                <div className="flex flex-col">
                    <span className="font-medium text-sm">{t("fields.excludeSaleItems")}</span>
                    <span className="text-muted-foreground text-xs">{t("fields.excludeSaleItemsHint")}</span>
                </div>
                <Switch checked={form.excludeSaleItems} onCheckedChange={(checked) => update("excludeSaleItems", checked)} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="limit-x">{t("fields.limitUsageToXItems")}</Label>
                <Input
                    id="limit-x"
                    type="number"
                    min="0"
                    value={form.limitUsageToXItems}
                    onChange={(e) => update("limitUsageToXItems", e.target.value)}
                    placeholder={t("fields.allItems")}
                />
            </div>
        </div>
    );
}

function EmailsSection({ form, update, t }: SectionShellProps) {
    const [draft, setDraft] = useState("");
    const addOne = () => {
        const trimmed = draft.trim();
        if (trimmed.length === 0 || form.emailRestrictions.includes(trimmed)) return;
        update("emailRestrictions", [...form.emailRestrictions, trimmed]);
        setDraft("");
    };
    return (
        <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">{t("fields.emailsHint")}</p>
            <div className="flex flex-wrap gap-1.5">
                {form.emailRestrictions.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                        <span dir="ltr">{email}</span>
                        <button
                            type="button"
                            aria-label={t("fields.emailsRemove")}
                            onClick={() => update("emailRestrictions", form.emailRestrictions.filter((e) => e !== email))}
                            className="ms-1 text-muted-foreground hover:text-foreground"
                        >
                            ×
                        </button>
                    </Badge>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addOne();
                        }
                    }}
                    placeholder="user@example.com"
                    dir="ltr"
                />
                <Button type="button" variant="outline" onClick={addOne} disabled={draft.trim().length === 0}>
                    {t("fields.emailsAdd")}
                </Button>
            </div>
        </div>
    );
}

function UsageLimitsSection({ form, update, t }: SectionShellProps) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="usage-global">{t("fields.usageLimitGlobal")}</Label>
                <Input
                    id="usage-global"
                    type="number"
                    min="0"
                    value={form.usageLimitGlobal}
                    onChange={(e) => update("usageLimitGlobal", e.target.value)}
                    placeholder={t("fields.unlimited")}
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="usage-per-user">{t("fields.usageLimitPerUser")}</Label>
                <Input
                    id="usage-per-user"
                    type="number"
                    min="0"
                    value={form.usageLimitPerUser}
                    onChange={(e) => update("usageLimitPerUser", e.target.value)}
                    placeholder={t("fields.unlimited")}
                />
            </div>
        </div>
    );
}

function LiveStatsSection({
    coupon,
    locale,
    t,
}: {
    coupon: AdminCoupon;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={t("stats.usageCount")} value={formatNumber(coupon.usageCount, locale)} />
            <StatTile label={t("stats.recent7d")} value={formatNumber(coupon.recentRedemptions7d, locale)} />
            <StatTile
                label={t("stats.limit")}
                value={coupon.usageLimitGlobal === null ? "∞" : formatNumber(coupon.usageLimitGlobal, locale)}
            />
            <StatTile
                label={t("stats.perUser")}
                value={coupon.usageLimitPerUser === null ? "∞" : formatNumber(coupon.usageLimitPerUser, locale)}
            />
            {coupon.usageLimitGlobal !== null && (
                <div className="col-span-2 lg:col-span-4">
                    <Progress value={Math.min(100, (coupon.usageCount / coupon.usageLimitGlobal) * 100)} className="h-2" />
                </div>
            )}
        </div>
    );
}

function StatTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-3">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-semibold text-lg tabular-nums">{value}</span>
        </div>
    );
}

function RedemptionsSection({
    redemptions,
    locale,
    t,
}: {
    redemptions: { id: number; email: string | null; customer_id: number | null; redeemed_at: string; discount_minor: number }[];
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    if (redemptions.length === 0) {
        return <span className="text-muted-foreground text-sm">{t("redemptionsEmpty")}</span>;
    }
    return (
        <div className="flex flex-col gap-2 text-sm">
            {redemptions.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0">
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-xs">{row.email ?? `#${row.customer_id ?? "—"}`}</span>
                        <span className="text-muted-foreground text-xs">{formatRelativeTime(row.redeemed_at, locale)}</span>
                    </div>
                    <span className="tabular-nums text-xs">{formatMoney(row.discount_minor, locale)}</span>
                </div>
            ))}
        </div>
    );
}

interface DirtyBarProps {
    count: number;
    onSave: () => void;
    onCancel: () => void;
    saveLabel: string;
    cancelLabel: string;
    dirtyLabel: (count: number) => string;
    saving: boolean;
    disabled: boolean;
}

function DirtyBar({ count, onSave, onCancel, saveLabel, cancelLabel, dirtyLabel, saving, disabled }: DirtyBarProps) {
    return (
        <div className="fixed inset-x-0 bottom-0 z-30 border-border border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                <span className="text-muted-foreground text-sm">{dirtyLabel(count)}</span>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                        {cancelLabel}
                    </Button>
                    <Button type="button" onClick={onSave} disabled={saving || disabled}>
                        <Save className="me-2 size-4" aria-hidden="true" />
                        {saveLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
