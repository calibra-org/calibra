import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { SettingsNav } from "#/components/SettingsNav";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { getSettingsGroup } from "#/lib/server-repos";
import type { AdminSettingField, SettingsGroupKey } from "#/lib/types";
import { cn } from "#/lib/utils";
import { GeneralSettings } from "#/views/settings/general/general-settings";

interface PageProps {
    params: Promise<{ locale: string; group: string }>;
}

function isSettingsGroupKey(value: string): value is SettingsGroupKey {
    return ["general", "products", "tax", "shipping", "account", "email", "advanced"].includes(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, group } = await params;
    if (!isSettingsGroupKey(group)) return { title: "—" };
    const g = await getSettingsGroup(group);
    if (g === null) return { title: "—" };
    return { title: g.title[locale as Locale] };
}

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

export default async function SettingsGroupPage({ params }: PageProps) {
    const { locale: rawLocale, group } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    if (!isSettingsGroupKey(group)) notFound();
    const groupData = await getSettingsGroup(group);
    if (groupData === null) notFound();
    const t = await getTranslations("Settings");
    const isGeneral = group === "general";

    return (
        <section className="flex w-full max-w-5xl flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={isGeneral ? undefined : <Button>{t("save")}</Button>}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
                <aside>
                    <SettingsNav />
                </aside>

                {isGeneral ? (
                    <GeneralSettings />
                ) : (
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-base">{groupData.title[locale]}</CardTitle>
                            <CardDescription>{groupData.subtitle[locale]}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-6 pt-6">
                            {groupData.fields.map((field) => {
                                const isToggle = field.type === "switch";
                                return (
                                    <div
                                        key={field.key}
                                        className={cn(
                                            "flex flex-col gap-1.5",
                                            isToggle && "flex-row items-center justify-between gap-3",
                                        )}
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
                )}
            </div>
        </section>
    );
}
