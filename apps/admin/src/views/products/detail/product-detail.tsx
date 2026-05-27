"use client";

import { cn } from "@calibra/shared";
import type { Locale } from "@calibra/shared/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, ExternalLink, Eye, Loader2, Save, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { DetailPageShell } from "#/components/sections/detail-page-shell";
import type { SectionSpec } from "#/components/sections/draggable-section-grid";
import { Button } from "#/components/ui/button";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { JalaliDateRangeInput } from "#/components/ui/jalali-date-range-input";
import { MoneyInput } from "#/components/ui/money-input";
import { RichTextEditor } from "#/components/ui/rich-text-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { type AdminProductDetailView, toAdminProductDetail } from "#/lib/adapters/product-detail";
import { useRouter } from "#/lib/i18n/navigation";
import { useCreateProduct, useUpdateProduct } from "#/lib/products/mutations";
import { useProduct, useSlugAvailability } from "#/lib/products/queries";

import { ConflictDialog } from "./conflict-dialog";
import { Field, ToggleRow } from "./form-primitives";
import { NavigationGuard } from "./navigation-guard";
import {
    emptyProductDetailValues,
    formValuesToPayload,
    type ProductDetailFormValues,
    productDetailSchema,
    productToFormValues,
} from "./schema";
import { AttributesBody } from "./sections/attributes-card";
import { BrandsBody } from "./sections/brands-card";
import { CategoriesBody } from "./sections/categories-card";
import { FeaturedImageBody } from "./sections/featured-image-card";
import { GalleryBody } from "./sections/gallery-card";
import { MediaUrlMapProvider } from "./sections/media-url-map";
import { TagsBody } from "./sections/tags-card";
import { VariationsBody } from "./sections/variations-card";

export interface ProductDetailProps {
    /** SDK-shape payload from the server component. Adapted client-side. */
    initialSdkPayload?: unknown;
    isNew?: boolean;
    taxClassOptions: { id: number; slug: string; name: string }[];
    shippingClassOptions: { id: number; slug: string; name: string }[];
}

const statusTone: Record<"draft" | "publish" | "pending" | "private", StatusTone> = {
    publish: "success",
    draft: "neutral",
    pending: "warning",
    private: "info",
};

/**
 * Client wrapper around the product detail form. Mounts the same `DetailPageShell` that
 * `orders/detail` uses: shared `PageHeader`, draggable + collapsible sections in the main
 * column, a 320px sidebar. Each card body is a leaf component below; the shell handles the
 * grip handles, chevrons, per-user layout persistence, and the two-column responsive grid.
 *
 * Save / status / dirty state live in `headerActions` per the
 * [`DETAIL_PAGE.md`](../../components/sections/DETAIL_PAGE.md) convention.
 *
 * Optimistic concurrency: the `If-Match` header carries the loaded product's `updated_at`;
 * a 409 surfaces the `ConflictDialog`.
 */
