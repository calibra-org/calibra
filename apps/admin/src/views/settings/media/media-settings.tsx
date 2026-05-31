"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, type UseFormRegister, useForm } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { Switch } from "#/components/ui/switch";
import { type AdminMediaSettings, useMediaSettings, useUpdateMediaSettings } from "#/lib/queries/media-settings";
import { cn } from "#/lib/utils";

import { type MediaForm, mediaFormSchema, toForm, toUpdate } from "./schema";

export function MediaSettings() {
    const { data, isLoading } = useMediaSettings();
    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-72 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
            </div>
        );
    }
    return <MediaSettingsForm data={data} />;
}

function MediaSettingsForm({ data }: { data: AdminMediaSettings }) {
    const t = useTranslations("Settings.media");
    const tRoot = useTranslations("Settings");
    const update = useUpdateMediaSettings();

    const form = useForm<MediaForm>({ resolver: zodResolver(mediaFormSchema), defaultValues: toForm(data) });
    const { control, register, handleSubmit, reset, formState } = form;

    const onSubmit = handleSubmit((vals) => {
        update.mutate(toUpdate(vals), { onSuccess: () => reset(vals) });
    });

    const canSave = formState.isDirty && !update.isPending;

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("imageSizes")}</CardTitle>
                    <CardDescription>{t("imageSizesSubtitle")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6 pt-6">
                    <SizeRow
                        label={t("thumbnail")}
                        register={register}
                        widthName="thumbnailWidth"
                        heightName="thumbnailHeight"
                        t={t}
                    >
                        <div className="flex items-center gap-2 pt-1.5">
                            <Controller
                                control={control}
                                name="thumbnailCrop"
                                render={({ field }) => (
                                    <Switch id="thumbnailCrop" checked={field.value} onCheckedChange={field.onChange} />
                                )}
                            />
                            <Label htmlFor="thumbnailCrop" className="text-muted-foreground text-xs leading-relaxed">
                                {t("thumbnailCrop")}
                            </Label>
                        </div>
                    </SizeRow>
                    <SizeRow
                        label={t("medium")}
                        register={register}
                        widthName="mediumWidth"
                        heightName="mediumHeight"
                        t={t}
                        max
                    />
                    <SizeRow label={t("large")} register={register} widthName="largeWidth" heightName="largeHeight" t={t} max />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("uploads")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5 pt-6">
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="organizeByDate" className="text-sm">
                            {t("organizeByDate")}
                        </Label>
                        <Controller
                            control={control}
                            name="organizeByDate"
                            render={({ field }) => (
                                <Switch id="organizeByDate" checked={field.value} onCheckedChange={field.onChange} />
                            )}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="maxUploadMb" className="text-sm">
                            {t("maxUpload")}
                        </Label>
                        <Input
                            id="maxUploadMb"
                            type="number"
                            min={1}
                            max={100}
                            {...register("maxUploadMb", { valueAsNumber: true })}
                            dir="ltr"
                            className="max-w-28 text-center"
                        />
                    </div>
                </CardContent>
            </Card>

            <StickyActionBar open={formState.isDirty}>
                <div className="flex items-center gap-4">
                    <span className={cn("text-sm", update.isError ? "text-destructive" : "text-muted-foreground")}>
                        {update.isError ? t("saveError") : t("unsaved")}
                    </span>
                    <Button type="button" variant="ghost" onClick={() => reset()} disabled={update.isPending}>
                        {t("discard")}
                    </Button>
                    <Button type="submit" disabled={!canSave} className="gap-2">
                        {update.isPending ? <Spinner className="size-4" /> : null}
                        {tRoot("save")}
                    </Button>
                </div>
            </StickyActionBar>
        </form>
    );
}

interface SizeRowProps {
    label: string;
    register: UseFormRegister<MediaForm>;
    widthName: "thumbnailWidth" | "mediumWidth" | "largeWidth";
    heightName: "thumbnailHeight" | "mediumHeight" | "largeHeight";
    t: (key: string) => string;
    /** When true, labels read "Max width / Max height" (medium + large are bounded, not cropped). */
    max?: boolean;
    children?: ReactNode;
}

/** One image-size row: a label + width/height number inputs, with optional extra control (crop). */
function SizeRow({ label, register, widthName, heightName, t, max, children }: SizeRowProps) {
    return (
        <div className="flex flex-col gap-2 border-b pb-5 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-end gap-4">
                <Label className="w-32 shrink-0 text-sm">{label}</Label>
                <NumberField label={max ? t("maxWidth") : t("width")}>
                    <Input
                        type="number"
                        min={1}
                        max={4096}
                        {...register(widthName, { valueAsNumber: true })}
                        dir="ltr"
                        className="w-24 text-center"
                    />
                </NumberField>
                <NumberField label={max ? t("maxHeight") : t("height")}>
                    <Input
                        type="number"
                        min={1}
                        max={4096}
                        {...register(heightName, { valueAsNumber: true })}
                        dir="ltr"
                        className="w-24 text-center"
                    />
                </NumberField>
            </div>
            {children}
        </div>
    );
}

function NumberField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-muted-foreground text-xs">{label}</Label>
            {children}
        </div>
    );
}
