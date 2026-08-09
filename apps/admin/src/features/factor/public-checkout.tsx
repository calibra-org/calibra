"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { toast } from "#/components/ui/toast";
import { CheckCircle2, Clock3, CreditCard, FileText, LockKeyhole, ShieldCheck, TriangleAlert } from "#/icons";
import { formatMoney } from "#/lib/format";

import { FACTOR_STATUS_LABELS } from "./utils";
import type { FactorLine, FactorStatus } from "./types";

interface PublicGateway {
    id: number;
    code: string;
    title: string;
    payment_mode: "online" | "offline_reconciliation";
}

interface PublicFactor {
    code: string;
    reference: string | null;
    status: FactorStatus;
    link_status: "active" | "pending" | "paid" | "expired";
    customer: { name?: string; company?: string | null };
    subtotal_minor: number;
    line_discount_minor: number;
    order_discount_minor: number;
    shipping_minor: number;
    tax_minor: number;
    rounding_minor: number;
    payable_minor: number;
    collected_minor: number;
    outstanding_minor: number;
    currency_display: string;
    customer_note: string | null;
    expires_at: string | null;
    gateway_id: number | null;
    gateway_code: string | null;
    gateways: PublicGateway[];
    payment_instructions: {
        account_title: string;
        iban: string;
        card_number: string;
        footer_note: string;
    };
    items: FactorLine[];
}