export function ProductDetail({ initialSdkPayload, isNew = false, taxClassOptions, shippingClassOptions }: ProductDetailProps) {
    const t = useTranslations("Products.detail");
    const tStatus = useTranslations("ProductStatus");
    const tType = useTranslations("Products.detail.types");
    const tDnd = useTranslations("Products.detail.dnd");
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
    const status = form.watch("status");
    const sku = form.watch("sku");
    const name = form.watch("name");
    const isSubmitting = form.formState.isSubmitting || update.isPending || create.isPending;

    const labels = { grabHandle: tDnd("grabHandle"), collapse: tDnd("collapse"), expand: tDnd("expand") };

    const mainSections: SectionSpec[] = useMemo(() => {
        const sections: SectionSpec[] = [
            { id: "general", title: t("sections.general"), body: <GeneralBody locale={locale} /> },
            { id: "description", title: t("sections.description"), body: <DescriptionBody /> },
        ];
        if (type !== "grouped") {
            sections.push({
                id: "pricing",
                title: t("sections.pricing"),
                body: <PricingBody externalUrlVariant={type === "external"} />,
            });
        }
        if (type === "simple") {
            sections.push({ id: "inventory", title: t("sections.inventory"), body: <InventoryBody /> });
        }
        if (type === "simple" || type === "variable") {
            sections.push({ id: "shipping", title: t("sections.shipping"), body: <ShippingBody /> });
        }
        if (type !== "external") {
            sections.push({
                id: "attributes",
                title: t("sections.attributes"),
                body: <AttributesBody productType={type} productId={initial?.id ?? null} ifMatch={initial?.updatedAt} />,
            });
        }
        if (type === "variable") {
            sections.push({
                id: "variations",
                title: t("sections.variations"),
                body: <VariationsBody productId={initial?.id ?? null} productType={type} />,
            });
        }
        sections.push({ id: "advanced", title: t("sections.advanced"), body: <AdvancedBody />, defaultCollapsed: true });
        return sections;
    }, [type, t, locale, initial?.id, initial?.updatedAt]);

    const sidebarSections: SectionSpec[] = useMemo(
        () => [
            { id: "publish", title: t("sections.publish"), body: <PublishBody /> },
            { id: "featuredImage", title: t("sections.image"), body: <FeaturedImageBody /> },
            { id: "gallery", title: t("sections.gallery"), body: <GalleryBody /> },
            { id: "categories", title: t("sections.categories"), body: <CategoriesBody /> },
            { id: "tags", title: t("sections.tags"), body: <TagsBody /> },
            { id: "brand", title: t("sections.brand"), body: <BrandsBody /> },
            { id: "tax", title: t("sections.tax"), body: <TaxBody options={taxClassOptions} />, defaultCollapsed: true },
            {
                id: "shippingClass",
                title: t("sections.shippingClass"),
                body: <ShippingClassBody options={shippingClassOptions} />,
                defaultCollapsed: true,
            },
        ],
        [t, taxClassOptions, shippingClassOptions],
    );

    const headerActions = (
        <div className="flex items-center gap-2">
            <Button
                type="button"
                onClick={() => void onSubmit()}
                disabled={(!form.formState.isDirty && !isNew) || isSubmitting}
                className="min-w-28"
            >
                {isSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                    <Save className="size-3.5" aria-hidden="true" />
                )}
                {isNew ? t("actions.create") : t("actions.save")}
            </Button>
        </div>
    );

    const titleNode = (
        <span className="flex flex-wrap items-center gap-2">
            <span className="truncate">{name || t("untitled")}</span>
            {sku !== null && sku.length > 0 ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">{sku}</span>
            ) : null}
            <span
                className={cn(
                    "rounded border border-border px-1.5 py-0.5 text-muted-foreground text-xs",
                    type === "variable" && "border-info/40 text-info",
                )}
            >
                {tType(type)}
            </span>
            <StatusBadge tone={statusTone[status]}>{tStatus(status)}</StatusBadge>
        </span>
    );

    const initialMediaSeeds = useMemo(
        () => (initial?.images ?? []).map((img) => ({ id: img.mediaId, url: img.url })),
        [initial?.images],
    );

    return (
        <FormProvider {...form}>
            <NavigationGuard when={form.formState.isDirty} />
            <MediaUrlMapProvider initial={initialMediaSeeds}>
                <form onSubmit={onSubmit}>
                    <DetailPageShell
                        title={titleNode}
                        subtitle={
                            initial?.updatedAt ? (
                                <span dir="ltr" className="text-muted-foreground text-xs">
                                    {t("lastEditedAt", {
                                        at: new Date(initial.updatedAt).toLocaleString(locale === "fa" ? "fa-IR" : "en-US"),
                                    })}
                                </span>
                            ) : undefined
                        }
                        headerActions={headerActions}
                        mainSections={mainSections}
                        sidebarSections={sidebarSections}
                        storageKeyPrefix="products.detail.sections"
                        labels={labels}
                    />
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
            </MediaUrlMapProvider>
        </FormProvider>
    );
}

function useFormFromCtx() {
    return useFormContext<ProductDetailFormValues>();
}

