"use client";

import type { Locale } from "@calibra/shared/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

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

/**
 * The full Quick Edit form. Two-column layout (primary on logical start, secondary on logical
 * end); save is wired to `useQuickEditProduct` which optimistically updates the row in the React
 * Query cache. `Esc` cancels with a dirty-state confirm; `Cmd/Ctrl+S` saves.
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
        <form onSubmit={onSubmit} className="grid gap-8 p-6 lg:grid-cols-[1.4fr_1fr]">
            {/** Primary column */}
            <fieldset className="flex min-w-0 flex-col gap-4">
                <Field id="name" label={t("name")} error={errors.name?.message}>
                    <Input id="name" {...register("name")} />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field id="slug" label={t("slug")} error={errors.slug?.message}>
                        <Input id="slug" dir="ltr" className="font-mono text-xs" {...register("slug")} />
                    </Field>
                    <Field id="sku" label={t("sku")} error={errors.sku?.message}>
                        <Input id="sku" dir="ltr" className="font-mono text-xs" {...register("sku")} />
                    </Field>
                </div>

                <Field id="shortDescription" label={t("shortDescription")} error={errors.shortDescription?.message}>
                    <Textarea id="shortDescription" rows={3} {...register("shortDescription")} />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
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
                        name="featured"
                        render={({ field }) => (
                            <Field id="featured" label={t("featured")}>
                                <div className="inline-flex h-9 items-center gap-2">
                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    <span className="text-sm">{t("featuredHint")}</span>
                                </div>
                            </Field>
                        )}
                    />
                </div>
            </fieldset>

            {/** Secondary column */}
            <fieldset className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Controller
                        control={control}
                        name="regularPriceMajor"
                        render={({ field }) => (
                            <Field id="regularPriceMajor" label={t("regularPrice")} error={errors.regularPriceMajor?.message}>
                                <Input
                                    id="regularPriceMajor"
                                    type="number"
                                    inputMode="numeric"
                                    value={field.value ?? ""}
                                    onChange={(event) =>
                                        field.onChange(event.target.value === "" ? 0 : Number(event.target.value))
                                    }
                                />
                            </Field>
                        )}
                    />
                    <Controller
                        control={control}
                        name="salePriceMajor"
                        render={({ field }) => (
                            <Field id="salePriceMajor" label={t("salePrice")} error={errors.salePriceMajor?.message}>
                                <Input
                                    id="salePriceMajor"
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
                </div>

                <Controller
                    control={control}
                    name="manageStock"
                    render={({ field }) => (
                        <Field id="manageStock" label={t("manageStock")}>
                            <div className="inline-flex h-9 items-center gap-2">
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                                <span className="text-sm">{t("manageStockHint")}</span>
                            </div>
                        </Field>
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

                <Field id="categoryIdsCsv" label={t("categories")}>
                    <Input id="categoryIdsCsv" dir="ltr" placeholder="1, 2, 3" {...register("categoryIdsCsv")} />
                </Field>

                <Field id="tagIdsCsv" label={t("tags")}>
                    <Input id="tagIdsCsv" dir="ltr" placeholder="1, 2, 3" {...register("tagIdsCsv")} />
                </Field>

                <Controller
                    control={control}
                    name="brandId"
                    render={({ field }) => (
                        <Field id="brandId" label={t("brand")}>
                            <Input
                                id="brandId"
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
            </fieldset>

            <footer className="col-span-full -mx-6 flex items-center justify-between gap-3 border-border border-t bg-muted/40 px-6 py-3">
                <Link
                    href={`/products/${product.id}` as never}
                    className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground hover:underline"
                >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    {t("openFullEdit")}
                </Link>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                    <Button type="submit" disabled={mutation.isPending} className={cn(mutation.isPending && "opacity-70")}>
                        <Save className="size-4" aria-hidden="true" />
                        {t("save")}
                    </Button>
                </div>
            </footer>
        </form>
    );
}

interface FieldProps {
    id: string;
    label: string;
    error?: string;
    children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-xs">
                {label}
            </Label>
            {children}
            {error !== undefined && <p className="text-destructive text-xs">{error}</p>}
        </div>
    );
}
