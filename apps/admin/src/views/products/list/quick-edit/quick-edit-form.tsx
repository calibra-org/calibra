"use client";

import type { Locale } from "@calibra/shared/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, ExternalLink, FolderTree, ImageOff, Info, ScrollText, Sparkles, Tag, Wallet, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useQuickEditProduct } from "#/lib/products/mutations";
import type { AdminProduct, ProductStatus, StockStatus } from "#/lib/types";
import { cn } from "#/lib/utils";

import { formatIdList, parseIdList, type QuickEditValues, quickEditSchema } from "./quick-edit-schema";

interface QuickEditFormProps {
    product: AdminProduct;
    onClose: () => void;
}

const STATUSES: ProductStatus[] = ["publish", "draft", "pending", "private"];
const STOCK_STATUSES: StockStatus[] = ["instock", "outofstock", "onbackorder"];

const productStatusTone: Record<ProductStatus, StatusTone> = {
    publish: "success",
    draft: "neutral",
    pending: "warning",
    private: "info",
};

/**
 * Quick Edit form. Splits into three labelled sections (Identity, Pricing & inventory,
 * Organization) under a sticky header strip that surfaces the active product's thumbnail, name,
 * status, and save controls. Optimistic save through `useQuickEditProduct`, `Cmd/Ctrl+S` saves,
 * `Esc` cancels with a dirty-state confirm.
 */