function GeneralBody({ locale }: { locale: Locale }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const tTip = useTranslations("Products.detail.tooltips");
    const tType = useTranslations("Products.detail.types");
    const tDesc = useTranslations("Products.detail.types.descriptions");
    const { control, register, watch, formState } = useFormFromCtx();
    const slug = watch("slug");
    const slugCheck = useSlugAvailability({ slug, locale });

    return (
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
                                <SelectValue>{(value) => (typeof value === "string" ? tType(value) : null)}</SelectValue>
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
                id="name"
                label={tField("name")}
                span="col-span-12 md:col-span-9"
                error={formState.errors.name?.message}
                helper={<HelperTooltip>{tTip("name")}</HelperTooltip>}
            >
                <Input id="name" {...register("name")} />
            </Field>

            <Field
                id="slug"
                label={tField("slug")}
                span="col-span-12 md:col-span-6"
                error={formState.errors.slug?.message}
                helper={<HelperTooltip>{tTip("slug")}</HelperTooltip>}
                hint={slugCheck.data === false ? t("slugTaken") : undefined}
            >
                <Input id="slug" dir="ltr" className="font-mono" {...register("slug")} />
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

            <Field
                id="shortDescription"
                label={tField("shortDescription")}
                span="col-span-12"
                helper={<HelperTooltip>{tTip("shortDescription")}</HelperTooltip>}
            >
                <Textarea id="shortDescription" rows={2} {...register("shortDescription")} />
            </Field>
        </div>
    );
}

function DescriptionBody() {
    const tField = useTranslations("Products.detail.fields");
    const { control } = useFormFromCtx();

    return (
        <Controller
            control={control}
            name="description"
            render={({ field }) => (
                <Field id="description" label={tField("description")}>
                    <RichTextEditor value={field.value ?? ""} onChange={field.onChange} dir="rtl" />
                </Field>
            )}
        />
    );
}

function PricingBody({ externalUrlVariant }: { externalUrlVariant: boolean }) {
    const tField = useTranslations("Products.detail.fields");
    const tTip = useTranslations("Products.detail.tooltips");
    const tTax = useTranslations("Products.detail.taxStatus");
    const { control, register } = useFormFromCtx();

    return (
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
                                            direction="future"
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
                                        <SelectValue>{(value) => (typeof value === "string" ? tTax(value) : null)}</SelectValue>
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
    );
}

function InventoryBody() {
    const tField = useTranslations("Products.detail.fields");
    const { control, register } = useFormFromCtx();

    return (
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
    );
}

function ShippingBody() {
    const tField = useTranslations("Products.detail.fields");
    const { control, register } = useFormFromCtx();

    return (
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
                <Input id="width" type="number" {...register("widthMm", { setValueAs: (v) => (v === "" ? null : Number(v)) })} />
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
    );
}

function AdvancedBody() {
    const tField = useTranslations("Products.detail.fields");
    const { control, register } = useFormFromCtx();

    return (
        <div className="grid grid-cols-12 gap-3">
            <Field id="purchaseNote" label={tField("purchaseNote")} span="col-span-12">
                <Textarea id="purchaseNote" rows={2} {...register("purchaseNote")} />
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
    );
}

function PublishBody() {
    const tField = useTranslations("Products.detail.fields");
    const tStatus = useTranslations("ProductStatus");
    const tVisibility = useTranslations("Products.detail.visibility");
    const { control } = useFormFromCtx();

    return (
        <div className="flex flex-col gap-3">
            <Controller
                control={control}
                name="status"
                render={({ field }) => (
                    <Field id="status" label={tField("status")}>
                        <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="status">
                                <SelectValue>{(value) => (typeof value === "string" ? tStatus(value) : null)}</SelectValue>
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
                                <SelectValue>{(value) => (typeof value === "string" ? tVisibility(value) : null)}</SelectValue>
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
    );
}

function TaxBody({ options }: { options: { id: number; slug: string; name: string }[] }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control } = useFormFromCtx();
    return (
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
                            <SelectValue>
                                {(value) =>
                                    value === "_none" || value === null || value === undefined
                                        ? t("noneSelected")
                                        : (options.find((opt) => String(opt.id) === String(value))?.name ?? String(value))
                                }
                            </SelectValue>
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
    );
}

function ShippingClassBody({ options }: { options: { id: number; slug: string; name: string }[] }) {
    const t = useTranslations("Products.detail");
    const tField = useTranslations("Products.detail.fields");
    const { control } = useFormFromCtx();
    return (
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
                            <SelectValue>
                                {(value) =>
                                    value === "_none" || value === null || value === undefined
                                        ? t("noneSelected")
                                        : (options.find((opt) => String(opt.id) === String(value))?.name ?? String(value))
                                }
                            </SelectValue>
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
    );
}
