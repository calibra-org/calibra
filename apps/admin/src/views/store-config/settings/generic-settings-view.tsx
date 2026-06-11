"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { getSettingsGroupFixture } from "#/lib/fixtures/settings-groups";
import type { AdminSettingField, SettingsGroupKey } from "#/lib/types";
import { cn } from "#/lib/utils";

/** Renders a single setting field's control by its declared `type`. */
function FieldControl({ field, locale, prefix }: { field: AdminSettingField; locale: Locale; prefix: string }) {
    const id = `${prefix}-${field.key}`;
    if (field.type === "switch") {
        return <Switch id={id} defaultChecked={Boolean(field.value)} />;
    }
    if (field.type === "select" && field.options !== undefined) {
        return (
            <Select defaultValue={String(field.value)}>
                <SelectTrigger id={id}>
                    <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                    {field.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label[locale]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
    if (field.type === "textarea") {
        return <Textarea id={id} defaultValue={String(field.value)} rows={3} />;
    }
    return <Input id={id} type={field.type === "number" ? "number" : "text"} defaultValue={String(field.value)} />;
}

/**
 * Generic settings group — renders the static {@link getSettingsGroupFixture} shape instantly (the
 * generic groups have no first-party endpoint yet). The `general`/`datetime`/`media` groups have
 * bespoke client views and never reach this component; an unknown group renders a not-found state.
 */
export function GenericSettingsView({ group }: { group: SettingsGroupKey }) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Settings");
    const commonT = useTranslations("Common");
    const groupData = getSettingsGroupFixture(group);

    if (groupData === null) {
        return (
            <div className="flex flex-col gap-6">
                <PageHeader title={t("title")} subtitle={t("subtitle")} />
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
                    <p className="text-muted-foreground text-sm">{commonT("noResults")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<Button>{t("save")}</Button>} />
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{groupData.title[locale]}</CardTitle>
                    <CardDescription>{groupData.subtitle[locale]}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6 pt-6">
                    {groupData.fields.map((field) => {
                        const isToggle = field.type === "switch";
                        return (
                            <div
                                key={field.key}
                                className={cn("flex flex-col gap-1.5", isToggle && "flex-row items-center justify-between gap-3")}
                            >
                                <div className={cn("flex flex-col", isToggle && "flex-1")}>
                                    <Label htmlFor={`${group}-${field.key}`} className="text-sm">
                                        {field.label[locale]}
                                    </Label>
                                    <p className="text-muted-foreground text-xs">{field.description[locale]}</p>
                                </div>
                                <div className={cn(isToggle ? "shrink-0" : "max-w-md")}>
                                    <FieldControl field={field} locale={locale} prefix={group} />
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
}
