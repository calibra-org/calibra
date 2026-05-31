"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { type Control, Controller, useForm } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { NumberField } from "#/components/ui/number-field";
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
                <Skeleton className="h-80 w-full rounded-xl" />
                <Skeleton className="h-44 w-full rounded-xl" />
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
    const { control, handleSubmit, reset, formState } = form;

    const onSubmit = handleSubmit((vals) => {
        update.mutate(toUpdate(vals), { onSuccess: () => reset(vals) });
    });

    const canSave = formState.isDirty && !update.isPending;

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("imageSizes")}</CardTitle>
                    <CardDescription className="max-w-prose">{t("imageSizesSubtitle")}</CardDescription>
                </CardHeader>
                <CardContent className="divide-y pt-2">
                    <SizeRow
                        control={control}
                        title={t("thumbnail")}
                        help={t("thumbnailHelp")}
                        widthName="thumbnailWidth"
                        heightName="thumbnailHeight"
                        widthLabel={t("width")}
                        heightLabel={t("height")}
                    >
                        <Controller
                            control={control}
                            name="thumbnailCrop"
                            render={({ field }) => (
                                <div className="mt-4 flex max-w-md items-center gap-2.5">
                                    <Switch id="thumbnailCrop" checked={field.value} onCheckedChange={field.onChange} />
                                    <Label htmlFor="thumbnailCrop" className="text-muted-foreground text-xs leading-relaxed">
                                        {t("thumbnailCrop")}
                                    </Label>
                                </div>
                            )}
                        />
                    </SizeRow>
                    <SizeRow
                        control={control}
                        title={t("medium")}
                        help={t("boundedHelp")}
                        widthName="mediumWidth"
                        heightName="mediumHeight"
                        widthLabel={t("maxWidth")}
                        heightLabel={t("maxHeight")}
                    />
                    <SizeRow
                        control={control}
                        title={t("large")}
                        help={t("boundedHelp")}
                        widthName="largeWidth"
                        heightName="largeHeight"
                        widthLabel={t("maxWidth")}
                        heightLabel={t("maxHeight")}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{t("uploads")}</CardTitle>
                </CardHeader>
                <CardContent className="divide-y pt-2">
                    <SettingRow title={t("organizeByDate")} help={t("organizeHelp")}>
                        <Controller
                            control={control}
                            name="organizeByDate"
                            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
                        />
                    </SettingRow>
                    <SettingRow title={t("maxUpload")} help={t("maxUploadHelp")} htmlFor="maxUploadMb">
                        <ControlledNumber
                            control={control}
                            name="maxUploadMb"
                            id="maxUploadMb"
                            min={1}
                            max={100}
                            suffix="MB"
                            className="w-32"
                        />
                    </SettingRow>
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
    control: Control<MediaForm>;
    title: string;
    help: string;
    widthName: "thumbnailWidth" | "mediumWidth" | "largeWidth";
    heightName: "thumbnailHeight" | "mediumHeight" | "largeHeight";
    widthLabel: string;
    heightLabel: string;
    children?: ReactNode;
}

/**
 * One image-size block: title + helper anchored to the start, a tight `width × height` cluster of
 * stepper inputs anchored to the end. `children` (the thumbnail crop toggle) sits under the row.
 */
function SizeRow({ control, title, help, widthName, heightName, widthLabel, heightLabel, children }: SizeRowProps) {
    return (
        <div className="py-5 first:pt-1 last:pb-1">
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-sm">{title}</span>
                    <p className="max-w-xs text-muted-foreground text-xs leading-relaxed">{help}</p>
                </div>
                <div className="flex items-end gap-3">
                    <Caption label={widthLabel}>
                        <ControlledNumber control={control} name={widthName} min={1} max={4096} suffix="px" className="w-32" />
                    </Caption>
                    <span className="pb-2.5 text-muted-foreground text-sm" aria-hidden="true">
                        ×
                    </span>
                    <Caption label={heightLabel}>
                        <ControlledNumber control={control} name={heightName} min={1} max={4096} suffix="px" className="w-32" />
                    </Caption>
                </div>
            </div>
            {children}
        </div>
    );
}

/** Justified label/helper-vs-control row used by the Uploads card (mirrors the toggle rhythm). */
function SettingRow({ title, help, htmlFor, children }: { title: string; help: string; htmlFor?: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-4 first:pt-1 last:pb-1">
            <div className="flex flex-col gap-0.5">
                <Label htmlFor={htmlFor} className="text-sm">
                    {title}
                </Label>
                <p className="max-w-md text-muted-foreground text-xs leading-relaxed">{help}</p>
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

function Caption({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">{label}</span>
            {children}
        </div>
    );
}

interface ControlledNumberProps {
    control: Control<MediaForm>;
    name: keyof MediaForm;
    id?: string;
    min: number;
    max: number;
    suffix: ReactNode;
    className?: string;
}

/** Bridges the Base UI {@link NumberField} to react-hook-form; transient empty input keeps the last value. */
function ControlledNumber({ control, name, id, min, max, suffix, className }: ControlledNumberProps) {
    return (
        <Controller
            control={control}
            name={name}
            render={({ field, fieldState }) => (
                <NumberField
                    id={id}
                    value={typeof field.value === "number" ? field.value : undefined}
                    onValueChange={(next) => {
                        if (next !== null) field.onChange(next);
                    }}
                    min={min}
                    max={max}
                    suffix={suffix}
                    className={className}
                    aria-invalid={fieldState.invalid}
                />
            )}
        />
    );
}