export function PublicFactorCheckout({ code }: { code: string }) {
    const locale = useLocale() as Locale;
    const [data, setData] = useState<PublicFactor | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [paying, setPaying] = useState(false);
    const [gatewayId, setGatewayId] = useState<string>("");
    const [remaining, setRemaining] = useState<number | null>(null);
    const [offlinePending, setOfflinePending] = useState(false);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch(`/api/factor/pay/${encodeURIComponent(code)}`, { headers: { "accept-language": locale }, cache: "no-store" })
            .then(async (response) => {
                const payload = (await response.json()) as { data?: PublicFactor; error?: string; message?: string };
                if (!response.ok || !payload.data)
                    throw new Error(payload.message ?? payload.error ?? "لینک پرداخت قابل دریافت نیست.");
                if (!active) return;
                setData(payload.data);
                setOfflinePending(payload.data.link_status === "pending");
                setGatewayId(
                    payload.data.gateway_id ? String(payload.data.gateway_id) : String(payload.data.gateways[0]?.id ?? ""),
                );
                setError(null);
            })
            .catch((reason: unknown) => {
                if (active) setError(reason instanceof Error ? reason.message : "خطا در دریافت لینک پرداخت");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [code, locale]);

    useEffect(() => {
        if (!data?.expires_at) {
            setRemaining(null);
            return;
        }
        const tick = () => setRemaining(Math.max(0, Math.floor((Date.parse(data.expires_at as string) - Date.now()) / 1000)));
        tick();
        const timer = window.setInterval(tick, 1000);
        return () => window.clearInterval(timer);
    }, [data?.expires_at]);

    const countdown = useMemo(() => {
        if (remaining === null) return null;
        return {
            hours: Math.floor(remaining / 3600),
            minutes: Math.floor((remaining % 3600) / 60),
            seconds: remaining % 60,
        };
    }, [remaining]);

    async function startPayment() {
        if (!data || !gatewayId || remaining === 0) return;
        setPaying(true);
        try {
            const response = await fetch(`/api/factor/pay/${encodeURIComponent(code)}/init`, {
                method: "POST",
                headers: {
                    "accept-language": locale,
                    "content-type": "application/json",
                    "idempotency-key": (() => {
                        const storageKey = `factor-payment-idempotency:${code}:${gatewayId}`;
                        const existing = window.sessionStorage.getItem(storageKey);
                        if (existing) return existing;
                        const created = crypto.randomUUID();
                        window.sessionStorage.setItem(storageKey, created);
                        return created;
                    })(),
                },
                body: JSON.stringify({ gateway_id: Number(gatewayId) }),
            });
            const payload = (await response.json()) as {
                data?: { redirect_url: string | null; offline_pending?: boolean; payment_status?: string };
                message?: string;
                error?: string;
            };
            if (!response.ok || !payload.data) throw new Error(payload.message ?? payload.error ?? "شروع پرداخت انجام نشد.");
            if (payload.data.redirect_url) {
                window.location.assign(payload.data.redirect_url);
                return;
            }
            if (payload.data.offline_pending) {
                setOfflinePending(true);
                setData((current) => (current ? { ...current, status: "awaiting", link_status: "pending" } : current));
                window.sessionStorage.removeItem(`factor-payment-idempotency:${code}:${gatewayId}`);
                toast.add({
                    title: "درخواست پرداخت آفلاین ثبت شد.",
                    description: "سند پس از تطبیق و تأیید واحد مالی، پرداخت‌شده می‌شود.",
                    data: { tone: "success" },
                });
                return;
            }
            toast.add({ title: "درخواست پرداخت ثبت شد.", data: { tone: "success" } });
        } catch (reason) {
            toast.add({ title: "شروع پرداخت ناموفق بود.", description: String(reason), data: { tone: "error" } });
        } finally {
            setPaying(false);
        }
    }

    if (loading) {
        return (
            <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-5 px-4 py-10">
                <Skeleton className="h-24" />
                <Skeleton className="h-96" />
            </main>
        );
    }

    if (error || !data) {
        return (
            <main className="grid min-h-dvh place-items-center bg-muted/30 px-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <div className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger">
                            <TriangleAlert className="size-5" />
                        </div>
                        <CardTitle>لینک پرداخت در دسترس نیست</CardTitle>
                        <CardDescription>{error ?? "این لینک معتبر نیست یا منقضی شده است."}</CardDescription>
                    </CardHeader>
                </Card>
            </main>
        );
    }

    const paid = data.status === "paid";
    const expired = remaining === 0 || data.status === "expired" || data.status === "cancelled";

    return (
        <main className="min-h-dvh bg-muted/25">
            <header className="border-b bg-background/95 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                            <FileText className="size-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">پرداخت سند فروش</p>
                            <p className="text-muted-foreground text-xs" dir="ltr">
                                {data.reference ?? "Draft"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground text-xs">
                        <span className="inline-flex items-center gap-1.5">
                            <ShieldCheck className="size-4" /> ارتباط امن
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <LockKeyhole className="size-4" /> اطلاعات کارت ذخیره نمی‌شود
                        </span>
                    </div>
                </div>
            </header>

            <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <section className="space-y-5">
                    <Card>
                        <CardHeader className="flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle className="text-lg">
                                    {data.customer.company || data.customer.name || "مشتری"}
                                </CardTitle>
                                <CardDescription>وضعیت سند: {FACTOR_STATUS_LABELS[data.status] ?? data.status}</CardDescription>
                            </div>
                            {countdown ? (
                                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
                                    <p className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                                        <Clock3 className="size-3.5" /> زمان باقی‌مانده
                                    </p>
                                    <p className="mt-1 font-semibold tabular-nums" dir="ltr">
                                        {String(countdown.hours).padStart(2, "0")}:{String(countdown.minutes).padStart(2, "0")}:
                                        {String(countdown.seconds).padStart(2, "0")}
                                    </p>
                                </div>
                            ) : null}
                        </CardHeader>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">ردیف‌های سند</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {data.items.map((item) => (
                                <div
                                    key={item.id ?? `${item.name}-${item.position}`}
                                    className="grid gap-2 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-sm">{item.name}</p>
                                        <p className="mt-1 text-muted-foreground text-xs">
                                            {item.quantity.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} ×{" "}
                                            {formatMoney(item.unit_price_minor, locale)}
                                        </p>
                                    </div>
                                    <p className="font-semibold text-sm tabular-nums">
                                        {formatMoney(item.line_total_minor ?? item.quantity * item.unit_price_minor, locale)}
                                    </p>
                                </div>
                            ))}
                            {data.customer_note ? (
                                <div className="rounded-lg bg-muted/40 p-4 text-sm leading-7">{data.customer_note}</div>
                            ) : null}
                        </CardContent>
                    </Card>
                </section>

                <aside>
                    <Card className="sticky top-5">
                        <CardHeader>
                            <CardTitle className="text-base">خلاصه پرداخت</CardTitle>
                            <CardDescription>مبلغ نهایی محاسبه‌شده در سرور</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <span className="text-muted-foreground">جمع اقلام</span>
                                    <span>{formatMoney(data.subtotal_minor, locale)}</span>
                                </div>
                                {data.line_discount_minor > 0 ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">تخفیف ردیف‌ها</span>
                                        <span>-{formatMoney(data.line_discount_minor, locale)}</span>
                                    </div>
                                ) : null}
                                {data.order_discount_minor > 0 ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">تخفیف سند</span>
                                        <span>-{formatMoney(data.order_discount_minor, locale)}</span>
                                    </div>
                                ) : null}
                                {data.shipping_minor > 0 ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">ارسال</span>
                                        <span>{formatMoney(data.shipping_minor, locale)}</span>
                                    </div>
                                ) : null}
                                {data.tax_minor > 0 ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">مالیات</span>
                                        <span>{formatMoney(data.tax_minor, locale)}</span>
                                    </div>
                                ) : null}
                                {data.rounding_minor !== 0 ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">تعدیل گردکردن</span>
                                        <span>{formatMoney(data.rounding_minor, locale)}</span>
                                    </div>
                                ) : null}
                                {data.collected_minor > 0 ? (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">پرداخت‌شده</span>
                                        <span>-{formatMoney(data.collected_minor, locale)}</span>
                                    </div>
                                ) : null}
                            </div>

                            <div className="rounded-lg bg-primary/5 p-4 text-center ring-1 ring-primary/15">
                                <p className="text-muted-foreground text-xs">مبلغ قابل پرداخت</p>
                                <p className="mt-2 font-bold text-2xl tabular-nums">
                                    {formatMoney(data.outstanding_minor, locale)}
                                </p>
                            </div>

                            {offlinePending ? (
                                <div className="rounded-lg border border-info/30 bg-info/5 p-4 text-info text-sm leading-6">
                                    درخواست ثبت شده است و تا زمان تطبیق واحد مالی، وضعیت سند «در انتظار پرداخت» باقی می‌ماند.
                                </div>
                            ) : paid ? (
                                <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-5 text-center text-success">
                                    <CheckCircle2 className="size-8" />
                                    <div>
                                        <p className="font-semibold">این سند تسویه شده است</p>
                                        <p className="mt-1 text-xs">پرداخت با موفقیت ثبت شده است.</p>
                                    </div>
                                </div>
                            ) : expired ? (
                                <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
                                    مهلت این لینک به پایان رسیده و امکان شروع پرداخت وجود ندارد.
                                </div>
                            ) : (
                                <>
                                    {data.gateways.length > 0 ? (
                                        <div className="space-y-2">
                                            <Label>درگاه پرداخت</Label>
                                            <Select
                                                value={gatewayId}
                                                onValueChange={(value) => setGatewayId(String(value ?? ""))}
                                                disabled={data.gateway_id !== null}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="انتخاب درگاه" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {data.gateways.map((gateway) => (
                                                        <SelectItem key={gateway.id} value={String(gateway.id)}>
                                                            {gateway.title}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                                            درگاه فعالی برای این فروشگاه ثبت نشده است. برای پرداخت آفلاین با فروشگاه هماهنگ کنید.
                                        </div>
                                    )}
                                    <Button
                                        className="w-full"
                                        size="lg"
                                        onClick={startPayment}
                                        disabled={!gatewayId || paying || data.gateways.length === 0}
                                    >
                                        <CreditCard className="size-4" />
                                        {paying
                                            ? "در حال ثبت..."
                                            : data.gateways.find((gateway) => String(gateway.id) === gatewayId)?.payment_mode ===
                                                "offline_reconciliation"
                                              ? "ثبت درخواست پرداخت آفلاین"
                                              : "ادامه و ورود به درگاه"}
                                    </Button>
                                </>
                            )}

                            {data.payment_instructions.account_title ||
                            data.payment_instructions.iban ||
                            data.payment_instructions.card_number ? (
                                <div className="space-y-2 rounded-lg border bg-muted/25 p-4 text-sm">
                                    <p className="font-medium">اطلاعات پرداخت آفلاین</p>
                                    {data.payment_instructions.account_title ? (
                                        <p>{data.payment_instructions.account_title}</p>
                                    ) : null}
                                    {data.payment_instructions.card_number ? (
                                        <p className="font-mono text-xs" dir="ltr">
                                            {data.payment_instructions.card_number}
                                        </p>
                                    ) : null}
                                    {data.payment_instructions.iban ? (
                                        <p className="break-all font-mono text-xs" dir="ltr">
                                            {data.payment_instructions.iban}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                            {data.payment_instructions.footer_note ? (
                                <p className="whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-muted-foreground text-xs leading-6">
                                    {data.payment_instructions.footer_note}
                                </p>
                            ) : null}
                            <p className="text-center text-muted-foreground text-xs leading-5">
                                پرداخت از مسیر درگاه‌های فعال همان فروشگاه انجام می‌شود و مبلغ در سمت سرور دوباره کنترل خواهد شد.
                            </p>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </main>
    );
}
