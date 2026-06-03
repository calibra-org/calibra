"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { type Control, Controller, useForm, useWatch } from "react-hook-form";

import { MediaFieldPreview, type MediaFieldValue } from "#/components/media-picker";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { type AdminBrandingSettings, useBranding, useUpdateBranding } from "#/lib/queries/branding";
import { cn } from "#/lib/utils";

import { BrandingPreview } from "./branding-preview";
import { type BrandingForm, brandingFormSchema, PALETTE_TOKENS, type PaletteToken, toForm, toUpdate } from "./schema";

const FONTS = ["vazirmatn", "inter"] as const;

export function BrandingSettings({ initialData }: { initialData?: AdminBrandingSettings }) {
    const { data, isLoading } = useBranding(initialData);
    if (isLoading || !data) {
        return (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex flex-col gap-6">
                    <Skeleton className="h-44 w-full rounded-xl" />
                    <Skeleton className="h-52 w-full rounded-xl" />
                    <Skeleton className="h-72 w-full rounded-xl" />
                </div>
                <Skeleton className="h-72 w-full rounded-xl" />
            </div>
        );
    }
    return <BrandingSettingsForm data={data} />;
}

/** Mounted only once `data` exists so `useForm` seeds controlled inputs from the first render. */
function BrandingSettingsForm({ data }: { data: AdminBrandingSettings }) {
    const t = useTranslations("Branding");
    const update = useUpdateBranding();

    const form = useForm<BrandingForm>({ resolver: zodResolver(brandingFormSchema), defaultValues: toForm(data) });
    const { control, register, handleSubmit, reset, formState } = form;

    /** Live preview reflects the in-flight form, so the operator sees the effect before saving. */
    const preview = useWatch({ control });

    const onSubmit = handleSubmit((vals) => {
        update.mutate(toUpdate(vals), { onSuccess: () => reset(vals) });
    });

    return (
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex flex-col gap-6">
                {/* Identity */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("identity.title")}</CardTitle>
                        <CardDescription>{t("identity.subtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 pt-6">
                        <Field label={t("identity.name")} help={t("identity.nameHelp")}>
                            <Input {...register("name")} />
                        </Field>
                        <Field label={t("identity.tagline")} help={t("identity.taglineHelp")}>
                            <Input {...register("tagline")} />
                        </Field>
                    </CardContent>
                </Card>

                {/* Logo & favicon */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("assets.title")}</CardTitle>
                        <CardDescription>{t("assets.subtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
                        <Controller
                            control={control}
                            name="logo"
                            render={({ field }) => (
                                <MediaFieldPreview label={t("assets.logo")} value={field.value} onChange={field.onChange} />
                            )}
                        />
                        <Controller
                            control={control}
                            name="favicon"
                            render={({ field }) => (
                                <MediaFieldPreview
                                    label={t("assets.favicon")}
                                    value={field.value}
                                    onChange={field.onChange}
                                    aspectClassName="h-32 w-32"
                                />
                            )}
                        />
                    </CardContent>
                </Card>

                {/* Typography */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("typography.title")}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <Field label={t("typography.font")} help={t("typography.fontHelp")} className="max-w-xs">
                            <Controller
                                control={control}
                                name="font"
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger>
                                            <SelectValue>{(value) => t(`fonts.${value as (typeof FONTS)[number]}`)}</SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FONTS.map((f) => (
                                                <SelectItem key={f} value={f}>
                                                    {t(`fonts.${f}`)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                        </Field>
                    </CardContent>
                </Card>

                {/* Palette */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("palette.title")}</CardTitle>
                        <CardDescription>{t("palette.subtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
                        {PALETTE_TOKENS.map((token) => (
                            <ColorField key={token} control={control} token={token} label={t(`palette.${token}`)} invalidHint={t("invalidColor")} />
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Live preview — sticky beside the form on wide viewports */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm">{t("preview.title")}</span>
                        <span className="text-muted-foreground text-xs">{t("preview.subtitle")}</span>
                    </div>
                    <BrandingPreview
                        palette={(preview.palette ?? data.palette) as BrandingForm["palette"]}
                        name={preview.name ?? data.name}
                        tagline={preview.tagline ?? data.tagline}
                        logo={(preview.logo ?? data.logo) as MediaFieldValue | null}
                        font={(preview.font ?? data.font) as BrandingForm["font"]}
                    />
                </div>
            </aside>

            <StickyActionBar open={formState.isDirty}>
                <div className="flex items-center gap-4">
                    <span className={cn("text-sm", update.isError ? "text-destructive" : "text-muted-foreground")}>
                        {update.isError ? t("saveError") : t("unsaved")}
                    </span>
                    <Button type="button" variant="ghost" onClick={() => reset()} disabled={update.isPending}>
                        {t("discard")}
                    </Button>
                    <Button type="submit" disabled={!formState.isDirty || update.isPending} className="gap-2">
                        {update.isPending ? <Spinner className="size-4" /> : null}
                        {t("save")}
                    </Button>
                </div>
            </StickyActionBar>
        </form>
    );
}

function Field({
    label,
    help,
    className,
    children,
}: {
    label: string;
    help?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <Label className="text-sm">{label}</Label>
            {children}
            {help !== undefined ? <p className="text-muted-foreground text-xs">{help}</p> : null}
        </div>
    );
}

/** A single OKLCH color row: a swatch (renders the live value), a text input, and an inline error. */
function ColorField({
    control,
    token,
    label,
    invalidHint,
}: {
    control: Control<BrandingForm>;
    token: PaletteToken;
    label: string;
    invalidHint: string;
}) {
    return (
        <Controller
            control={control}
            name={`palette.${token}`}
            render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm">{label}</Label>
                    <div className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-9 shrink-0 rounded-md border border-border"
                            style={{ background: fieldState.invalid ? "transparent" : field.value }}
                        />
                        <Input {...field} dir="ltr" spellCheck={false} className="font-mono text-xs" aria-invalid={fieldState.invalid} />
                    </div>
                    {fieldState.invalid ? <p className="text-destructive text-xs">{invalidHint}</p> : null}
                </div>
            )}
        />
    );
}
