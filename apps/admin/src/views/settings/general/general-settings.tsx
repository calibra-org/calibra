"use client";

import type { Locale } from "@calibra/shared/i18n";
import { formatMoney } from "@calibra/shared/money";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { Switch } from "#/components/ui/switch";
import { type AdminGeneralSettings, useGeneralSettings, useUpdateGeneralSettings } from "#/lib/queries/general-settings";
import { cn } from "#/lib/utils";

import { type GeneralForm, generalFormSchema, previewConfig, toForm, toUpdate } from "./schema";

/** A sample BASE-minor amount (≈ 125,000 Toman) used for the live currency preview. */
const PREVIEW_AMOUNT = 1_250_000;

export function GeneralSettings() {
    const { data, isLoading } = useGeneralSettings();
    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-56 w-full rounded-xl" />
            </div>
        );
    }
    return <GeneralSettingsForm data={data} />;
}

/**
 * Mounted only once `data` exists so `useForm` seeds `defaultValues` from the first render — the
 * Select/Switch controls are controlled from the start (no uncontrolled→controlled flip).
 */
function GeneralSettingsForm({ data }: { data: AdminGeneralSettings }) {
    const t = useTranslations("Settings.general");
    const tRoot = useTranslations("Settings");
    const locale = useLocale() as Locale;
    const update = useUpdateGeneralSettings();

    const form = useForm<GeneralForm>({ resolver: zodResolver(generalFormSchema), defaultValues: toForm(data) });
    const { control, register, handleSubmit, reset, watch, formState } = form;

    const { currencies, provinces, countries } = data.options;
    const values = watch();
    const sepEqual = values.thousandSep !== undefined && values.thousandSep === values.decimalSep;
    const preview = values.currencyDisplay
        ? formatMoney(PREVIEW_AMOUNT, previewConfig(values, currencies), { locale: locale === "fa" ? "fa" : "en" })
        : "";

    const onSubmit = handleSubmit((vals) => {
        if (vals.thousandSep === vals.decimalSep) return;
        update.mutate(toUpdate(vals), { onSuccess: () => reset(vals) });
    });

    const canSave = formState.isDirty && !sepEqual && !update.isPending;

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-6 pb-4">
            {/* Store Address */}
            <Card>
                <CardHeader className="border-b pb-4">
                    <CardTitle className="text-base">{t("storeAddress.title")}</CardTitle>
                    <CardDescription>{t("storeAddress.subtitle")}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
                    <Field label={t("storeAddress.address1")} className="md:col-span-2">
                        <Input {...register("storeAddress1")} />
                    </Field>
                    <Field label={t("storeAddress.address2")} className="md:col-span-2">
                        <Input {...register("storeAddress2")} />
                    </Field>
                    <Field label={t("storeAddress.country")}>
                        <Controller
                            control={control}
                            name="country"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {countries.map((c) => (
                                            <SelectItem key={c.code} value={c.code} disabled={!c.enabled}>
                                                {c.name[locale]}
                                                {!c.enabled ? ` — ${t("comingSoon")}` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                    <Field label={t("storeAddress.state")}>
                        <Controller
                            control={control}
                            name="storeState"
                            render={({ field }) => (
                                <Select
                                    value={field.value === "" ? "__none__" : field.value}
                                    onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("storeAddress.statePlaceholder")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">{t("storeAddress.statePlaceholder")}</SelectItem>
                                        {provinces.map((p) => (
                                            <SelectItem key={p.code} value={p.code}>
                                                {p.name[locale]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                    <Field label={t("storeAddress.city")}>
                        <Input {...register("storeCity")} />
                    </Field>
                    <Field label={t("storeAddress.postcode")}>
                        <Input {...register("storePostcode")} dir="ltr" />
                    </Field>
                </CardContent>
            </Card>

            {/* General options */}
            <Card>
                <CardHeader className="border-b pb-4">
                    <CardTitle className="text-base">{t("generalOptions.title")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-6">
                    <SelectField
                        control={control}
                        name="sellingLocations"
                        label={t("generalOptions.selling")}
                        options={[
                            { value: "all", label: t("generalOptions.sellingAll") },
                            { value: "all_except", label: t("generalOptions.sellingAllExcept") },
                            { value: "specific", label: t("generalOptions.sellingSpecific") },
                        ]}
                    />
                    <SelectField
                        control={control}
                        name="shippingLocations"
                        label={t("generalOptions.shipping")}
                        options={[
                            { value: "", label: t("generalOptions.shippingSell") },
                            { value: "all", label: t("generalOptions.shippingAll") },
                            { value: "specific", label: t("generalOptions.shippingSpecific") },
                            { value: "disabled", label: t("generalOptions.shippingDisabled") },
                        ]}
                    />
                    <SelectField
                        control={control}
                        name="defaultCustomerLocation"
                        label={t("generalOptions.customer")}
                        options={[
                            { value: "none", label: t("generalOptions.customerNone") },
                            { value: "base", label: t("generalOptions.customerBase") },
                            { value: "geolocation", label: t("generalOptions.customerGeo") },
                            { value: "geolocation_ajax", label: t("generalOptions.customerGeoCache") },
                        ]}
                    />
                    <ToggleRow label={t("generalOptions.autocomplete")} description={t("generalOptions.autocompleteHelp")}>
                        <Controller
                            control={control}
                            name="addressAutocomplete"
                            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled />}
                        />
                    </ToggleRow>
                </CardContent>
            </Card>

            {/* Taxes and coupons */}
            <Card>
                <CardHeader className="border-b pb-4">
                    <CardTitle className="text-base">{t("taxes.title")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 pt-2">
                    <ToggleRow label={t("taxes.enable")} description={t("taxes.enableHelp")}>
                        <Controller
                            control={control}
                            name="taxesEnabled"
                            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                        />
                    </ToggleRow>
                    <ToggleRow label={t("taxes.coupons")} description={t("taxes.couponsHelp")}>
                        <Controller
                            control={control}
                            name="couponsEnabled"
                            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                        />
                    </ToggleRow>
                    <ToggleRow label={t("taxes.sequential")} description={t("taxes.sequentialHelp")}>
                        <Controller
                            control={control}
                            name="calcDiscountsSequentially"
                            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                        />
                    </ToggleRow>
                </CardContent>
            </Card>

            {/* Currency options */}
            <Card>
                <CardHeader className="border-b pb-4">
                    <CardTitle className="text-base">{t("currency.title")}</CardTitle>
                    <CardDescription>{t("currency.subtitle")}</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-2">
                    <Field label={t("currency.currency")}>
                        <Controller
                            control={control}
                            name="currencyDisplay"
                            render={({ field }) => (
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {currencies.map((c) => (
                                            <SelectItem key={c.code} value={c.code} disabled={!c.enabled}>
                                                {c.name[locale]} ({c.code}){!c.enabled ? ` — ${t("comingSoon")}` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </Field>
                    <SelectField
                        control={control}
                        name="currencyPosition"
                        label={t("currency.position")}
                        options={[
                            { value: "left", label: t("currency.posLeft") },
                            { value: "right", label: t("currency.posRight") },
                            { value: "left_space", label: t("currency.posLeftSpace") },
                            { value: "right_space", label: t("currency.posRightSpace") },
                        ]}
                    />
                    <Field label={t("currency.thousandSep")}>
                        <Input {...register("thousandSep")} dir="ltr" className="text-center" />
                    </Field>
                    <Field label={t("currency.decimalSep")} error={sepEqual ? t("currency.sepEqual") : undefined}>
                        <Input {...register("decimalSep")} dir="ltr" className="text-center" aria-invalid={sepEqual} />
                    </Field>
                    <Field label={t("currency.numDecimals")}>
                        <Input type="number" min={0} max={4} {...register("numDecimals", { valueAsNumber: true })} dir="ltr" />
                    </Field>
                    <div className="flex flex-col justify-end gap-1.5">
                        <span className="text-muted-foreground text-xs">{t("currency.preview")}</span>
                        <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 font-medium text-sm" dir="rtl">
                            {preview}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <StickyActionBar open={formState.isDirty}>
                <div className="flex items-center gap-4">
                    <span className="text-muted-foreground text-sm">{update.isError ? t("saveError") : t("unsaved")}</span>
                    <Button type="button" variant="ghost" onClick={() => reset()} disabled={update.isPending}>
                        {t("discard")}
                    </Button>
                    <Button type="submit" disabled={!canSave}>
                        {update.isPending ? <Spinner className="size-4" /> : null}
                        {tRoot("save")}
                    </Button>
                </div>
            </StickyActionBar>
        </form>
    );
}

function Field({
    label,
    error,
    className,
    children,
}: {
    label: string;
    error?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <Label className="text-sm">{label}</Label>
            {children}
            {error !== undefined ? <p className="text-destructive text-xs">{error}</p> : null}
        </div>
    );
}

function ToggleRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
                <Label className="text-sm">{label}</Label>
                {description !== undefined ? <p className="text-muted-foreground text-xs">{description}</p> : null}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

interface SelectFieldProps {
    // biome-ignore lint/suspicious/noExplicitAny: react-hook-form Control generic is verbose; the field name is type-checked at the call site.
    control: any;
    name: string;
    label: string;
    options: { value: string; label: string }[];
}

function SelectField({ control, name, label, options }: SelectFieldProps) {
    return (
        <Field label={label}>
            <Controller
                control={control}
                name={name}
                render={({ field }) => (
                    <Select
                        value={field.value === "" ? "__empty__" : field.value}
                        onValueChange={(v) => field.onChange(v === "__empty__" ? "" : v)}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((o) => (
                                <SelectItem
                                    key={o.value === "" ? "__empty__" : o.value}
                                    value={o.value === "" ? "__empty__" : o.value}
                                >
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            />
        </Field>
    );
}
