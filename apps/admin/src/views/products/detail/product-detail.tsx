"use client";

import type { Locale } from "@calibra/shared/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, ExternalLink, Eye, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";

import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { JalaliDateRangeInput } from "#/components/ui/jalali-date-range-input";
import { MoneyInput } from "#/components/ui/money-input";
import { NumberField } from "#/components/ui/number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { type AdminProductDetailView, toAdminProductDetail } from "#/lib/adapters/product-detail";
import { useRouter } from "#/lib/i18n/navigation";
import { useCreateProduct, useUpdateProduct } from "#/lib/products/mutations";
import { useProduct, useSlugAvailability } from "#/lib/products/queries";

import { ConflictDialog } from "./conflict-dialog";
import { Field, ToggleRow } from "./form-primitives";
import { DetailHeader } from "./header";
import { NavigationGuard } from "./navigation-guard";
import {
    emptyProductDetailValues,
    formValuesToPayload,
    type ProductDetailFormValues,
    productDetailSchema,
    productToFormValues,
} from "./schema";

export interface ProductDetailProps {
    /** SDK-shape payload from the server component. Adapted client-side. */
    initialSdkPayload?: unknown;
    isNew?: boolean;
    taxClassOptions: { id: number; slug: string; name: string }[];
    shippingClassOptions: { id: number; slug: string; name: string }[];
}

/**
 * Client wrapper around the product detail form. Hosts the react-hook-form instance, renders the
 * sticky header + section grid, and threads the save mutation. Optimistic concurrency goes
 * through the `If-Match` header (carries the loaded product's `updated_at`); a 409 surfaces the
 * `ConflictDialog`.
 */
export function ProductDetail({ initialSdkPayload, isNew = false, taxClassOptions, shippingClassOptions }: ProductDetailProps) {
    const t = useTranslations("Products.detail");
    const router = useRouter();
    const locale = useLocale() as Locale;

    const initial: AdminProductDetailView | undefined = initialSdkPayload
        ? toAdminProductDetail(initialSdkPayload as never)
        : undefined;

    const product = useProduct(initial?.id ?? null, initial ? { initialData: initial } : undefined);

    const form = useForm<ProductDetailFormValues>({
        resolver: zodResolver(productDetailSchema),
        defaultValues: isNew ? emptyProductDetailValues() : initial ? productToFormValues(initial) : emptyProductDetailValues(),
        mode: "onSubmit",
    });

    useEffect(() => {
        if (product.data && !isNew) {
            form.reset(productToFormValues(product.data));
        }
    }, [product.data, isNew, form]);

    const update = useUpdateProduct(initial?.id ?? 0);
    const create = useCreateProduct();
    const [conflictUpdatedAt, setConflictUpdatedAt] = useState<string | null>(null);
    const [conflictOpen, setConflictOpen] = useState(false);

    const onSubmit = form.handleSubmit(async (values) => {
        const payload = formValuesToPayload(values);
        if (isNew) {
            try {
                const result = await create.mutateAsync({ body: payload });
                toast.add({ title: t("toasts.created"), data: { tone: "success" } });
                router.push(`/products/${result.data.id}`);
            } catch (error) {
                toast.add({ title: t("toasts.error"), description: String(error), data: { tone: "error" } });
            }
            return;
        }
        try {
            await update.mutateAsync({ body: payload, ifMatch: initial?.updatedAt });
            toast.add({ title: t("toasts.saved"), data: { tone: "success" } });
            form.reset(values);
        } catch (error) {
            const proxyError = error as { status?: number; body?: { data?: { updated_at?: string } } };
            if (proxyError.status === 409) {
                setConflictUpdatedAt(proxyError.body?.data?.updated_at ?? null);
                setConflictOpen(true);
                return;
            }
            toast.add({ title: t("toasts.error"), description: String(error), data: { tone: "error" } });
        }
    });

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void onSubmit();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onSubmit]);

    const type = form.watch("type");

    return (
        <FormProvider {...form}>
            <NavigationGuard when={form.formState.isDirty} />
            <DetailHeader
                titleFa={form.watch("translations.fa.name")}
                titleEn={form.watch("translations.en.name")}
                sku={form.watch("sku")}
                type={type}
                status={form.watch("status")}
                updatedAt={initial?.updatedAt ?? null}
                isDirty={form.formState.isDirty}
                isSubmitting={form.formState.isSubmitting || update.isPending || create.isPending}
                onSave={() => void onSubmit()}
                isNew={isNew}
            />

            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                    <GeneralCard locale={locale} />
                    <DescriptionCard />
                    {type !== "grouped" ? <PricingCard externalUrlVariant={type === "external"} /> : null}
                    {type === "simple" ? <InventoryCard /> : null}
                    {type === "simple" || type === "variable" ? <ShippingCard /> : null}
                    <AdvancedCard />
                    {type === "variable" ? (
                        <div className="rounded-md border border-border bg-card p-4">
                            <h2 className="font-semibold text-foreground text-sm">{t("variations.placeholderTitle")}</h2>
                            <p className="mt-1 text-muted-foreground text-xs">{t("variations.placeholderBody")}</p>
                        </div>
                    ) : null}
                </div>
                <div className="space-y-4">
                    <PublishCard />
                    <CategoriesSidebar />
                    <TagsSidebar />
                    <BrandSidebar />
                    <TaxClassSidebar options={taxClassOptions} />
                    <ShippingClassSidebar options={shippingClassOptions} />
                </div>
            </form>

            <ConflictDialog
                open={conflictOpen}
                serverUpdatedAt={conflictUpdatedAt}
                onReload={() => {
                    setConflictOpen(false);
                    void product.refetch();
                }}
                onOverwrite={async () => {
                    setConflictOpen(false);
                    try {
                        await update.mutateAsync({ body: formValuesToPayload(form.getValues()) });
                        toast.add({ title: t("toasts.saved"), data: { tone: "success" } });
                        form.reset(form.getValues());
                    } catch (error) {
                        toast.add({ title: t("toasts.error"), description: String(error), data: { tone: "error" } });
                    }
                }}
                onClose={() => setConflictOpen(false)}
            />
        </FormProvider>
    );
}

