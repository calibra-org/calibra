"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useDeferredValue, useState } from "react";

import { StatCard } from "#/components/StatCard";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import {
    AlertCircle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    CreditCard,
    Inbox,
    Landmark,
    Search,
    ShieldCheck,
} from "#/icons";
import { formatDateTime, formatMoney } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { usePaymentGateways } from "#/lib/queries/payments";

import { FactorHeader, FactorQueryMessage } from "./components";
import { useFactorPaymentAttempts, useFactorSummary } from "./queries";

export function FactorPaymentsPage() {
    const locale = useLocale() as Locale;
    const [page, setPage] = useState(1);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("all");
    const deferredQ = useDeferredValue(q.trim());
    const gateways = usePaymentGateways();
    const attempts = useFactorPaymentAttempts({
        page,
        limit: 25,
        q: deferredQ || undefined,
        status: status === "all" ? undefined : status,
    });
    const summary = useFactorSummary();
    const activeGateways = gateways.data?.filter((gateway) => gateway.enabled).length ?? 0;
    const settledAttempts =
        attempts.data?.data.filter(
            (attempt) =>
                attempt.status === "verified" &&
                !(isOfflineGateway(attempt.gateway_code) && attempt.document_status === "awaiting"),
        ).length ?? 0;

    return (
        <div className="flex flex-col gap-6">
            <FactorHeader
                title="پرداخت‌ها و درگاه‌ها"
                subtitle="نمای یکپارچه وضعیت وصول اسناد، تراکنش‌های سفارش و درگاه‌های فعال فروشگاه"
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="وصول‌شده"
                    value={formatMoney(summary.data?.collected_minor ?? 0, locale)}
                    icon={CheckCircle2}
                    tone="success"
                />
                <StatCard
                    label="مانده وصول"
                    value={formatMoney(summary.data?.outstanding_minor ?? 0, locale)}
                    icon={CircleDollarSign}
                    tone="warning"
                />
                <StatCard label="درگاه فعال" value={String(activeGateways)} icon={CreditCard} tone="info" />
                <StatCard label="تسویه‌شده در این صفحه" value={String(settledAttempts)} icon={ShieldCheck} tone="success" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">آخرین تراکنش‌های درگاه</CardTitle>
                        <CardDescription>تراکنش‌های واقعی متصل به سفارش‌های کالیبرا و اسناد فاکتور</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                            <div className="relative min-w-0">
                                <Search
                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <Input
                                    value={q}
                                    onChange={(event) => {
                                        setQ(event.target.value);
                                        setPage(1);
                                    }}
                                    placeholder="جستجو در سند، درگاه یا شناسه تراکنش"
                                    aria-label="جستجو در تراکنش‌ها"
                                    className="ps-9"
                                />
                            </div>
                            <Select
                                value={status}
                                onValueChange={(value) => {
                                    setStatus(String(value ?? "all"));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger aria-label="فیلتر وضعیت تراکنش">
                                    <SelectValue placeholder="وضعیت تراکنش" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                                    <SelectItem value="initiated">شروع‌شده</SelectItem>
                                    <SelectItem value="awaiting_callback">در انتظار پاسخ</SelectItem>
                                    <SelectItem value="verified">تأییدشده</SelectItem>
                                    <SelectItem value="failed">ناموفق</SelectItem>
                                    <SelectItem value="cancelled">لغوشده</SelectItem>
                                    <SelectItem value="refunded">بازپرداخت‌شده</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {attempts.isLoading ? (
                            <div className="space-y-2">
                                {[
                                    "payment-row-1",
                                    "payment-row-2",
                                    "payment-row-3",
                                    "payment-row-4",
                                    "payment-row-5",
                                    "payment-row-6",
                                    "payment-row-7",
                                ].map((key) => (
                                    <Skeleton key={key} className="h-12" />
                                ))}
                            </div>
                        ) : attempts.isError ? (
                            <FactorQueryMessage
                                icon={AlertCircle}
                                title="دریافت تراکنش‌ها ناموفق بود"
                                description="ارتباط با سرویس پرداخت برقرار نشد. دوباره تلاش کنید."
                                actionLabel="تلاش دوباره"
                                onAction={() => void attempts.refetch()}
                            />
                        ) : (attempts.data?.data ?? []).length === 0 ? (
                            <FactorQueryMessage
                                icon={Inbox}
                                title="هنوز تراکنشی ثبت نشده است"
                                description="پس از شروع پرداخت یک سند، تراکنش‌های درگاه در این بخش نمایش داده می‌شوند."
                            />
                        ) : (
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>شناسه</TableHead>
                                            <TableHead>سند</TableHead>
                                            <TableHead>سفارش</TableHead>
                                            <TableHead>درگاه</TableHead>
                                            <TableHead>وضعیت</TableHead>
                                            <TableHead>مبلغ</TableHead>
                                            <TableHead>زمان</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(attempts.data?.data ?? []).map((attempt) => (
                                            <TableRow key={attempt.id}>
                                                <TableCell className="font-mono text-xs">#{attempt.id}</TableCell>
                                                <TableCell>
                                                    <Link
                                                        href={`/factor/documents/${attempt.document_id}` as never}
                                                        className="text-primary hover:underline"
                                                    >
                                                        {attempt.document_reference ?? `#${attempt.document_id}`}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>
                                                    <Link
                                                        href={`/orders/${attempt.order_id}` as never}
                                                        className="text-primary hover:underline"
                                                    >
                                                        #{attempt.order_id}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{attempt.gateway_code}</TableCell>
                                                <TableCell>
                                                    <StatusBadge
                                                        tone={paymentTone(
                                                            attempt.status,
                                                            attempt.gateway_code,
                                                            attempt.document_status,
                                                        )}
                                                    >
                                                        {paymentStatus(
                                                            attempt.status,
                                                            attempt.gateway_code,
                                                            attempt.document_status,
                                                        )}
                                                    </StatusBadge>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap font-medium tabular-nums">
                                                    {formatMoney(attempt.amount_minor, locale)}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                                                    {attempt.created_at ? formatDateTime(attempt.created_at, locale) : "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {(attempts.data?.meta.total ?? 0) > 0 ? (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
                                <span>
                                    {(attempts.data?.meta.total ?? 0).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} تراکنش
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                                        disabled={page <= 1 || attempts.isFetching}
                                    >
                                        <ChevronRight className="size-4" aria-hidden="true" />
                                        قبلی
                                    </Button>
                                    <span>
                                        صفحه {page.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")} از{" "}
                                        {(attempts.data?.meta.lastPage ?? 1).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            setPage((value) => Math.min(attempts.data?.meta.lastPage ?? value, value + 1))
                                        }
                                        disabled={page >= (attempts.data?.meta.lastPage ?? 1) || attempts.isFetching}
                                    >
                                        بعدی
                                        <ChevronLeft className="size-4" aria-hidden="true" />
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Landmark className="size-4" />
                            درگاه‌های فروشگاه
                        </CardTitle>
                        <CardDescription>فعال‌سازی و کلیدهای هر درگاه از تنظیمات اصلی پرداخت مدیریت می‌شود.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {gateways.isLoading ? (
                            <Skeleton className="h-40" />
                        ) : gateways.isError ? (
                            <FactorQueryMessage
                                icon={AlertCircle}
                                title="دریافت درگاه‌ها ناموفق بود"
                                description="تنظیمات درگاه‌های فروشگاه در دسترس نیست."
                                actionLabel="تلاش دوباره"
                                onAction={() => void gateways.refetch()}
                                compact
                            />
                        ) : (gateways.data ?? []).length === 0 ? (
                            <FactorQueryMessage
                                icon={CreditCard}
                                title="درگاهی تعریف نشده است"
                                description="برای دریافت آنلاین، ابتدا یک درگاه پرداخت در تنظیمات فروشگاه بسازید."
                                compact
                            />
                        ) : (
                            gateways.data?.map((gateway) => (
                                <div key={gateway.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                    <div>
                                        <p className="font-medium text-sm">{gateway.title[locale] ?? gateway.code}</p>
                                        <p className="text-muted-foreground text-xs">
                                            {gateway.implementationStatus === "live" ? "پیاده‌سازی عملیاتی" : "اتصال آزمایشی"}
                                        </p>
                                    </div>
                                    <StatusBadge tone={gateway.enabled ? "success" : "neutral"}>
                                        {gateway.enabled ? "فعال" : "غیرفعال"}
                                    </StatusBadge>
                                </div>
                            ))
                        )}
                        <Link href={"/payments" as never} className="inline-flex text-primary text-sm hover:underline">
                            مدیریت کامل درگاه‌ها
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function isOfflineGateway(code: string): boolean {
    return code === "cod" || code === "bank_transfer";
}

function paymentStatus(status: string, gatewayCode: string, documentStatus: string): string {
    if (status === "verified" && isOfflineGateway(gatewayCode)) {
        return documentStatus === "paid" ? "تطبیق‌شده" : "در انتظار تطبیق مالی";
    }
    const labels: Record<string, string> = {
        initiated: "شروع‌شده",
        awaiting_callback: "در انتظار پاسخ",
        verified: "تأییدشده",
        failed: "ناموفق",
        cancelled: "لغوشده",
        refunded: "بازپرداخت‌شده",
    };
    return labels[status] ?? status;
}

function paymentTone(status: string, gatewayCode: string, documentStatus: string): "success" | "danger" | "warning" {
    if (status === "failed" || status === "cancelled") return "danger";
    if (status === "verified" && (!isOfflineGateway(gatewayCode) || documentStatus === "paid")) return "success";
    return "warning";
}
