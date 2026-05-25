"use client";

import type { Locale } from "@calibra/shared/i18n";
import { ArrowLeft, Copy, RefreshCw, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { formatDate, formatMoney, formatNumber, formatRelativeTime } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import {
    type CouponWritePayload,
    useCoupon,
    useCouponCodeCheck,
    useCouponRedemptions,
    useCreateCoupon,
    useUpdateCoupon,
} from "#/lib/queries/coupons";
import type { AdminCoupon, CouponDiscountType } from "#/lib/types";

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
    };
}

/**
 * Single-page editor used by both `/coupons/new` and `/coupons/[id]`. Sections are rendered as a
 * vertical card stack — the full draggable-section grid the spec describes is followed up in a
 * dedicated PR; the current shape is intentionally lighter so the form fits in one PR. The
 * dirty-state bar appears as a sticky footer when ≥1 field diverges from the loaded coupon, and
 * disappears on save / cancel.
 */
export function CouponEditor({ id }: CouponEditorProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons.editor");
    const tList = useTranslations("Coupons");
    const router = useRouter();
    const isNew = id === null;

    const { data: coupon, isPending } = useCoupon(id);
    const createMutation = useCreateCoupon();
    const updateMutation = useUpdateCoupon(id ?? 0);
    const { data: redemptions } = useCouponRedemptions(id ?? 0, 1, 10);

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [committed, setCommitted] = useState<FormState>(EMPTY_FORM);

    useEffect(() => {
        if (coupon === undefined || isNew) return;
        const next = hydrate(coupon);
        setForm(next);
        setCommitted(next);
    }, [coupon, isNew]);

    const codeCheck = useCouponCodeCheck(form.code, isNew || form.code !== committed.code);

    const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(committed), [form, committed]);
    const dirtyCount = useMemo(() => {
        let n = 0;
        for (const key of Object.keys(form) as (keyof FormState)[]) {
            if (JSON.stringify(form[key]) !== JSON.stringify(committed[key])) n += 1;
        }
        return n;
    }, [form, committed]);

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

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

    if (isPending && !isNew) {
        return <Skeleton className="h-96 w-full" />;
    }

    const codeAvailable = isNew ? codeCheck.data?.available !== false : codeCheck.data?.available !== false || form.code === committed.code;
    const codeBlocking = codeCheck.data !== undefined && codeCheck.data.available === false && (isNew || form.code !== committed.code);

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
                </div>
            </div>

            {coupon?.deletedAt !== null && coupon?.deletedAt !== undefined ? (
                <Card className="border-destructive/40">
                    <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
                        <span className="text-destructive">{t("trashedBanner")}</span>
                        <Badge variant="outline">{tList("statusBadge.trashed")}</Badge>
                    </CardContent>
                </Card>
            ) : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="flex flex-col gap-4 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("sections.general")}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                            ? codeCheck.data?.suggestion
                                                ? t("codeTakenWithSuggestion", { suggestion: codeCheck.data.suggestion })
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
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("sections.discount")}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-wrap gap-2">
                                {(["percent", "fixed_cart", "fixed_product", "free_shipping"] as CouponDiscountType[]).map(
                                    (type) => (
                                        <Button
                                            key={type}
                                            type="button"
                                            variant={form.discountType === type ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => update("discountType", type)}
                                        >
                                            {tList(`discountType.${type}`)}
                                        </Button>
                                    ),
                                )}
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
                            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{t("fields.freeShipping")}</span>
                                    <span className="text-muted-foreground text-xs">{t("fields.freeShippingHint")}</span>
                                </div>
                                <Switch
                                    checked={form.freeShipping}
                                    onCheckedChange={(checked) => update("freeShipping", checked)}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("sections.time")}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("sections.cart")}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                <Switch
                                    checked={form.individualUse}
                                    onCheckedChange={(checked) => update("individualUse", checked)}
                                />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 md:col-span-2">
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{t("fields.excludeSaleItems")}</span>
                                    <span className="text-muted-foreground text-xs">{t("fields.excludeSaleItemsHint")}</span>
                                </div>
                                <Switch
                                    checked={form.excludeSaleItems}
                                    onCheckedChange={(checked) => update("excludeSaleItems", checked)}
                                />
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
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("sections.emails")}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <p className="text-muted-foreground text-sm">{t("fields.emailsHint")}</p>
                            <EmailAllowList
                                emails={form.emailRestrictions}
                                onChange={(next) => update("emailRestrictions", next)}
                                addLabel={t("fields.emailsAdd")}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("sections.usageLimits")}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-col gap-4">
                    {!isNew && coupon !== undefined ? (
                        <>
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t("sections.liveStats")}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <StatLine
                                        label={t("stats.usageCount")}
                                        value={formatNumber(coupon.usageCount, locale)}
                                    />
                                    <StatLine
                                        label={t("stats.recent7d")}
                                        value={formatNumber(coupon.recentRedemptions7d, locale)}
                                    />
                                    {coupon.usageLimitGlobal !== null ? (
                                        <div className="flex flex-col gap-1.5">
                                            <Progress
                                                value={Math.min(100, (coupon.usageCount / coupon.usageLimitGlobal) * 100)}
                                                className="h-2"
                                            />
                                            <span className="text-muted-foreground text-xs tabular-nums">
                                                {formatNumber(coupon.usageCount, locale)} / {formatNumber(coupon.usageLimitGlobal, locale)}
                                            </span>
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>{t("sections.redemptions")}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-2 text-sm">
                                    {redemptions === undefined ? (
                                        <Skeleton className="h-24 w-full" />
                                    ) : redemptions.data.length === 0 ? (
                                        <span className="text-muted-foreground text-sm">{t("redemptionsEmpty")}</span>
                                    ) : (
                                        redemptions.data.map((row) => (
                                            <div key={row.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-b-0">
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="truncate text-xs">{row.email ?? `#${row.customer_id ?? "—"}`}</span>
                                                    <span className="text-muted-foreground text-xs">
                                                        {formatRelativeTime(row.redeemed_at, locale)}
                                                    </span>
                                                </div>
                                                <span className="tabular-nums text-xs">{formatMoney(row.discount_minor, locale)}</span>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    ) : null}
                </div>
            </div>

            {dirty ? (
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
            ) : null}
        </section>
    );
}

function StatLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium tabular-nums">{value}</span>
        </div>
    );
}

function EmailAllowList({
    emails,
    onChange,
    addLabel,
}: {
    emails: string[];
    onChange: (next: string[]) => void;
    addLabel: string;
}) {
    const [draft, setDraft] = useState("");
    const addOne = () => {
        const trimmed = draft.trim();
        if (trimmed.length === 0 || emails.includes(trimmed)) return;
        onChange([...emails, trimmed]);
        setDraft("");
    };
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
                {emails.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1">
                        <span dir="ltr">{email}</span>
                        <button
                            type="button"
                            aria-label="remove"
                            onClick={() => onChange(emails.filter((e) => e !== email))}
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
                    {addLabel}
                </Button>
            </div>
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

/** Tiny formatDate helper re-export — not strictly used here but keeps the editor importable from one place. */
export { formatDate };