function SectionCard({ title, children, helper }: { title: string; helper?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="rounded-md border border-border bg-card">
            <div className="flex items-center gap-1 border-border border-b px-4 py-2">
                <h2 className="font-semibold text-foreground text-sm">{title}</h2>
                {helper}
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

function useFormFromCtx() {
    return useFormContext<ProductDetailFormValues>();
}

function GeneralCard({ locale }: { locale: Locale }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const tTip = useTranslations("Products.detail.tooltips");
    const tType = useTranslations("Products.detail.types");
    const tDesc = useTranslations("Products.detail.types.descriptions");
    const { control, register, watch, formState } = useFormFromCtx();
    const slug = watch("translations.fa.slug");
    const slugCheck = useSlugAvailability({ slug, locale });

    return (
        <SectionCard title={t("sections.general")}>
            <div className="grid grid-cols-12 gap-3">
                <Controller
                    control={control}
                    name="type"
                    render={({ field }) => (
                        <Field
                            id="type"
                            label={tField("type")}
                            span="col-span-12 md:col-span-3"
                            helper={<HelperTooltip>{tTip("type")}</HelperTooltip>}
                        >
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(["simple", "variable", "grouped", "external"] as const).map((v) => (
                                        <SelectItem key={v} value={v}>
                                            <div className="flex flex-col">
                                                <span>{tType(v)}</span>
                                                <span className="text-muted-foreground text-xs">{tDesc(v)}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    )}
                />

                <Field
                    id="name-fa"
                    label={`${tField("name")} (فا)`}
                    span="col-span-12 md:col-span-9"
                    error={formState.errors.translations?.fa?.name?.message}
                    helper={<HelperTooltip>{tTip("name")}</HelperTooltip>}
                >
                    <Input id="name-fa" {...register("translations.fa.name")} />
                </Field>

                <Field
                    id="slug-fa"
                    label={`${tField("slug")} (فا)`}
                    span="col-span-12 md:col-span-6"
                    error={formState.errors.translations?.fa?.slug?.message}
                    helper={<HelperTooltip>{tTip("slug")}</HelperTooltip>}
                    hint={slugCheck.data === false ? t("slugTaken") : undefined}
                >
                    <Input id="slug-fa" dir="ltr" className="font-mono" {...register("translations.fa.slug")} />
                </Field>

                <Field
                    id="sku"
                    label={tField("sku")}
                    span="col-span-12 md:col-span-3"
                    helper={<HelperTooltip>{tTip("sku")}</HelperTooltip>}
                >
                    <Input
                        id="sku"
                        dir="ltr"
                        className="font-mono"
                        {...register("sku", { setValueAs: (v) => (v === "" ? null : v) })}
                    />
                </Field>

                <Field
                    id="gtin"
                    label={tField("gtin")}
                    span="col-span-12 md:col-span-3"
                    helper={<HelperTooltip>{tTip("gtin")}</HelperTooltip>}
                >
                    <Input
                        id="gtin"
                        dir="ltr"
                        className="font-mono"
                        {...register("gtin", { setValueAs: (v) => (v === "" ? null : v) })}
                    />
                </Field>

                <Field id="name-en" label={`${tField("name")} (en)`} span="col-span-12 md:col-span-6">
                    <Input id="name-en" dir="ltr" {...register("translations.en.name")} />
                </Field>

                <Field id="slug-en" label={`${tField("slug")} (en)`} span="col-span-12 md:col-span-6">
                    <Input id="slug-en" dir="ltr" className="font-mono" {...register("translations.en.slug")} />
                </Field>

                <Field
                    id="short-fa"
                    label={`${tField("shortDescription")} (فا)`}
                    span="col-span-12"
                    helper={<HelperTooltip>{tTip("shortDescription")}</HelperTooltip>}
                >
                    <Textarea id="short-fa" rows={2} {...register("translations.fa.shortDescription")} />
                </Field>
            </div>
        </SectionCard>
    );
}

function DescriptionCard() {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const tTip = useTranslations("Products.detail.tooltips");
    const { control } = useFormFromCtx();

    return (
        <SectionCard title={t("sections.description")} helper={<HelperTooltip>{tTip("description")}</HelperTooltip>}>
            <Controller
                control={control}
                name="translations.fa.description"
                render={({ field }) => (
                    <Field id="description-fa" label={`${tField("description")} (فا)`}>
                        <Textarea
                            id="description-fa"
                            rows={6}
                            value={field.value ?? ""}
                            onChange={(event) => field.onChange(event.target.value)}
                        />
                    </Field>
                )}
            />
        </SectionCard>
    );
}

function PricingCard({ externalUrlVariant }: { externalUrlVariant: boolean }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const tTip = useTranslations("Products.detail.tooltips");
    const tTax = useTranslations("Products.detail.taxStatus");
    const { control, register } = useFormFromCtx();

    return (
        <SectionCard title={t("sections.pricing")}>
            <div className="grid grid-cols-12 gap-3">
                <Controller
                    control={control}
                    name="regularPriceToman"
                    render={({ field }) => (
                        <Field
                            id="regularPrice"
                            label={tField("regularPrice")}
                            span="col-span-12 md:col-span-6"
                            helper={<HelperTooltip>{tTip("regularPrice")}</HelperTooltip>}
                        >
                            <MoneyInput
                                id="regularPrice"
                                valueMinor={field.value === null ? null : Math.round(field.value * 10)}
                                onChangeMinor={(next) => field.onChange(next === null ? null : next / 10)}
                                min={0}
                                step={1000}
                            />
                        </Field>
                    )}
                />

                <Controller
                    control={control}
                    name="salePriceToman"
                    render={({ field }) => (
                        <Field
                            id="salePrice"
                            label={tField("salePrice")}
                            span="col-span-12 md:col-span-6"
                            helper={<HelperTooltip>{tTip("salePrice")}</HelperTooltip>}
                        >
                            <MoneyInput
                                id="salePrice"
                                valueMinor={field.value === null ? null : Math.round(field.value * 10)}
                                onChangeMinor={(next) => field.onChange(next === null ? null : next / 10)}
                                nullable
                                min={0}
                                step={1000}
                            />
                        </Field>
                    )}
                />

                {externalUrlVariant ? (
                    <Field
                        id="externalUrl"
                        label={tField("externalUrl")}
                        span="col-span-12"
                        helper={<HelperTooltip>{tTip("externalUrl")}</HelperTooltip>}
                    >
                        <Input
                            id="externalUrl"
                            dir="ltr"
                            placeholder="https://"
                            {...register("externalUrl", { setValueAs: (v) => (v === "" ? null : v) })}
                        />
                    </Field>
                ) : (
                    <>
                        <Controller
                            control={control}
                            name="saleStartsAt"
                            render={({ field: starts }) => (
                                <Controller
                                    control={control}
                                    name="saleEndsAt"
                                    render={({ field: ends }) => (
                                        <Field
                                            id="saleWindow"
                                            label={tField("saleWindow")}
                                            span="col-span-12 md:col-span-6"
                                            helper={<HelperTooltip>{tTip("saleWindow")}</HelperTooltip>}
                                        >
                                            <JalaliDateRangeInput
                                                value={{ from: starts.value, to: ends.value }}
                                                onChange={(next) => {
                                                    starts.onChange(next.from ?? null);
                                                    ends.onChange(next.to ?? null);
                                                }}
                                            />
                                        </Field>
                                    )}
                                />
                            )}
                        />
                        <Controller
                            control={control}
                            name="taxStatus"
                            render={({ field }) => (
                                <Field id="taxStatus" label={tField("taxStatus")} span="col-span-12 md:col-span-6">
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger id="taxStatus">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(["taxable", "shipping", "none"] as const).map((v) => (
                                                <SelectItem key={v} value={v}>
                                                    {tTax(v)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        />
                    </>
                )}
            </div>
        </SectionCard>
    );
}

function InventoryCard() {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control, register } = useFormFromCtx();

    return (
        <SectionCard title={t("sections.inventory")}>
            <div className="grid grid-cols-12 gap-3">
                <Field id="sku-inv" label={tField("sku")} span="col-span-12 md:col-span-6">
                    <Input
                        id="sku-inv"
                        dir="ltr"
                        className="font-mono"
                        {...register("sku", { setValueAs: (v) => (v === "" ? null : v) })}
                    />
                </Field>
                <Field id="gtin-inv" label={tField("gtin")} span="col-span-12 md:col-span-6">
                    <Input
                        id="gtin-inv"
                        dir="ltr"
                        className="font-mono"
                        {...register("gtin", { setValueAs: (v) => (v === "" ? null : v) })}
                    />
                </Field>
                <Controller
                    control={control}
                    name="soldIndividually"
                    render={({ field }) => (
                        <ToggleRow
                            id="soldIndividually"
                            span="col-span-12 md:col-span-4"
                            title={tField("soldIndividually")}
                            icon={<Boxes className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
            </div>
        </SectionCard>
    );
}

function ShippingCard() {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control, register } = useFormFromCtx();

    return (
        <SectionCard title={t("sections.shipping")}>
            <div className="grid grid-cols-12 gap-3">
                <Field id="weight" label={tField("weight")} span="col-span-6 md:col-span-3">
                    <Input
                        id="weight"
                        type="number"
                        {...register("weightGrams", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    />
                </Field>
                <Field id="length" label={tField("length")} span="col-span-6 md:col-span-3">
                    <Input
                        id="length"
                        type="number"
                        {...register("lengthMm", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    />
                </Field>
                <Field id="width" label={tField("width")} span="col-span-6 md:col-span-3">
                    <Input
                        id="width"
                        type="number"
                        {...register("widthMm", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    />
                </Field>
                <Field id="height" label={tField("height")} span="col-span-6 md:col-span-3">
                    <Input
                        id="height"
                        type="number"
                        {...register("heightMm", { setValueAs: (v) => (v === "" ? null : Number(v)) })}
                    />
                </Field>
                <Controller
                    control={control}
                    name="virtual"
                    render={({ field }) => (
                        <ToggleRow
                            id="virtual"
                            span="col-span-6 md:col-span-4"
                            title={tField("virtual")}
                            icon={<ExternalLink className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
                <Controller
                    control={control}
                    name="downloadable"
                    render={({ field }) => (
                        <ToggleRow
                            id="downloadable"
                            span="col-span-6 md:col-span-4"
                            title={tField("downloadable")}
                            icon={<ExternalLink className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
            </div>
        </SectionCard>
    );
}

function AdvancedCard() {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control, register } = useFormFromCtx();

    return (
        <SectionCard title={t("sections.advanced")}>
            <div className="grid grid-cols-12 gap-3">
                <Controller
                    control={control}
                    name="menuOrder"
                    render={({ field }) => (
                        <Field id="menuOrder" label={tField("menuOrder")} span="col-span-6 md:col-span-3">
                            <NumberField
                                id="menuOrder"
                                value={field.value}
                                onValueChange={(next) => field.onChange(typeof next === "number" ? next : 0)}
                                min={0}
                            />
                        </Field>
                    )}
                />
                <Field id="purchaseNote" label={tField("purchaseNote")} span="col-span-12">
                    <Textarea id="purchaseNote" rows={2} {...register("translations.fa.purchaseNote")} />
                </Field>
                <Controller
                    control={control}
                    name="reviewsAllowed"
                    render={({ field }) => (
                        <ToggleRow
                            id="reviewsAllowed"
                            span="col-span-6 md:col-span-4"
                            title={tField("enableReviews")}
                            icon={<Sparkles className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
                <Controller
                    control={control}
                    name="posAvailable"
                    render={({ field }) => (
                        <ToggleRow
                            id="posAvailable"
                            span="col-span-6 md:col-span-4"
                            title={tField("posAvailable")}
                            icon={<Eye className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
            </div>
        </SectionCard>
    );
}

function PublishCard() {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const tStatus = useTranslations("ProductStatus");
    const tVisibility = useTranslations("Products.detail.visibility");
    const { control } = useFormFromCtx();

    return (
        <SectionCard title={t("sections.publish")}>
            <div className="grid grid-cols-1 gap-3">
                <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                        <Field id="status" label={tField("status")}>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(["draft", "publish", "pending", "private"] as const).map((v) => (
                                        <SelectItem key={v} value={v}>
                                            {tStatus(v)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    )}
                />
                <Controller
                    control={control}
                    name="catalogVisibility"
                    render={({ field }) => (
                        <Field id="visibility" label={tField("visibility")}>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger id="visibility">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(["visible", "catalog", "search", "hidden"] as const).map((v) => (
                                        <SelectItem key={v} value={v}>
                                            {tVisibility(v)}
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
                        <ToggleRow
                            id="featured"
                            title={tField("featured")}
                            icon={<Sparkles className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
            </div>
        </SectionCard>
    );
}

function CategoriesSidebar() {
    const t = useTranslations("Products.detail");
    const { register } = useFormFromCtx();
    return (
        <SectionCard title={t("sections.categories")}>
            <Field id="categoryIds" label={t("sections.categories")} hint={t("idListHint")}>
                <Input
                    id="categoryIds"
                    dir="ltr"
                    placeholder="e.g. 1, 4, 7"
                    {...register("categoryIds", {
                        setValueAs: (v: unknown) =>
                            String(v ?? "")
                                .split(",")
                                .map((s) => Number(s.trim()))
                                .filter((n) => Number.isFinite(n) && n > 0),
                    })}
                />
            </Field>
        </SectionCard>
    );
}

function TagsSidebar() {
    const t = useTranslations("Products.detail");
    const { register } = useFormFromCtx();
    return (
        <SectionCard title={t("sections.tags")}>
            <Field id="tagIds" label={t("sections.tags")} hint={t("idListHint")}>
                <Input
                    id="tagIds"
                    dir="ltr"
                    placeholder="e.g. 2, 5"
                    {...register("tagIds", {
                        setValueAs: (v: unknown) =>
                            String(v ?? "")
                                .split(",")
                                .map((s) => Number(s.trim()))
                                .filter((n) => Number.isFinite(n) && n > 0),
                    })}
                />
            </Field>
        </SectionCard>
    );
}

function BrandSidebar() {
    const t = useTranslations("Products.detail");
    const { register } = useFormFromCtx();
    return (
        <SectionCard title={t("sections.brand")}>
            <Field id="brandId" label={t("sections.brand")} hint={t("idHint")}>
                <Input
                    id="brandId"
                    dir="ltr"
                    type="number"
                    {...register("brandId", {
                        setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                    })}
                />
            </Field>
        </SectionCard>
    );
}

function TaxClassSidebar({ options }: { options: { id: number; slug: string; name: string }[] }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control } = useFormFromCtx();
    return (
        <SectionCard title={t("sections.tax")}>
            <Controller
                control={control}
                name="taxClassId"
                render={({ field }) => (
                    <Field id="taxClassId" label={tField("taxClass")}>
                        <Select
                            value={field.value === null ? "_none" : String(field.value)}
                            onValueChange={(v) => field.onChange(v === "_none" ? null : Number(v))}
                        >
                            <SelectTrigger id="taxClassId">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="_none">{t("noneSelected")}</SelectItem>
                                {options.map((opt) => (
                                    <SelectItem key={opt.id} value={String(opt.id)}>
                                        {opt.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
            />
        </SectionCard>
    );
}

function ShippingClassSidebar({ options }: { options: { id: number; slug: string; name: string }[] }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control } = useFormFromCtx();
    return (
        <SectionCard title={t("sections.shippingClass")}>
            <Controller
                control={control}
                name="shippingClassId"
                render={({ field }) => (
                    <Field id="shippingClassId" label={tField("shippingClass")}>
                        <Select
                            value={field.value === null ? "_none" : String(field.value)}
                            onValueChange={(v) => field.onChange(v === "_none" ? null : Number(v))}
                        >
                            <SelectTrigger id="shippingClassId">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="_none">{t("noneSelected")}</SelectItem>
                                {options.map((opt) => (
                                    <SelectItem key={opt.id} value={String(opt.id)}>
                                        {opt.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
            />
        </SectionCard>
    );
}
