"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import { StatCard } from "#/components/StatCard";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { toast } from "#/components/ui/toast";
import {
    ArrowRightLeft,
    CalendarClock,
    Copy,
    CreditCard,
    ExternalLink,
    FileCheck2,
    FilePenLine,
    Link2,
    Printer,
    ReceiptText,
    RefreshCcw,
    Send,
    UserRound,
    WalletCards,
} from "#/icons";
import { formatDateTime, formatMoney } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { usePaymentGateways } from "#/lib/queries/payments";

import { FactorHeader, FactorStatusBadge } from "./components";
import {
    useConvertFactorDocument,
    useCreateFactorPaymentLink,
    useFactorDocument,
    useRecordFactorPayment,
    useTransitionFactorDocument,
} from "./queries";
import { FACTOR_TYPE_LABELS } from "./utils";

const EVENT_LABELS: Record<string, string> = {
    "document.created": "سند ساخته شد",
    "document.updated": "سند ویرایش شد",
    "document.sent": "سند صادر شد",
    "document.viewed": "سند توسط مشتری دیده شد",
    "document.awaiting": "سند در انتظار پرداخت قرار گرفت",
    "document.paid": "سند پرداخت شد",
    "document.expired": "سند منقضی شد",
    "document.cancelled": "سند لغو شد",
    "document.refunded": "وجه بازپرداخت شد",
    "document.credited": "سند اصلاحی ثبت شد",
    "document.converted": "سند تبدیل شد",
    "document.created_from": "سند از سند قبلی ساخته شد",
    "payment_link.created": "لینک پرداخت ساخته شد",
    "payment.recorded": "پرداخت دستی ثبت شد",
    "payment.verified": "پرداخت درگاه تأیید شد",
};

