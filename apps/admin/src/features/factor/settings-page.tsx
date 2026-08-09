"use client";

import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { Save, Settings2 } from "#/icons";

import { FactorHeader } from "./components";
import { useFactorSettings, useUpdateFactorSettings } from "./queries";
import type { FactorSettings } from "./types";

const FALLBACK: FactorSettings = {
    reference_prefix: "K20",
    default_type: "proforma",
    default_tax_percent: 9,
    default_expiry_days: 7,
    round_to_minor: 10,
    default_delivery_channel: "none",
    bank_account_title: "",
    bank_iban: "",
    bank_card_number: "",
    footer_note: "",
};

export function FactorSettingsPage() {
    const settings = useFactorSettings();
    const update = useUpdateFactorSettings();
    const [form, setForm] = useState<FactorSettings>(FALLBACK);

    useEffect(() => {
        if (settings.data) setForm(settings.data);
    }, [settings.data]);

    function patch<K extends keyof FactorSettings>(key: K, value: FactorSettings[K]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    async function save() {
        try {
            await update.mutateAsync(form);
            toast.add({ title: "تنظیمات فاکتور ذخیره شد.", data: { tone: "success" } });
        } catch (error) {
            toast.add({ title: "ذخیره تنظیمات ناموفق بود.", description: String(error), data: { tone: "error" } });
        }
    }

    if (settings.isLoading) {
        return (
            <div className="space-y-4">
                {["settings-1", "settings-2", "settings-3", "settings-4", "settings-5"].map((key) => (
                    <Skeleton key={key} className="h-28" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <FactorHeader
                title="تنظیمات فاکتور"
                subtitle="شماره‌گذاری K20، مالیات، انقضا، گردکردن، روش ارسال و اطلاعات پرداخت آفلاین را مدیریت کنید."
                actions={
                    <Button onClick={save} disabled={update.isPending}>
                        <Save className="size-4" aria-hidden="true" />
                        {update.isPending ? "در حال ذخیره..." : "ذخیره تنظیمات"}
                    </Button>
                }
            />

            {settings.isError ? (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-danger text-sm">
                    دریافت تنظیمات با خطا روبه‌رو شد.
                </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Settings2 className="size-4" aria-hidden="true" />
                                شماره‌گذاری و پیش‌فرض‌های سند
                            </CardTitle>
                            <CardDescription>این گزینه‌ها هنگام ساخت سند جدید اعمال می‌شوند و قابل ویرایش‌اند.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <Field label="پیشوند شماره سند" hint="نمونه خروجی: K20-INV-1000">
                                <Input
                                    value={form.reference_prefix}
                                    maxLength={12}
                                    dir="ltr"
                                    onChange={(event) => patch("reference_prefix", event.target.value.toUpperCase())}
                                />
                            </Field>
                            <Field label="نوع پیش‌فرض">
                                <Select
                                    value={form.default_type}
                                    onValueChange={(value) => patch("default_type", value as FactorSettings["default_type"])}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="proforma">پیش‌فاکتور</SelectItem>
                                        <SelectItem value="invoice">فاکتور</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="مالیات پیش‌فرض (درصد)">
                                <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={form.default_tax_percent}
                                    onChange={(event) => patch("default_tax_percent", Number(event.target.value))}
                                />
                            </Field>
                            <Field label="مهلت پیش‌فرض پرداخت (روز)">
                                <Input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={form.default_expiry_days}
                                    onChange={(event) => patch("default_expiry_days", Number(event.target.value))}
                                />
                            </Field>
                            <Field label="گردکردن مبلغ (واحد پایه پول)">
                                <Select
                                    value={String(form.round_to_minor)}
                                    onValueChange={(value) => patch("round_to_minor", Number(value))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">بدون گردکردن</SelectItem>
                                        <SelectItem value="10">ده واحد</SelectItem>
                                        <SelectItem value="100">صد واحد</SelectItem>
                                        <SelectItem value="1000">هزار واحد</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label="کانال ترجیحی پیش‌فرض">
                                <Select
                                    value={form.default_delivery_channel}
                                    onValueChange={(value) =>
                                        patch("default_delivery_channel", value as FactorSettings["default_delivery_channel"])
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">بدون کانال ترجیحی</SelectItem>
                                        <SelectItem value="sms">پیامک</SelectItem>
                                        <SelectItem value="email">ایمیل</SelectItem>
                                        <SelectItem value="whatsapp">واتساپ</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">اطلاعات پرداخت آفلاین</CardTitle>
                            <CardDescription>
                                برای حواله بانکی یا پرداخت کارت‌به‌کارت در جزئیات سند نمایش داده می‌شود.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <Field label="عنوان صاحب حساب">
                                <Input
                                    value={form.bank_account_title}
                                    onChange={(event) => patch("bank_account_title", event.target.value)}
                                />
                            </Field>
                            <Field label="شماره کارت">
                                <Input
                                    value={form.bank_card_number}
                                    dir="ltr"
                                    inputMode="numeric"
                                    onChange={(event) => patch("bank_card_number", event.target.value)}
                                />
                            </Field>
                            <div className="md:col-span-2">
                                <Field label="شماره شبا">
                                    <Input
                                        value={form.bank_iban}
                                        dir="ltr"
                                        placeholder="IR..."
                                        onChange={(event) => patch("bank_iban", event.target.value.toUpperCase())}
                                    />
                                </Field>
                            </div>
                            <div className="md:col-span-2">
                                <Field label="متن پایین سند">
                                    <Textarea
                                        rows={4}
                                        value={form.footer_note}
                                        onChange={(event) => patch("footer_note", event.target.value)}
                                    />
                                </Field>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">پیش‌نمایش شماره سند</CardTitle>
                            <CardDescription>
                                شماره واقعی هنگام صدور و به‌صورت اتمیک برای همان فروشگاه تخصیص می‌یابد.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border bg-muted/30 p-4 text-center">
                                <p className="font-semibold text-xl tabular-nums" dir="ltr">
                                    {form.reference_prefix || "K20"}-INV-1000
                                </p>
                                <p className="mt-1 text-muted-foreground text-xs">نمونه نمایشی فاکتور</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {children}
            {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
        </div>
    );
}
