"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { Save, ShieldCheck, Sparkles } from "#/icons";

import { useContentResources, useContentSettings, useUpdateContentSettings } from "./queries";
import type { ContentSettings, ContentUser } from "./types";

const defaults: ContentSettings = {
    default_locale: "fa",
    default_author_user_id: null,
    require_review_before_publish: true,
    allow_agent_web_search: false,
    allow_agent_publish: false,
    auto_publish_due: true,
    source_fetch_enabled: true,
    brand_voice: "",
    allowed_topics: [],
    blocked_topics: [],
    content_model: "gpt-5-mini",
    minimum_source_trust: 60,
    minimum_publish_quality: 75,
};

export function ContentSettingsPage() {
    const settings = useContentSettings();
    const update = useUpdateContentSettings();
    const users = useContentResources<ContentUser>("users", "", true);
    const [form, setForm] = useState<ContentSettings>(defaults);
    const [allowedTopics, setAllowedTopics] = useState("");
    const [blockedTopics, setBlockedTopics] = useState("");

    useEffect(() => {
        if (!settings.data?.data) return;
        setForm(settings.data.data);
        setAllowedTopics(settings.data.data.allowed_topics.join("، "));
        setBlockedTopics(settings.data.data.blocked_topics.join("، "));
    }, [settings.data]);

    function list(value: string): string[] {
        return Array.from(
            new Set(
                value
                    .split(/[،,\n]/)
                    .map((item) => item.trim())
                    .filter(Boolean),
            ),
        );
    }

    async function save() {
        try {
            await update.mutateAsync({
                ...form,
                allowed_topics: list(allowedTopics),
                blocked_topics: list(blockedTopics),
                allow_agent_publish: false,
            });
            toast.add({ title: "تنظیمات نوشته‌ها ذخیره شد", data: { tone: "success" } });
        } catch {
            toast.add({
                title: "ذخیره تنظیمات ناموفق بود",
                description: "مقادیر و اتصال API را بررسی کنید.",
                data: { tone: "error" },
            });
        }
    }

    if (settings.isPending)
        return (
            <div className="space-y-4">
                <Skeleton className="h-20" />
                <div className="grid gap-4 lg:grid-cols-2">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
            </div>
        );

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="تنظیمات نوشته‌ها"
                subtitle="سیاست انتشار، منابع، Agentها و کنترل کیفیت در Tenant جاری."
                actions={
                    <Button disabled={update.isPending} onClick={save}>
                        <Save className="size-4" />
                        ذخیره تنظیمات
                    </Button>
                }
            />

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">انتشار و حاکمیت</CardTitle>
                        <CardDescription>قوانین غیرقابل دورزدن برای حفظ کیفیت، اعتماد و Audit.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <SettingSwitch
                            label="بازبینی قبل از انتشار"
                            description="نوشته پیش از انتشار باید به وضعیت تأییدشده برسد."
                            checked={form.require_review_before_publish}
                            onChange={(value) => setForm((current) => ({ ...current, require_review_before_publish: value }))}
                        />
                        <SettingSwitch
                            label="انتشار خودکار زمان‌بندی‌شده"
                            description="فرمان زمان‌بندی فقط نوشته‌های تأییدشده و عبورکرده از حد کیفیت را منتشر می‌کند."
                            checked={form.auto_publish_due}
                            onChange={(value) => setForm((current) => ({ ...current, auto_publish_due: value }))}
                        />
                        <SettingSwitch
                            label="واکاوی منابع"
                            description="اجازه اجرای Jobهای واکشی منابع فعال."
                            checked={form.source_fetch_enabled}
                            onChange={(value) => setForm((current) => ({ ...current, source_fetch_enabled: value }))}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label>حداقل اعتماد منبع</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={form.minimum_source_trust}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, minimum_source_trust: Number(event.target.value) }))
                                    }
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>حداقل کیفیت انتشار</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={form.minimum_publish_quality}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            minimum_publish_quality: Number(event.target.value),
                                        }))
                                    }
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>زبان پیش‌فرض</Label>
                            <Select
                                value={form.default_locale}
                                onValueChange={(value) => {
                                    if (value === "fa" || value === "en")
                                        setForm((current) => ({ ...current, default_locale: value }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fa">فارسی</SelectItem>
                                    <SelectItem value="en">انگلیسی</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>نویسنده پیش‌فرض</Label>
                            <Select
                                value={form.default_author_user_id ? String(form.default_author_user_id) : "none"}
                                onValueChange={(value) => {
                                    if (typeof value !== "string") return;
                                    setForm((current) => ({
                                        ...current,
                                        default_author_user_id: value === "none" ? null : Number(value),
                                    }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="انتخاب نویسنده" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">بدون نویسنده پیش‌فرض</SelectItem>
                                    {(users.data?.data ?? []).map((user) => (
                                        <SelectItem key={user.id} value={String(user.id)}>
                                            {user.email}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Agent و هوش مصنوعی</CardTitle>
                        <CardDescription>Agentها پیشنهاد می‌سازند؛ انتشار مستقل آن‌ها عمداً غیرفعال است.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <SettingSwitch
                            label="اجازه جست‌وجوی وب برای Agent"
                            description="فقط در صورت نیاز به اطلاعات تازه و با ذخیره شواهد."
                            checked={form.allow_agent_web_search}
                            onChange={(value) => setForm((current) => ({ ...current, allow_agent_web_search: value }))}
                        />
                        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                            <p>
                                انتشار مستقیم Agent در این ماژول همیشه خاموش می‌ماند. تغییر وضعیت انتشار نیازمند عملیات انسانی و
                                ثبت Audit است.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>مدل محتوا</Label>
                            <Input
                                dir="ltr"
                                value={form.content_model}
                                onChange={(event) => setForm((current) => ({ ...current, content_model: event.target.value }))}
                                placeholder="gpt-5-mini"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>راهنمای لحن و برند</Label>
                            <Textarea
                                rows={8}
                                value={form.brand_voice}
                                onChange={(event) => setForm((current) => ({ ...current, brand_voice: event.target.value }))}
                                placeholder="لحن، مخاطب، اصطلاحات ترجیحی، محدودیت ادعا و روش استناد را مشخص کنید."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>موضوعات مجاز</Label>
                            <Textarea
                                rows={4}
                                value={allowedTopics}
                                onChange={(event) => setAllowedTopics(event.target.value)}
                                placeholder="با ویرگول یا خط جدید جدا کنید"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>موضوعات ممنوع</Label>
                            <Textarea
                                rows={4}
                                value={blockedTopics}
                                onChange={(event) => setBlockedTopics(event.target.value)}
                                placeholder="موضوعات پرریسک یا خارج از دامنه"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Sparkles className="size-5" />
                        </span>
                        <div>
                            <p className="font-medium">قانون کیفیت</p>
                            <p className="mt-1 text-muted-foreground text-sm">
                                محتوای Agent، خبر خارجی و پیشنهاد تجاری تا زمان بازبینی انسان و عبور از کنترل کیفیت منتشر نمی‌شود.
                            </p>
                        </div>
                    </div>
                    <Button disabled={update.isPending} onClick={save}>
                        <Save className="size-4" />
                        ذخیره همه تغییرات
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

function SettingSwitch({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span>
                <span className="block font-medium text-sm">{label}</span>
                <span className="mt-1 block text-muted-foreground text-xs leading-5">{description}</span>
            </span>
            <Switch checked={checked} onCheckedChange={(value) => onChange(value === true)} />
        </div>
    );
}
