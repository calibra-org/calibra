"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useEffect } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDateTime, formatMoney, formatNumber } from "#/lib/format";

import { useFactorDocument, useFactorSettings } from "./queries";

interface FactorDocumentPrintProps {
    documentId: number;
    autoPrint: boolean;
}

export function FactorDocumentPrint({ documentId, autoPrint }: FactorDocumentPrintProps) {
    const locale = useLocale() as Locale;
    const documentQuery = useFactorDocument(documentId);
    const settingsQuery = useFactorSettings();
    const document = documentQuery.data;

    useEffect(() => {
        if (!autoPrint || documentQuery.isLoading || !document) return;
        const timer = window.setTimeout(() => window.print(), 200);
        return () => window.clearTimeout(timer);
    }, [autoPrint, document, documentQuery.isLoading]);

    if (documentQuery.isLoading) return <PrintSkeleton />;
    if (documentQuery.isError || !document) {
        return (
            <section className="mx-auto flex max-w-3xl flex-col items-center gap-3 p-10 text-center">
                <p className="text-muted-foreground text-sm">سند برای چاپ در دسترس نیست.</p>
                <Button variant="outline" onClick={() => void documentQuery.refetch()}>
                    تلاش دوباره
                </Button>
            </section>
        );
    }

    const settings = settingsQuery.data;
    return (
        <article
            id="factor-print-root"
            className="mx-auto flex max-w-4xl flex-col gap-7 bg-white p-10 text-black print:max-w-none print:p-0"
        >
            <style>{`@media print {
                @page { size: A4; margin: 14mm; }
                body { background: white !important; }
                body * { visibility: hidden !important; }
                #factor-print-root, #factor-print-root * { visibility: visible !important; }
                #factor-print-root { position: absolute; inset: 0; width: 100%; }
                .factor-no-print { display: none !important; }
            }`}</style>

            <header className="flex items-start justify-between gap-6 border-black/15 border-b pb-5">
                <div>
                    <p className="text-black/55 text-xs">سند مالی</p>
                    <h1 className="font-bold text-2xl">
                        {document.type === "proforma" ? "پیش‌فاکتور" : document.type === "credit_note" ? "سند اصلاحی" : "فاکتور"}
                    </h1>
                    <p className="mt-1 text-black/60 text-sm">
                        {document.reference ?? `پیش‌نویس #${formatNumber(document.id, locale)}`}
                    </p>
                </div>
                <div className="text-end text-sm">
                    <p>
                        <span className="text-black/55">تاریخ صدور: </span>
                        {formatDateTime(document.issued_at ?? document.created_at, locale)}
                    </p>
                    <p>
                        <span className="text-black/55">سررسید: </span>
                        {document.due_at ? formatDateTime(document.due_at, locale) : "تعیین نشده"}
                    </p>
                    <p>
                        <span className="text-black/55">وضعیت: </span>
                        {document.status}
                    </p>
                </div>
            </header>

            <section className="grid gap-6 border-black/10 border-b pb-5 sm:grid-cols-2">
                <div>
                    <h2 className="mb-2 font-semibold text-sm">مشخصات مشتری</h2>
                    <p className="font-medium">{document.customer.name || "بدون نام"}</p>
                    {document.customer.company ? <p>{document.customer.company}</p> : null}
                    {document.customer.phone ? (
                        <p dir="ltr" className="text-end text-black/65">
                            {document.customer.phone}
                        </p>
                    ) : null}
                    {document.customer.email ? (
                        <p dir="ltr" className="text-end text-black/65">
                            {document.customer.email}
                        </p>
                    ) : null}
                    {document.customer.national_id ? (
                        <p className="text-black/65">شناسه: {document.customer.national_id}</p>
                    ) : null}
                </div>
                <div>
                    <h2 className="mb-2 font-semibold text-sm">اطلاعات پرداخت</h2>
                    {settings?.bank_account_title ? <p>{settings.bank_account_title}</p> : null}
                    {settings?.bank_iban ? (
                        <p dir="ltr" className="text-end font-mono text-sm">
                            {settings.bank_iban}
                        </p>
                    ) : null}
                    {settings?.bank_card_number ? (
                        <p dir="ltr" className="text-end font-mono text-sm">
                            {settings.bank_card_number}
                        </p>
                    ) : null}
                    {!settings?.bank_account_title && !settings?.bank_iban && !settings?.bank_card_number ? (
                        <p className="text-black/55">اطلاعات پرداخت ثبت نشده است.</p>
                    ) : null}
                </div>
            </section>

            <div className="overflow-hidden rounded-md border border-black/15">
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-black/[0.035]">
                        <tr>
                            <th className="p-2 text-start">شرح</th>
                            <th className="p-2 text-end">تعداد</th>
                            <th className="p-2 text-end">قیمت واحد</th>
                            <th className="p-2 text-end">تخفیف</th>
                            <th className="p-2 text-end">مالیات</th>
                            <th className="p-2 text-end">جمع</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(document.items ?? []).map((item) => (
                            <tr key={item.id ?? `${item.position}-${item.name}`} className="border-black/10 border-t align-top">
                                <td className="p-2">
                                    <p className="font-medium">{item.name}</p>
                                    {item.sku ? <p className="font-mono text-black/55 text-xs">{item.sku}</p> : null}
                                    {item.description ? <p className="mt-1 text-black/60 text-xs">{item.description}</p> : null}
                                </td>
                                <td className="p-2 text-end tabular-nums">{formatNumber(item.quantity, locale)}</td>
                                <td className="p-2 text-end tabular-nums">{formatMoney(item.unit_price_minor, locale)}</td>
                                <td className="p-2 text-end tabular-nums">{formatMoney(item.discount_minor ?? 0, locale)}</td>
                                <td className="p-2 text-end tabular-nums">{formatMoney(item.tax_minor ?? 0, locale)}</td>
                                <td className="p-2 text-end font-medium tabular-nums">
                                    {formatMoney(item.line_total_minor ?? 0, locale)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <section className="ms-auto flex w-full max-w-sm flex-col gap-1 text-sm">
                <PrintRow label="جمع اقلام" value={formatMoney(document.subtotal_minor, locale)} />
                <PrintRow label="تخفیف ردیف‌ها" value={`− ${formatMoney(document.line_discount_minor, locale)}`} />
                <PrintRow label="تخفیف کلی" value={`− ${formatMoney(document.order_discount_minor, locale)}`} />
                <PrintRow label="هزینه ارسال" value={formatMoney(document.shipping_minor, locale)} />
                <PrintRow label="مالیات" value={formatMoney(document.tax_minor, locale)} />
                <PrintRow label="گردکردن" value={formatMoney(document.rounding_minor, locale)} />
                <hr className="my-2 border-black/20" />
                <PrintRow label="مبلغ قابل پرداخت" value={formatMoney(document.payable_minor, locale)} emphasis />
                {document.collected_minor > 0 ? (
                    <PrintRow label="وصول‌شده" value={formatMoney(document.collected_minor, locale)} />
                ) : null}
                {document.outstanding_minor > 0 ? (
                    <PrintRow label="مانده" value={formatMoney(document.outstanding_minor, locale)} emphasis />
                ) : null}
            </section>

            {document.customer_note ? (
                <section className="rounded-md border border-black/10 p-3 text-sm">
                    <h2 className="mb-1 font-semibold">یادداشت مشتری</h2>
                    <p className="whitespace-pre-wrap text-black/70">{document.customer_note}</p>
                </section>
            ) : null}
            {settings?.footer_note ? (
                <p className="border-black/10 border-t pt-4 text-black/60 text-xs">{settings.footer_note}</p>
            ) : null}

            <div className="factor-no-print flex justify-end">
                <Button onClick={() => window.print()}>چاپ سند</Button>
            </div>
        </article>
    );
}

function PrintRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
    return (
        <div className={`flex items-center justify-between gap-4 ${emphasis ? "font-semibold text-base" : ""}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

function PrintSkeleton() {
    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-6 p-10">
            <Skeleton className="h-20" />
            <Skeleton className="h-28" />
            <Skeleton className="h-64" />
            <Skeleton className="ms-auto h-36 w-80" />
        </div>
    );
}