export function FactorDocumentDetail({ id }: { id: number }) {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const documentQuery = useFactorDocument(id);
    const transition = useTransitionFactorDocument(id);
    const convert = useConvertFactorDocument(id);
    const paymentLink = useCreateFactorPaymentLink(id);
    const manualPayment = useRecordFactorPayment(id);
    const gateways = usePaymentGateways();
    const [gatewayId, setGatewayId] = useState("");
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<"manual" | "cash" | "card" | "bank_transfer">("bank_transfer");
    const [paymentReference, setPaymentReference] = useState("");
    const [paymentNotes, setPaymentNotes] = useState("");

    const document = documentQuery.data;
    const availableGateways = useMemo(() => gateways.data?.filter((gateway) => gateway.enabled) ?? [], [gateways.data]);

    if (documentQuery.isLoading) {
        return (
            <div className="space-y-4">
                {[
                    "document-detail-1",
                    "document-detail-2",
                    "document-detail-3",
                    "document-detail-4",
                    "document-detail-5",
                    "document-detail-6",
                    "document-detail-7",
                    "document-detail-8",
                ].map((key) => (
                    <Skeleton key={key} className="h-24" />
                ))}
            </div>
        );
    }
    if (!document || documentQuery.isError) {
        return (
            <Card>
                <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                    <ReceiptText className="size-8 text-muted-foreground" aria-hidden="true" />
                    <h1 className="font-semibold">سند پیدا نشد</h1>
                    <Button variant="outline" asChild>
                        <Link href={"/factor/documents" as never}>بازگشت به فهرست</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const currentDocument = document;
    const defaultAmount = Math.max(0, currentDocument.outstanding_minor);
    const canEdit = currentDocument.status === "draft";
    const canAcceptPayment =
        currentDocument.type !== "credit_note" &&
        !["paid", "expired", "cancelled", "refunded", "credited"].includes(currentDocument.status);

    async function runTransition(to_status: "sent" | "viewed" | "awaiting" | "paid" | "expired" | "cancelled") {
        if (
            to_status === "cancelled" &&
            !window.confirm("این سند لغو می‌شود و سفارش پشتیبان نیز در صورت امکان لغو خواهد شد. ادامه می‌دهید؟")
        ) {
            return;
        }
        try {
            await transition.mutateAsync({ to_status, expected_version: currentDocument.version });
            toast.add({ title: "وضعیت سند به‌روزرسانی شد.", data: { tone: "success" } });
        } catch (error) {
            toast.add({ title: "تغییر وضعیت ناموفق بود.", description: String(error), data: { tone: "error" } });
        }
    }

    async function createLink() {
        const selected = Number(gatewayId || availableGateways[0]?.id || 0);
        if (!selected) {
            toast.add({ title: "یک درگاه فعال انتخاب کنید.", data: { tone: "warning" } });
            return;
        }
        try {
            const result = await paymentLink.mutateAsync({
                gateway_id: selected,
                expires_at: currentDocument.expires_at,
                expected_version: currentDocument.version,
            });
            const rawPath = result.data.path.startsWith("/") ? result.data.path : `/${result.data.path}`;
            const localizedPath = rawPath.startsWith(`/${locale}/`) ? rawPath : `/${locale}${rawPath}`;
            const url = `${window.location.origin}${localizedPath}`;
            try {
                await navigator.clipboard.writeText(url);
                toast.add({ title: "لینک پرداخت ساخته و کپی شد.", description: url, data: { tone: "success" } });
            } catch {
                toast.add({ title: "لینک پرداخت ساخته شد؛ کپی خودکار مجاز نبود.", description: url, data: { tone: "warning" } });
            }
        } catch (error) {
            toast.add({ title: "ساخت لینک پرداخت ناموفق بود.", description: String(error), data: { tone: "error" } });
        }
    }

    async function recordPayment() {
        const amount = paymentAmount > 0 ? paymentAmount : defaultAmount;
        if (amount <= 0) {
            toast.add({ title: "مبلغ پرداخت باید بیشتر از صفر باشد.", data: { tone: "warning" } });
            return;
        }
        if (["bank_transfer", "card"].includes(paymentMethod) && !paymentReference.trim()) {
            toast.add({ title: "شماره پیگیری برای پرداخت بانکی یا کارت الزامی است.", data: { tone: "warning" } });
            return;
        }
        try {
            await manualPayment.mutateAsync({
                amount_minor: Math.trunc(amount),
                method: paymentMethod,
                reference: paymentReference.trim() || null,
                notes: paymentNotes.trim() || null,
                expected_version: currentDocument.version,
            });
            setPaymentAmount(0);
            setPaymentReference("");
            setPaymentNotes("");
            toast.add({ title: "پرداخت ثبت شد.", data: { tone: "success" } });
        } catch (error) {
            toast.add({ title: "ثبت پرداخت ناموفق بود.", description: String(error), data: { tone: "error" } });
        }
    }

    async function convertTo(target: "invoice" | "credit_note") {
        const message =
            target === "invoice"
                ? "پیش‌فاکتور به فاکتور تبدیل می‌شود و سند مبنا بسته خواهد شد. ادامه می‌دهید؟"
                : "یک سند اصلاحی کامل برای این فاکتور ساخته می‌شود. این عملیات حسابداری قابل تکرار نیست. ادامه می‌دهید؟";
        if (!window.confirm(message)) return;
        try {
            const result = await convert.mutateAsync({ target_type: target, expected_version: currentDocument.version });
            toast.add({
                title: target === "invoice" ? "فاکتور جدید ساخته شد." : "سند اصلاحی ساخته شد.",
                data: { tone: "success" },
            });
            router.push(`/factor/documents/${result.data.id}` as never);
        } catch (error) {
            toast.add({ title: "تبدیل سند ناموفق بود.", description: String(error), data: { tone: "error" } });
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <FactorHeader
                title={document.reference ?? `پیش‌نویس #${document.id}`}
                subtitle={`${FACTOR_TYPE_LABELS[document.type]} · سفارش متصل ${document.order_id ? `#${document.order_id}` : "ندارد"}`}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button className="print:hidden" variant="outline" asChild>
                            <Link
                                href={`/factor/documents/${document.id}/print?print=1` as never}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Printer className="size-4" aria-hidden="true" />
                                چاپ
                            </Link>
                        </Button>
                        <Button className="print:hidden" variant="outline" onClick={() => void documentQuery.refetch()}>
                            <RefreshCcw className="size-4" aria-hidden="true" />
                            به‌روزرسانی
                        </Button>
                        {canEdit ? (
                            <Button variant="outline" asChild>
                                <Link href={`/factor/documents/${document.id}/edit` as never}>
                                    <FilePenLine className="size-4" aria-hidden="true" />
                                    ویرایش
                                </Link>
                            </Button>
                        ) : null}
                        {document.status === "draft" ? (
                            <Button onClick={() => void runTransition("sent")} disabled={transition.isPending}>
                                <Send className="size-4" aria-hidden="true" />
                                صدور سند
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="flex items-center gap-3">
                    <FactorStatusBadge status={document.status} />
                    <span className="text-muted-foreground text-sm">نسخه {document.version}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {document.parent_document_id ? (
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/factor/documents/${document.parent_document_id}` as never}>
                                <ArrowRightLeft className="size-4" aria-hidden="true" />
                                مشاهده سند مبنا
                            </Link>
                        </Button>
                    ) : null}
                    {(document.child_documents ?? []).map((child) => (
                        <Button key={child.id} variant="outline" size="sm" asChild>
                            <Link href={`/factor/documents/${child.id}` as never}>
                                <ArrowRightLeft className="size-4" aria-hidden="true" />
                                {child.reference ?? `سند مرتبط #${child.id}`}
                            </Link>
                        </Button>
                    ))}
                    {document.type === "proforma" &&
                    !["expired", "cancelled", "refunded", "credited"].includes(document.status) ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void convertTo("invoice")}
                            disabled={convert.isPending}
                        >
                            <ArrowRightLeft className="size-4" aria-hidden="true" />
                            تبدیل به فاکتور
                        </Button>
                    ) : null}
                    {document.status === "paid" && document.type !== "credit_note" ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void convertTo("credit_note")}
                            disabled={convert.isPending}
                        >
                            <FileCheck2 className="size-4" aria-hidden="true" />
                            ساخت سند اصلاحی
                        </Button>
                    ) : null}
                    {["sent", "viewed"].includes(document.status) ? (
                        <Button size="sm" variant="outline" onClick={() => void runTransition("awaiting")}>
                            در انتظار پرداخت
                        </Button>
                    ) : null}
                    {["draft", "sent", "viewed", "awaiting"].includes(document.status) ? (
                        <Button size="sm" variant="outline" onClick={() => void runTransition("cancelled")}>
                            لغو سند
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="مبلغ سند" value={formatMoney(document.payable_minor, locale)} icon={ReceiptText} tone="info" />
                <StatCard
                    label="وصول‌شده"
                    value={formatMoney(document.collected_minor, locale)}
                    icon={FileCheck2}
                    tone="success"
                />
                <StatCard
                    label="مانده"
                    value={formatMoney(document.outstanding_minor, locale)}
                    icon={WalletCards}
                    tone="warning"
                />
                <StatCard
                    label="سررسید"
                    value={document.due_at ? formatDateTime(document.due_at, locale) : "تعیین نشده"}
                    icon={CalendarClock}
                    tone={
                        document.due_at && new Date(document.due_at).getTime() < Date.now() && document.outstanding_minor > 0
                            ? "danger"
                            : "neutral"
                    }
                />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex min-w-0 flex-col gap-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">اقلام سند</CardTitle>
                            <CardDescription>
                                Snapshot اقلام در زمان ساخت سند؛ تغییر کاتالوگ این سابقه را عوض نمی‌کند.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>شرح</TableHead>
                                            <TableHead>تعداد</TableHead>
                                            <TableHead>قیمت واحد</TableHead>
                                            <TableHead>تخفیف</TableHead>
                                            <TableHead>جمع</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {document.items?.map((item) => (
                                            <TableRow key={item.id ?? item.position}>
                                                <TableCell>
                                                    <div className="min-w-48">
                                                        <p className="font-medium text-sm">{item.name}</p>
                                                        <p className="text-muted-foreground text-xs">{item.sku ?? "بدون SKU"}</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="tabular-nums">{item.quantity}</TableCell>
                                                <TableCell className="whitespace-nowrap tabular-nums">
                                                    {formatMoney(item.unit_price_minor, locale)}
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap tabular-nums">
                                                    {item.discount_percent}%
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap font-medium tabular-nums">
                                                    {formatMoney(
                                                        item.line_total_minor ?? item.quantity * item.unit_price_minor,
                                                        locale,
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="ms-auto mt-4 max-w-sm space-y-2 text-sm">
                                <SummaryRow label="جمع اقلام" value={formatMoney(document.subtotal_minor, locale)} />
                                <SummaryRow
                                    label="تخفیف ردیف‌ها"
                                    value={`− ${formatMoney(document.line_discount_minor, locale)}`}
                                />
                                <SummaryRow label="تخفیف کلی" value={`− ${formatMoney(document.order_discount_minor, locale)}`} />
                                <SummaryRow label="ارسال" value={formatMoney(document.shipping_minor, locale)} />
                                <SummaryRow label="مالیات" value={formatMoney(document.tax_minor, locale)} />
                                <SummaryRow label="گردکردن" value={formatMoney(document.rounding_minor, locale)} />
                                <Separator />
                                <SummaryRow label="قابل پرداخت" value={formatMoney(document.payable_minor, locale)} strong />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">پرداخت‌ها</CardTitle>
                            <CardDescription>
                                پرداخت دستی، انتقال بانکی و پرداخت‌های متصل به درگاه در این سند ثبت می‌شوند.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {(document.payments?.length ?? 0) > 0 ? (
                                <div className="overflow-x-auto rounded-lg border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>روش</TableHead>
                                                <TableHead>مبلغ</TableHead>
                                                <TableHead>مرجع</TableHead>
                                                <TableHead>تاریخ</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {document.payments?.map((payment) => (
                                                <TableRow key={payment.id}>
                                                    <TableCell>{payment.gateway_code ?? payment.method}</TableCell>
                                                    <TableCell className="font-medium tabular-nums">
                                                        {formatMoney(payment.amount_minor, locale)}
                                                    </TableCell>
                                                    <TableCell>{payment.reference ?? "—"}</TableCell>
                                                    <TableCell>
                                                        {formatDateTime(payment.paid_at ?? payment.created_at, locale)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <p className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm">
                                    هنوز پرداختی برای این سند ثبت نشده است.
                                </p>
                            )}
                            {document.outstanding_minor > 0 && canAcceptPayment ? (
                                <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="factor-payment-amount">مبلغ پرداخت</Label>
                                        <Input
                                            id="factor-payment-amount"
                                            type="number"
                                            min={1}
                                            value={paymentAmount || defaultAmount}
                                            onChange={(event) => setPaymentAmount(Number(event.target.value))}
                                            dir="ltr"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>روش پرداخت</Label>
                                        <Select
                                            value={paymentMethod}
                                            onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bank_transfer">انتقال بانکی</SelectItem>
                                                <SelectItem value="card">کارت‌خوان / کارت</SelectItem>
                                                <SelectItem value="cash">نقدی</SelectItem>
                                                <SelectItem value="manual">ثبت دستی</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="factor-payment-reference">شماره پیگیری</Label>
                                        <Input
                                            id="factor-payment-reference"
                                            value={paymentReference}
                                            onChange={(event) => setPaymentReference(event.target.value)}
                                            dir="ltr"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="factor-payment-notes">توضیح</Label>
                                        <Input
                                            id="factor-payment-notes"
                                            value={paymentNotes}
                                            onChange={(event) => setPaymentNotes(event.target.value)}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <Button onClick={() => void recordPayment()} disabled={manualPayment.isPending}>
                                            <CreditCard className="size-4" aria-hidden="true" />
                                            ثبت پرداخت
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">تاریخچه سند</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {document.events?.map((event) => (
                                <div key={event.id} className="flex gap-3 border-b pb-3 last:border-0 last:pb-0">
                                    <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-sm">
                                            {EVENT_LABELS[event.event_type] ?? event.event_type}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {formatDateTime(event.created_at, locale)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-col gap-5 xl:sticky xl:top-5 xl:self-start">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <UserRound className="size-4" />
                                مشتری
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <p className="font-medium">{document.customer.name}</p>
                            <p className="text-muted-foreground" dir="ltr">
                                {document.customer.phone ?? "—"}
                            </p>
                            <p className="break-all text-muted-foreground" dir="ltr">
                                {document.customer.email ?? "—"}
                            </p>
                            {document.customer.company ? (
                                <p className="text-muted-foreground">{document.customer.company}</p>
                            ) : null}
                            {document.customer_id ? (
                                <Button variant="outline" size="sm" asChild className="mt-2 w-full">
                                    <Link href={`/customers/${document.customer_id}` as never}>مشاهده پرونده مشتری</Link>
                                </Button>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Link2 className="size-4" />
                                لینک پرداخت
                            </CardTitle>
                            <CardDescription>لینک امن، قابل انقضا و متصل به سفارش پشتیبان سند.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Select value={gatewayId} onValueChange={(value) => setGatewayId(String(value ?? ""))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="انتخاب درگاه" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableGateways.map((gateway) => (
                                        <SelectItem key={gateway.id} value={String(gateway.id)}>
                                            {gateway.title[locale] ?? gateway.code}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                className="w-full"
                                onClick={() => void createLink()}
                                disabled={paymentLink.isPending || document.outstanding_minor <= 0 || !canAcceptPayment}
                            >
                                <Link2 className="size-4" aria-hidden="true" />
                                ساخت و کپی لینک
                            </Button>
                            {(document.payment_links?.length ?? 0) > 0 ? (
                                <div className="space-y-2">
                                    {document.payment_links?.slice(0, 3).map((link) => {
                                        const path = `/${locale}/pay/${link.code}`;
                                        const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
                                        return (
                                            <div key={link.id} className="rounded-md border p-3 text-xs">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-medium">
                                                        {link.status === "active" ? "فعال" : link.status}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="کپی لینک"
                                                            onClick={() => void navigator.clipboard.writeText(url)}
                                                        >
                                                            <Copy className="size-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" asChild aria-label="بازکردن لینک">
                                                            <a href={url} target="_blank" rel="noreferrer">
                                                                <ExternalLink className="size-3.5" />
                                                            </a>
                                                        </Button>
                                                    </div>
                                                </div>
                                                <p className="mt-1 truncate text-muted-foreground" dir="ltr">
                                                    {url}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">یادداشت‌ها</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div>
                                <p className="mb-1 font-medium">یادداشت مشتری</p>
                                <p className="whitespace-pre-wrap text-muted-foreground">{document.customer_note ?? "—"}</p>
                            </div>
                            <Separator />
                            <div>
                                <p className="mb-1 font-medium">یادداشت داخلی</p>
                                <p className="whitespace-pre-wrap text-muted-foreground">{document.internal_note ?? "—"}</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return (
        <div
            className={`flex items-center justify-between gap-3 ${strong ? "font-semibold text-base" : "text-muted-foreground"}`}
        >
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
