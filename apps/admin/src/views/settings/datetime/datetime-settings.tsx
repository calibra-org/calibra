"use client";

import type { Locale } from "@calibra/shared/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Radio, RadioGroup } from "#/components/ui/radio-group";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { StickyActionBar } from "#/components/ui/sticky-action-bar";
import { formatWithPattern } from "#/lib/format";
import { type AdminDateTimeSettings, useDateTimeSettings, useUpdateDateTimeSettings } from "#/lib/queries/datetime-settings";
import { cn } from "#/lib/utils";

import { type DateTimeForm, datetimeFormSchema, toForm, toUpdate } from "./schema";

/** Fixed reference instant for previews — May 21 2026, 12:33 (Jalali 10 Khordad 1405). Deterministic. */
const PREVIEW_DATE = new Date(2026, 4, 21, 12, 33, 0);

/** date-fns format-token reference (the docs the patterns follow). */
const DOCS_URL = "https://date-fns.org/docs/format";

const CUSTOM = "__custom__";

type Preset = AdminDateTimeSettings["presets"]["date"][number];

export function DateTimeSettings() {
    const { data, isLoading } = useDateTimeSettings();
    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-6">
                <Skeleton className="h-72 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }
    return <DateTimeSettingsForm data={data} />;
}

function DateTimeSettingsForm({ data }: { data: AdminDateTimeSettings }) {
    const t = useTranslations("Settings.datetime");
    const tRoot = useTranslations("Settings");
    const update = useUpdateDateTimeSettings();

    const form = useForm<DateTimeForm>({ resolver: zodResolver(datetimeFormSchema), defaultValues: toForm(data) });
    const { control, handleSubmit, reset, formState } = form;

    const onSubmit = handleSubmit((vals) => {
        update.mutate(toUpdate(vals), { onSuccess: () => reset(vals) });
    });

    const canSave = formState.isDirty && !update.isPending;

    return (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <Controller
                control={control}
                name="dateFormat"
                render={({ field }) => (
                    <FormatSection
                        title={t("dateTitle")}
                        subtitle={t("dateSubtitle")}
                        presets={data.presets.date}
                        value={field.value}
                        onChange={field.onChange}
                        customInputLabel={t("customDate")}
                    />
                )}
            />

            <Controller
                control={control}
                name="timeFormat"
                render={({ field }) => (
                    <FormatSection
                        title={t("timeTitle")}
                        subtitle={t("timeSubtitle")}
                        presets={data.presets.time}
                        value={field.value}
                        onChange={field.onChange}
                        customInputLabel={t("customTime")}
                    />
                )}
            />

            <TokenLegend />

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

interface FormatSectionProps {
    title: string;
    subtitle: string;
    presets: Preset[];
    value: string;
    onChange: (next: string) => void;
    customInputLabel: string;
}

/** One format card: preset radios (each showing its rendered example) + a custom-pattern row. */
function FormatSection({ title, subtitle, presets, value, onChange, customInputLabel }: FormatSectionProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Settings.datetime");
    const tPreset = useTranslations("Settings.datetime.preset");

    const matchesPreset = presets.some((p) => p.pattern === value);
    const [customMode, setCustomMode] = useState(!matchesPreset);
    const isCustom = customMode || !matchesPreset;
    const selected = isCustom ? CUSTOM : value;

    const handleRadio = (next: string) => {
        if (next === CUSTOM) {
            setCustomMode(true);
            return;
        }
        setCustomMode(false);
        onChange(next);
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-6">
                <RadioGroup value={selected} onValueChange={(v) => handleRadio(String(v))} aria-label={title}>
                    {presets.map((preset) => (
                        <div key={preset.pattern} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                            <span className="flex items-center gap-2.5">
                                <Radio value={preset.pattern} />
                                <span className="text-sm">{tPreset(preset.label_key)}</span>
                                <code
                                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs"
                                    dir="ltr"
                                >
                                    {preset.pattern}
                                </code>
                            </span>
                            <span className="text-muted-foreground text-sm tabular-nums">
                                {formatWithPattern(PREVIEW_DATE, preset.pattern, locale)}
                            </span>
                        </div>
                    ))}
                    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
                        <span className="flex items-center gap-2.5">
                            <Radio value={CUSTOM} />
                            <span className="text-sm">{t("custom")}</span>
                        </span>
                        {isCustom ? (
                            <Input
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                                dir="ltr"
                                className="max-w-60 font-mono"
                                aria-label={customInputLabel}
                            />
                        ) : null}
                    </div>
                </RadioGroup>
                <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2">
                    <Label className="text-sm">{t("preview")}:</Label>
                    <span className="font-medium text-sm" dir="auto">
                        {value.length > 0 ? formatWithPattern(PREVIEW_DATE, value, locale) : "—"}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

/** Collapsible token cheat-sheet + docs link — beats WordPress's cryptic PHP letter table. */
function TokenLegend() {
    const t = useTranslations("Settings.datetime");
    const tokens = ["yyyy", "MMMM", "MM", "dd", "d", "HH", "h", "mm", "ss", "a"] as const;
    return (
        <details className="rounded-lg border bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">{t("tokensTitle")}</summary>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                {tokens.map((token) => (
                    <div key={token} className="flex items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs" dir="ltr">
                            {token}
                        </code>
                        <dd className="text-muted-foreground text-xs">{t(`tokens.${token}`)}</dd>
                    </div>
                ))}
            </dl>
            <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-primary text-xs underline underline-offset-2"
            >
                {t("docsLink")}
            </a>
        </details>
    );
}
