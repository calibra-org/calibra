"use client";

import type { Locale } from "@calibra/shared/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, ExternalLink, FolderTree, ImageOff, Info, Sparkles, Tag, X } from "lucide-react";
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
        <form onSubmit={onSubmit} className="relative flex flex-col bg-muted/30" aria-label={t("title")}>
            {/** Compact header strip — thumb, name + dirty chip, save bar. Stays inline with the table row. */}
            <header className="flex items-center gap-2 border-border border-b px-4 py-2">
                {product.imageUrl !== null ? (
                    // biome-ignore lint/performance/noImgElement: mock CDN
                    <img
                        src={product.imageUrl}
                        alt={product.name[locale]}
                        className="size-7 shrink-0 rounded object-cover ring-1 ring-border"
                    />
                ) : (
                    <div className="grid size-7 shrink-0 place-items-center rounded bg-muted text-muted-foreground ring-1 ring-border">
                        <ImageOff className="size-3.5" aria-hidden="true" />
                    </div>
                )}
                <p className="truncate font-medium text-foreground text-sm">{product.name[locale] || `#${product.id}`}</p>
                <StatusBadge tone={productStatusTone[watchedStatus]}>{statusT(watchedStatus)}</StatusBadge>
                {isDirty && (
                    <span
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-700 text-xs dark:text-amber-300"
                        title={t("dirty")}
                    >
                        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        {t("dirty")}
                    </span>
                )}
                <span className="ms-auto inline-flex items-center gap-1.5">
                    <Link
                        href={`/products/${product.id}` as never}
                        className="hidden items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-accent hover:text-foreground sm:inline-flex"
                    >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        {t("openFullEdit")}
                    </Link>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={onClose}
                    >
                        {t("cancel")}
                    </Button>
                    <Button
                        type="submit"
                        size="sm"
                        disabled={mutation.isPending}
                        className={cn("h-7", mutation.isPending && "opacity-70")}
                    >
                        {mutation.isPending ? t("saving") : t("save")}
                    </Button>
                </span>
            </header>

            {/**
             * Compact dense grid — WordPress-style row-replace editor. Twelve-column track lets
             * every field claim only what it needs; no oversized inputs.
             */}
            <div className="grid grid-cols-12 gap-x-3 gap-y-3 px-4 py-4">
                <Field id="name" label={t("name")} error={errors.name?.message} span="col-span-12 md:col-span-6">
                    <Input id="name" {...register("name")} />
                </Field>
                <Field
                    id="slug"
                    label={t("slug")}
                    error={errors.slug?.message}
                    span="col-span-6 md:col-span-3"
                    hint={`/${watch("slug") || "product-slug"}`}
                >
                    <Input id="slug" dir="ltr" className="font-mono text-xs" {...register("slug")} />
                </Field>
                <Field id="sku" label={t("sku")} error={errors.sku?.message} span="col-span-6 md:col-span-3">
                    <Input id="sku" dir="ltr" className="font-mono text-xs" {...register("sku")} />
                </Field>

                <Field
                    id="shortDescription"
                    label={t("shortDescription")}
                    error={errors.shortDescription?.message}
                    span="col-span-12"
                >
                    <Textarea id="shortDescription" rows={2} {...register("shortDescription")} />
                </Field>

                <Controller
                    control={control}
                    name="regularPriceMajor"
                    render={({ field }) => (
                        <Field
                            id="regularPriceMajor"
                            label={t("regularPrice")}
                            error={errors.regularPriceMajor?.message}
                            span="col-span-6 md:col-span-3"
                        >
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
                            span="col-span-6 md:col-span-3"
                        >
                            <CurrencyInput id="salePriceMajor" value={field.value} onChange={field.onChange} nullable />
                        </Field>
                    )}
                />

                <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                        <Field
                            id="status"
                            label={t("status")}
                            error={errors.status?.message}
                            span="col-span-6 md:col-span-3"
                        >
                            <Select
                                value={field.value}
                                onValueChange={(value) => field.onChange(value as ProductStatus)}
                            >
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
                        <Field id="brandId" label={t("brand")} span="col-span-6 md:col-span-3">
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
                    name="manageStock"
                    render={({ field }) => (
                        <ToggleRow
                            id="manageStock"
                            span="col-span-12 md:col-span-4"
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
                            <Field
                                id="stockQuantity"
                                label={t("stockQuantity")}
                                error={errors.stockQuantity?.message}
                                span="col-span-6 md:col-span-4"
                            >
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
                            <Field id="stockStatus" label={t("stockStatus")} span="col-span-6 md:col-span-4">
                                <Select
                                    value={field.value}
                                    onValueChange={(value) => field.onChange(value as StockStatus)}
                                >
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

                <Controller
                    control={control}
                    name="featured"
                    render={({ field }) => (
                        <ToggleRow
                            id="featured"
                            span="col-span-12 md:col-span-4"
                            title={t("featured")}
                            description={t("featuredHint")}
                            icon={<Sparkles className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                            compact
                        />
                    )}
                />

                <Controller
                    control={control}
                    name="categoryIdsCsv"
                    render={({ field }) => (
                        <Field
                            id="categoryIdsCsv"
                            label={t("categories")}
                            hint={t("idCsvHint")}
                            span="col-span-12 md:col-span-6"
                        >
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
                        <Field
                            id="tagIdsCsv"
                            label={t("tags")}
                            hint={t("idCsvHint")}
                            span="col-span-12 md:col-span-6"
                        >
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
        </form>
    );
}

interface FieldProps {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    span?: string;
    children: React.ReactNode;
}

function Field({ id, label, error, hint, span, children }: FieldProps) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-1", span)}>
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
    span?: string;
}

function ToggleRow({ id, title, description, icon, checked, onChange, compact, span }: ToggleRowProps) {
    return (
        <label
            htmlFor={id}
            className={cn(
                "flex h-9 cursor-pointer items-center gap-2 self-end rounded-md border border-border bg-background px-2.5 transition-colors hover:border-ring/40",
                compact ? "py-1" : "py-1.5",
                span,
                checked && "border-primary/40 bg-primary/5",
            )}
        >
            <span className={cn("shrink-0 text-muted-foreground", checked && "text-primary")}>{icon}</span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-xs">{title}</span>
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