export function QuickEditForm({ product, onClose }: QuickEditFormProps) {
    const t = useTranslations("Products.list.quickEdit");
    const statusT = useTranslations("ProductStatus");
    const stockT = useTranslations("StockStatus");
    const locale = useLocale() as Locale;
    const mutation = useQuickEditProduct();

    const defaultValues: QuickEditValues = {
        name: product.name[locale],
        slug: product.slug[locale],
        shortDescription: product.shortDescription[locale],
        status: product.status,
        sku: product.sku,
        regularPriceMajor: product.regularPrice / 10,
        salePriceMajor: product.salePrice === null ? null : product.salePrice / 10,
        manageStock: product.manageStock,
        stockQuantity: product.stockQuantity,
        stockStatus: product.stockStatus,
        featured: product.featured,
        categoryIdsCsv: formatIdList(product.categoryIds),
        tagIdsCsv: formatIdList(product.tagIds),
        brandId: product.brandId,
    };

    const {
        control,
        handleSubmit,
        register,
        watch,
        formState: { errors, isDirty },
    } = useForm<QuickEditValues>({ defaultValues, resolver: zodResolver(quickEditSchema) });

    const manageStock = watch("manageStock");
    const watchedStatus = watch("status");

    const onSubmit = handleSubmit(async (values) => {
        try {
            await mutation.mutateAsync({
                id: product.id,
                payload: {
                    name: values.name,
                    slug: values.slug,
                    shortDescription: values.shortDescription,
                    status: values.status,
                    sku: values.sku,
                    regularPrice: Math.round(values.regularPriceMajor * 10),
                    salePrice: values.salePriceMajor === null ? null : Math.round(values.salePriceMajor * 10),
                    manageStock: values.manageStock,
                    stockQuantity: values.manageStock ? (values.stockQuantity ?? 0) : null,
                    stockStatus: values.stockStatus,
                    featured: values.featured,
                    categoryIds: parseIdList(values.categoryIdsCsv),
                    tagIds: parseIdList(values.tagIdsCsv),
                    brandId: values.brandId,
                },
            });
            toast.add({ title: t("saved"), timeout: 2500, data: { tone: "success" } });
            onClose();
        } catch {
            toast.add({ title: t("saveFailed"), timeout: 4000, data: { tone: "error" } });
        }
    });

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (isDirty && !window.confirm(t("discardConfirm"))) return;
                onClose();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "s") {
                event.preventDefault();
                void onSubmit();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isDirty, onClose, onSubmit, t]);

    return (
        <form
            onSubmit={onSubmit}
            className="relative flex flex-col bg-gradient-to-b from-card to-card/70"
            aria-label={t("title")}
        >
            {/** Sticky header strip */}
            <header className="sticky top-0 z-10 flex items-center gap-3 border-border border-b bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                {product.imageUrl !== null ? (
                    // biome-ignore lint/performance/noImgElement: mock CDN
                    <img
                        src={product.imageUrl}
                        alt={product.name[locale]}
                        className="size-10 shrink-0 rounded-md object-cover ring-1 ring-border"
                    />
                ) : (
                    <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
                        <ImageOff className="size-4" aria-hidden="true" />
                    </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground text-sm">{product.name[locale] || `#${product.id}`}</p>
                        <StatusBadge tone={productStatusTone[watchedStatus]}>{statusT(watchedStatus)}</StatusBadge>
                        {isDirty && (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 text-xs dark:text-amber-300"
                                title={t("dirty")}
                            >
                                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                                {t("dirty")}
                            </span>
                        )}
                    </div>
                    <p className="font-mono text-muted-foreground text-xs">
                        {product.sku || "—"} · {t("lastEdited", { relative: formatRelativeTime(product.updatedAt, locale) })}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Link
                        href={`/products/${product.id}` as never}
                        className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground sm:inline-flex"
                    >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        {t("openFullEdit")}
                    </Link>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={onClose}
                        aria-label={t("cancel")}
                    >
                        <X className="size-4" aria-hidden="true" />
                    </Button>
                    <Button type="submit" disabled={mutation.isPending} className={cn("h-8", mutation.isPending && "opacity-70")}>
                        {mutation.isPending ? t("saving") : t("save")}
                    </Button>
                </div>
            </header>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]">
                {/** Identity */}
                <Section
                    title={t("identity")}
                    description={t("identityHint")}
                    icon={<ScrollText className="size-4" aria-hidden="true" />}
                    span="col-span-full"
                >
                    <Field id="name" label={t("name")} error={errors.name?.message}>
                        <Input id="name" {...register("name")} className="h-10 text-sm" />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                            id="slug"
                            label={t("slug")}
                            error={errors.slug?.message}
                            hint={`/${watch("slug") || "product-slug"}`}
                        >
                            <Input id="slug" dir="ltr" className="font-mono text-xs" {...register("slug")} />
                        </Field>
                        <Field id="sku" label={t("sku")} error={errors.sku?.message}>
                            <Input id="sku" dir="ltr" className="font-mono text-xs" {...register("sku")} />
                        </Field>
                    </div>
                    <Field id="shortDescription" label={t("shortDescription")} error={errors.shortDescription?.message}>
                        <Textarea id="shortDescription" rows={3} {...register("shortDescription")} />
                    </Field>
                </Section>

                {/** Pricing & inventory */}
                <Section
                    title={t("pricingInventory")}
                    description={t("pricingInventoryHint")}
                    icon={<Wallet className="size-4" aria-hidden="true" />}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Controller
                            control={control}
                            name="regularPriceMajor"
                            render={({ field }) => (
                                <Field id="regularPriceMajor" label={t("regularPrice")} error={errors.regularPriceMajor?.message}>
                                    <CurrencyInput
                                        id="regularPriceMajor"
                                        value={field.value}
                                        onChange={(value) => field.onChange(value ?? 0)}
                                    />
                                </Field>
                            )}
                        />
                        <Controller
                            control={control}
                            name="salePriceMajor"
                            render={({ field }) => (
                                <Field
                                    id="salePriceMajor"
                                    label={t("salePrice")}
                                    error={errors.salePriceMajor?.message}
                                    hint={t("salePriceHint")}
                                >
                                    <CurrencyInput id="salePriceMajor" value={field.value} onChange={field.onChange} nullable />
                                </Field>
                            )}
                        />
                    </div>

                    <Controller
                        control={control}
                        name="manageStock"
                        render={({ field }) => (
                            <ToggleRow
                                id="manageStock"
                                title={t("manageStock")}
                                description={t("manageStockHint")}
                                icon={<Boxes className="size-4" aria-hidden="true" />}
                                checked={field.value}
                                onChange={field.onChange}
                            />
                        )}
                    />

                    {manageStock ? (
                        <Controller
                            control={control}
                            name="stockQuantity"
                            render={({ field }) => (
                                <Field id="stockQuantity" label={t("stockQuantity")} error={errors.stockQuantity?.message}>
                                    <Input
                                        id="stockQuantity"
                                        type="number"
                                        inputMode="numeric"
                                        value={field.value ?? ""}
                                        onChange={(event) =>
                                            field.onChange(event.target.value === "" ? null : Number(event.target.value))
                                        }
                                    />
                                </Field>
                            )}
                        />
                    ) : (
                        <Controller
                            control={control}
                            name="stockStatus"
                            render={({ field }) => (
                                <Field id="stockStatus" label={t("stockStatus")}>
                                    <Select value={field.value} onValueChange={(value) => field.onChange(value as StockStatus)}>
                                        <SelectTrigger id="stockStatus">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STOCK_STATUSES.map((status) => (
                                                <SelectItem key={status} value={status}>
                                                    {stockT(status)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        />
                    )}
                </Section>

                {/** Organization */}
                <Section
                    title={t("organization")}
                    description={t("organizationHint")}
                    icon={<FolderTree className="size-4" aria-hidden="true" />}
                    span="col-span-full"
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Controller
                            control={control}
                            name="status"
                            render={({ field }) => (
                                <Field id="status" label={t("status")} error={errors.status?.message}>
                                    <Select value={field.value} onValueChange={(value) => field.onChange(value as ProductStatus)}>
                                        <SelectTrigger id="status">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {STATUSES.map((status) => (
                                                <SelectItem key={status} value={status}>
                                                    {statusT(status)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        />
                        <Controller
                            control={control}
                            name="brandId"
                            render={({ field }) => (
                                <Field id="brandId" label={t("brand")}>
                                    <Input
                                        id="brandId"
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="#42"
                                        value={field.value ?? ""}
                                        onChange={(event) =>
                                            field.onChange(event.target.value === "" ? null : Number(event.target.value))
                                        }
                                    />
                                </Field>
                            )}
                        />
                        <Controller
                            control={control}
                            name="featured"
                            render={({ field }) => (
                                <ToggleRow
                                    id="featured"
                                    title={t("featured")}
                                    description={t("featuredHint")}
                                    icon={<Sparkles className="size-4" aria-hidden="true" />}
                                    checked={field.value}
                                    onChange={field.onChange}
                                    compact
                                />
                            )}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Controller
                            control={control}
                            name="categoryIdsCsv"
                            render={({ field }) => (
                                <Field id="categoryIdsCsv" label={t("categories")} hint={t("idCsvHint")}>
                                    <TokenInput
                                        id="categoryIdsCsv"
                                        value={field.value}
                                        onChange={field.onChange}
                                        icon={<FolderTree className="size-3.5" aria-hidden="true" />}
                                        placeholder="1, 2, 3"
                                    />
                                </Field>
                            )}
                        />
                        <Controller
                            control={control}
                            name="tagIdsCsv"
                            render={({ field }) => (
                                <Field id="tagIdsCsv" label={t("tags")} hint={t("idCsvHint")}>
                                    <TokenInput
                                        id="tagIdsCsv"
                                        value={field.value}
                                        onChange={field.onChange}
                                        icon={<Tag className="size-3.5" aria-hidden="true" />}
                                        placeholder="1, 2, 3"
                                    />
                                </Field>
                            )}
                        />
                    </div>
                </Section>
            </div>
        </form>
    );
}

interface SectionProps {
    title: string;
    description?: string;
    icon: React.ReactNode;
    span?: string;
    children: React.ReactNode;
}

function Section({ title, description, icon, span, children }: SectionProps) {
    return (
        <section className={cn("flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs", span)}>
            <header className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
                <div className="flex flex-col">
                    <h3 className="font-medium text-foreground text-sm">{title}</h3>
                    {description !== undefined && <p className="text-muted-foreground text-xs">{description}</p>}
                </div>
            </header>
            <div className="flex flex-col gap-3">{children}</div>
        </section>
    );
}

interface FieldProps {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}

function Field({ id, label, error, hint, children }: FieldProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="font-medium text-foreground text-xs">
                {label}
            </Label>
            {children}
            {error !== undefined ? (
                <p className="inline-flex items-center gap-1 text-destructive text-xs">
                    <Info className="size-3" aria-hidden="true" />
                    {error}
                </p>
            ) : hint !== undefined ? (
                <p className="truncate text-muted-foreground text-xs" dir="ltr">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}

interface ToggleRowProps {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    checked: boolean;
    onChange: (next: boolean) => void;
    compact?: boolean;
}

function ToggleRow({ id, title, description, icon, checked, onChange, compact }: ToggleRowProps) {
    return (
        <label
            htmlFor={id}
            className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 transition-colors hover:bg-muted/60",
                compact ? "py-2" : "py-2.5",
                checked && "border-primary/40 bg-primary/5",
            )}
        >
            <span
                className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground",
                    checked && "bg-primary/10 text-primary",
                )}
            >
                {icon}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-foreground text-xs">{title}</span>
                <span className="truncate text-muted-foreground text-xs">{description}</span>
            </span>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </label>
    );
}

interface CurrencyInputProps {
    id: string;
    value: number | null | undefined;
    onChange: (value: number | null) => void;
    nullable?: boolean;
}

/** Input with a `Toman` suffix chip. Empty value coerces to either 0 (required) or null. */
function CurrencyInput({ id, value, onChange, nullable }: CurrencyInputProps) {
    const t = useTranslations("Products.list.quickEdit");
    return (
        <div className="relative">
            <Input
                id={id}
                type="number"
                inputMode="numeric"
                value={value ?? ""}
                dir="ltr"
                onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") return onChange(nullable === true ? null : 0);
                    return onChange(Number(raw));
                }}
                className="pe-16 font-mono text-sm"
            />
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                {t("currency")}
            </span>
        </div>
    );
}

interface TokenInputProps {
    id: string;
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    icon: React.ReactNode;
}

/**
 * Reads the CSV value, surfaces parsed ids as removable chips above the field, lets the user
 * keep typing additional ids in the underlying input. A pure cosmetic upgrade — the field still
 * binds to the same comma-separated string the zod schema expects.
 */
function TokenInput({ id, value, onChange, placeholder, icon }: TokenInputProps) {
    const ids = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const removeAt = (index: number) => {
        const next = ids.filter((_, i) => i !== index).join(", ");
        onChange(next);
    };

    return (
        <div className="flex flex-col gap-1.5">
            {ids.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {ids.map((id, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: ids may repeat while the user is mid-typing; the position disambiguates them locally
                        <Badge key={`${id}-${index}`} variant="secondary" className="gap-1 ps-2 pe-1">
                            {icon}
                            <span className="font-mono text-[10px]">#{id}</span>
                            <button
                                type="button"
                                onClick={() => removeAt(index)}
                                className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
                                aria-label="Remove"
                            >
                                <X className="size-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <Input
                id={id}
                dir="ltr"
                placeholder={placeholder}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="font-mono text-xs"
            />
        </div>
    );
}
