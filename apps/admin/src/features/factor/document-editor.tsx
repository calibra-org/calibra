"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { CalendarClock, PackagePlus, Plus, Save, Search, Send, Trash2, UserRound } from "#/icons";
import { formatMoney } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";

import { FactorHeader } from "./components";
import {
    useCreateFactorDocument,
    useFactorCustomers,
    useFactorDocument,
    useFactorProducts,
    useFactorSettings,
    useUpdateFactorDocument,
} from "./queries";
import { calculateEditorTotal } from "./utils";
import type { FactorDocument, FactorDocumentInput, FactorLine } from "./types";

let localLineId = 0;
function emptyLine(): FactorLine & { localId: number } {
    localLineId += 1;
    return {
        localId: localLineId,
        product_id: null,
        variation_id: null,
        sku: null,
        name: "",
        description: null,
        quantity: 1,
        unit_price_minor: 0,
        discount_percent: 0,
    };
}

function isoForInput(value: string | null | undefined): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

interface FactorDocumentEditorProps {
    documentId?: number;
}

export function FactorDocumentEditor({ documentId }: FactorDocumentEditorProps) {
    const documentQuery = useFactorDocument(documentId ?? 0);
    if (documentId && documentQuery.isLoading) {
        return (
            <div className="space-y-4">
                {[
                    "document-editor-1",
                    "document-editor-2",
                    "document-editor-3",
                    "document-editor-4",
                    "document-editor-5",
                    "document-editor-6",
                    "document-editor-7",
                    "document-editor-8",
                ].map((key) => (
                    <Skeleton key={key} className="h-24" />
                ))}
            </div>
        );
    }
    if (documentId && (!documentQuery.data || documentQuery.isError)) {
        return (
            <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 text-danger text-sm">
                سند برای ویرایش پیدا نشد.
            </div>
        );
    }
    if (documentQuery.data?.type === "credit_note") {
        return (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-5 text-sm text-warning">
                سند اصلاحی از مسیر رسمی تبدیل ساخته می‌شود و قابل ویرایش مستقیم نیست.
            </div>
        );
    }
    return <FactorDocumentEditorForm key={documentQuery.data?.version ?? "new"} document={documentQuery.data} />;
}

function FactorDocumentEditorForm({ document }: { document?: FactorDocument }) {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const settings = useFactorSettings();
    const createMutation = useCreateFactorDocument();
    const updateMutation = useUpdateFactorDocument(document?.id ?? 0);
    const [customerQuery, setCustomerQuery] = useState("");
    const [productQuery, setProductQuery] = useState("");
    const deferredCustomerQuery = useDeferredValue(customerQuery);
    const deferredProductQuery = useDeferredValue(productQuery);
    const customers = useFactorCustomers(deferredCustomerQuery);
    const products = useFactorProducts(deferredProductQuery);

    const [type, setType] = useState<FactorDocumentInput["type"]>(document?.type === "invoice" ? "invoice" : "proforma");
    const [customerId, setCustomerId] = useState<number | null>(document?.customer_id ?? null);
    const [customerName, setCustomerName] = useState(document?.customer.name ?? "");
    const [customerEmail, setCustomerEmail] = useState(document?.customer.email ?? "");
    const [customerPhone, setCustomerPhone] = useState(document?.customer.phone ?? "");
    const [customerCompany, setCustomerCompany] = useState(document?.customer.company ?? "");
    const [nationalId, setNationalId] = useState(document?.customer.national_id ?? "");
    const [lines, setLines] = useState<Array<FactorLine & { localId: number }>>(
        document?.items?.map((line) => ({ ...line, localId: ++localLineId })) ?? [emptyLine()],
    );
    const [orderDiscount, setOrderDiscount] = useState(document?.order_discount_minor ?? 0);
    const [shipping, setShipping] = useState(document?.shipping_minor ?? 0);
    const [taxPercent, setTaxPercent] = useState(document?.tax_percent ?? 9);
    const [roundTo, setRoundTo] = useState(document?.round_to_minor ?? 10);
    const [customerNote, setCustomerNote] = useState(document?.customer_note ?? "");
    const [internalNote, setInternalNote] = useState(document?.internal_note ?? "");
    const [dueAt, setDueAt] = useState(isoForInput(document?.due_at));
    const [expiresAt, setExpiresAt] = useState(isoForInput(document?.expires_at));
    const [deliveryChannel, setDeliveryChannel] = useState<FactorDocumentInput["delivery_channel"]>(
        document?.delivery_channel ?? "none",
    );
    const [formInitialized, setFormInitialized] = useState(Boolean(document));
    const initialSnapshot = useRef<string | null>(null);

    useEffect(() => {
        if (!settings.data || document) return;
        setType(settings.data.default_type);
        setTaxPercent(settings.data.default_tax_percent);
        setRoundTo(settings.data.round_to_minor);
        setDeliveryChannel(settings.data.default_delivery_channel);
        if (!expiresAt) {
            const date = new Date();
            date.setDate(date.getDate() + settings.data.default_expiry_days);
            setExpiresAt(isoForInput(date.toISOString()));
        }
        setFormInitialized(true);
    }, [document, expiresAt, settings.data]);

    const totals = useMemo(
        () =>
            calculateEditorTotal({
                lines,
                order_discount_minor: orderDiscount,
                shipping_minor: shipping,
                tax_percent: taxPercent,
                round_to_minor: roundTo,
            }),
        [lines, orderDiscount, roundTo, shipping, taxPercent],
    );

    const formSnapshot = useMemo(
        () =>
            JSON.stringify({
                type,
                customerId,
                customerName,
                customerEmail,
                customerPhone,
                customerCompany,
                nationalId,
                lines: lines.map(({ localId: _localId, ...line }) => line),
                orderDiscount,
                shipping,
                taxPercent,
                roundTo,
                customerNote,
                internalNote,
                dueAt,
                expiresAt,
                deliveryChannel,
            }),
        [
            type,
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            customerCompany,
            nationalId,
            lines,
            orderDiscount,
            shipping,
            taxPercent,
            roundTo,
            customerNote,
            internalNote,
            dueAt,
            expiresAt,
            deliveryChannel,
        ],
    );

    useEffect(() => {
        if (formInitialized && initialSnapshot.current === null) initialSnapshot.current = formSnapshot;
    }, [formInitialized, formSnapshot]);

    const isDirty = formInitialized && initialSnapshot.current !== null && initialSnapshot.current !== formSnapshot;
    useEffect(() => {
        if (!isDirty) return;
        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeUnload);
        return () => window.removeEventListener("beforeunload", warnBeforeUnload);
    }, [isDirty]);

    const busy = createMutation.isPending || updateMutation.isPending;

    function patchLine(localId: number, patch: Partial<FactorLine>) {
        setLines((current) => current.map((line) => (line.localId === localId ? { ...line, ...patch } : line)));
    }

    function addProduct(product: {
        id: number;
        variation_id: number | null;
        name: string;
        sku: string | null;
        unit_price_minor: number;
    }) {
        setLines((current) => [
            ...current.filter((line) => line.name.trim().length > 0 || line.unit_price_minor > 0),
            {
                ...emptyLine(),
                product_id: product.id,
                variation_id: product.variation_id,
                name: product.name,
                sku: product.sku,
                unit_price_minor: product.unit_price_minor,
            },
        ]);
        setProductQuery("");
    }

    function buildPayload(status: "draft" | "sent"): FactorDocumentInput | null {
        const cleanLines = lines.filter((line) => line.name.trim().length > 0 && line.quantity > 0);
        if (!customerName.trim()) {
            toast.add({ title: "نام مشتری را وارد کنید.", data: { tone: "error" } });
            return null;
        }
        if (cleanLines.length === 0) {
            toast.add({ title: "حداقل یک ردیف معتبر لازم است.", data: { tone: "error" } });
            return null;
        }
        if (cleanLines.some((line) => !Number.isSafeInteger(line.unit_price_minor) || line.unit_price_minor < 0)) {
            toast.add({ title: "قیمت ردیف‌ها باید عدد صحیح و نامنفی باشد.", data: { tone: "error" } });
            return null;
        }
        return {
            type,
            customer_id: customerId,
            customer: {
                name: customerName.trim(),
                email: customerEmail.trim() || null,
                phone: customerPhone.trim() || null,
                company: customerCompany.trim() || null,
                national_id: nationalId.trim() || null,
            },
            lines: cleanLines.map((line) => ({
                product_id: line.product_id,
                variation_id: line.variation_id,
                sku: line.sku,
                name: line.name.trim(),
                description: line.description?.trim() || null,
                quantity: Math.max(1, Math.trunc(line.quantity)),
                unit_price_minor: Math.max(0, Math.trunc(line.unit_price_minor)),
                discount_percent: Math.min(100, Math.max(0, Number(line.discount_percent) || 0)),
            })),
            order_discount_minor: Math.max(0, Math.trunc(orderDiscount)),
            shipping_minor: Math.max(0, Math.trunc(shipping)),
            tax_percent: Math.min(100, Math.max(0, taxPercent)),
            round_to_minor: Math.max(1, Math.trunc(roundTo)),
            customer_note: customerNote.trim() || null,
            internal_note: internalNote.trim() || null,
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            delivery_channel: deliveryChannel,
            status,
            expected_version: document?.version,
        };
    }

    async function save(status: "draft" | "sent") {
        const payload = buildPayload(status);
        if (!payload) return;
        try {
            if (document) {
                const { status: _status, expected_version: _expectedVersion, ...updatePayload } = payload;
                const result = await updateMutation.mutateAsync({ ...updatePayload, expected_version: document.version });
                initialSnapshot.current = formSnapshot;
                toast.add({ title: "تغییرات سند ذخیره شد.", data: { tone: "success" } });
                router.push(`/factor/documents/${result.data.id}` as never);
            } else {
                const result = await createMutation.mutateAsync(payload);
                initialSnapshot.current = formSnapshot;
                toast.add({
                    title: status === "sent" ? "سند ساخته و صادر شد." : "پیش‌نویس سند ذخیره شد.",
                    data: { tone: "success" },
                });
                router.push(`/factor/documents/${result.data.id}` as never);
            }
        } catch (error) {
            toast.add({ title: "ذخیره سند ناموفق بود.", description: String(error), data: { tone: "error" } });
        }
    }

    return (
        <div className="flex flex-col gap-6 pb-24">
            <FactorHeader
                title={document ? `ویرایش ${document.reference ?? `پیش‌نویس #${document.id}`}` : "ساخت فاکتور یا پیش‌فاکتور"}
                subtitle="مبالغ در سرور محاسبه می‌شوند و اطلاعات محصول و مشتری به‌صورت Snapshot در سند باقی می‌ماند."
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => void save("draft")} disabled={busy}>
                            <Save className="size-4" aria-hidden="true" />
                            {document ? "ذخیره تغییرات" : "ذخیره پیش‌نویس"}
                        </Button>
                        {!document ? (
                            <Button onClick={() => void save("sent")} disabled={busy}>
                                <Send className="size-4" aria-hidden="true" />
                                صدور سند
                            </Button>
                        ) : null}
                    </div>
                }
            />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex min-w-0 flex-col gap-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                                مشتری و نوع سند
                            </CardTitle>
                            <CardDescription>یک مشتری موجود را انتخاب کنید یا اطلاعات سند را مستقل وارد کنید.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="factor-customer-search">جستجوی مشتریان کالیبرا</Label>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        id="factor-customer-search"
                                        value={customerQuery}
                                        onChange={(event) => setCustomerQuery(event.target.value)}
                                        placeholder="نام، ایمیل یا تلفن مشتری"
                                        className="ps-9"
                                    />
                                </div>
                                {customerQuery && (customers.data?.length ?? 0) > 0 ? (
                                    <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border bg-popover p-1 shadow-sm">
                                        {customers.data?.map((customer) => (
                                            <button
                                                key={customer.id}
                                                type="button"
                                                className="flex items-center justify-between gap-3 rounded px-3 py-2 text-start text-sm hover:bg-accent"
                                                onClick={() => {
                                                    setCustomerId(customer.id);
                                                    setCustomerName(customer.name);
                                                    setCustomerEmail(customer.email ?? "");
                                                    setCustomerPhone(customer.phone ?? "");
                                                    setCustomerCompany(customer.company ?? "");
                                                    setNationalId(customer.national_id ?? "");
                                                    setCustomerQuery("");
                                                }}
                                            >
                                                <span className="font-medium">{customer.name}</span>
                                                <span className="text-muted-foreground text-xs">
                                                    {customer.phone ?? customer.email ?? "—"}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                <Label>نوع سند</Label>
                                <Select
                                    value={type}
                                    onValueChange={(value) => setType(value as FactorDocumentInput["type"])}
                                    disabled={Boolean(document)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="proforma">پیش‌فاکتور</SelectItem>
                                        <SelectItem value="invoice">فاکتور</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-customer-name">نام مشتری</Label>
                                <Input
                                    id="factor-customer-name"
                                    value={customerName}
                                    onChange={(e) => {
                                        setCustomerName(e.target.value);
                                        setCustomerId(null);
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-customer-phone">تلفن</Label>
                                <Input
                                    id="factor-customer-phone"
                                    value={customerPhone}
                                    onChange={(e) => {
                                        setCustomerPhone(e.target.value);
                                        setCustomerId(null);
                                    }}
                                    dir="ltr"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-customer-email">ایمیل</Label>
                                <Input
                                    id="factor-customer-email"
                                    value={customerEmail}
                                    onChange={(e) => {
                                        setCustomerEmail(e.target.value);
                                        setCustomerId(null);
                                    }}
                                    dir="ltr"
                                    type="email"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-customer-company">شرکت</Label>
                                <Input
                                    id="factor-customer-company"
                                    value={customerCompany}
                                    onChange={(e) => {
                                        setCustomerCompany(e.target.value);
                                        setCustomerId(null);
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-customer-national">شناسه ملی / کد ملی</Label>
                                <Input
                                    id="factor-customer-national"
                                    value={nationalId}
                                    onChange={(e) => {
                                        setNationalId(e.target.value);
                                        setCustomerId(null);
                                    }}
                                    dir="ltr"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <PackagePlus className="size-4 text-muted-foreground" aria-hidden="true" />
                                اقلام سند
                            </CardTitle>
                            <CardDescription>
                                محصولات کالیبرا را اضافه کنید یا یک ردیف دستی بسازید؛ نام و قیمت فقط برای همین سند قابل ویرایش
                                است.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={productQuery}
                                    onChange={(event) => setProductQuery(event.target.value)}
                                    placeholder="جستجوی محصول با نام یا SKU"
                                    className="ps-9"
                                />
                            </div>
                            {productQuery && (products.data?.length ?? 0) > 0 ? (
                                <div className="grid max-h-52 gap-1 overflow-y-auto rounded-md border bg-popover p-1 shadow-sm">
                                    {products.data?.map((product) => (
                                        <button
                                            key={`${product.id}:${product.variation_id ?? "parent"}`}
                                            type="button"
                                            className="flex items-center justify-between gap-3 rounded px-3 py-2 text-start text-sm hover:bg-accent"
                                            onClick={() => addProduct(product)}
                                        >
                                            <span>
                                                <span className="block font-medium">{product.name}</span>
                                                <span className="text-muted-foreground text-xs">
                                                    {product.sku ?? `#${product.id}`}
                                                </span>
                                            </span>
                                            <span className="font-medium tabular-nums">
                                                {formatMoney(product.unit_price_minor, locale)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}

                            <div className="space-y-3">
                                {lines.map((line, index) => (
                                    <div key={line.localId} className="rounded-lg border p-3">
                                        <div className="mb-3 flex items-center justify-between">
                                            <span className="font-medium text-sm">ردیف {index + 1}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                aria-label="حذف ردیف"
                                                onClick={() =>
                                                    setLines((current) => current.filter((item) => item.localId !== line.localId))
                                                }
                                                disabled={lines.length === 1}
                                            >
                                                <Trash2 className="size-4" aria-hidden="true" />
                                            </Button>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-12">
                                            <div className="space-y-2 md:col-span-5">
                                                <Label>نام کالا یا خدمت</Label>
                                                <Input
                                                    value={line.name}
                                                    onChange={(e) => patchLine(line.localId, { name: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label>تعداد</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={line.quantity}
                                                    onChange={(e) =>
                                                        patchLine(line.localId, { quantity: Number(e.target.value) })
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2 md:col-span-3">
                                                <Label>قیمت واحد (ریال)</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={line.unit_price_minor}
                                                    onChange={(e) =>
                                                        patchLine(line.localId, { unit_price_minor: Number(e.target.value) })
                                                    }
                                                    dir="ltr"
                                                />
                                            </div>
                                            <div className="space-y-2 md:col-span-2">
                                                <Label>تخفیف %</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={line.discount_percent}
                                                    onChange={(e) =>
                                                        patchLine(line.localId, { discount_percent: Number(e.target.value) })
                                                    }
                                                    dir="ltr"
                                                />
                                            </div>
                                            <div className="space-y-2 md:col-span-4">
                                                <Label>SKU</Label>
                                                <Input
                                                    value={line.sku ?? ""}
                                                    onChange={(e) => patchLine(line.localId, { sku: e.target.value || null })}
                                                    dir="ltr"
                                                />
                                            </div>
                                            <div className="space-y-2 md:col-span-8">
                                                <Label>توضیح ردیف</Label>
                                                <Input
                                                    value={line.description ?? ""}
                                                    onChange={(e) =>
                                                        patchLine(line.localId, { description: e.target.value || null })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setLines((current) => [...current, emptyLine()])}
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                افزودن ردیف دستی
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">یادداشت‌ها</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="factor-customer-note">یادداشت قابل مشاهده برای مشتری</Label>
                                <Textarea
                                    id="factor-customer-note"
                                    value={customerNote}
                                    onChange={(e) => setCustomerNote(e.target.value)}
                                    rows={5}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-internal-note">یادداشت داخلی</Label>
                                <Textarea
                                    id="factor-internal-note"
                                    value={internalNote}
                                    onChange={(e) => setInternalNote(e.target.value)}
                                    rows={5}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-col gap-5 xl:sticky xl:top-5 xl:self-start">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
                                زمان‌بندی و روش تحویل
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="factor-due">سررسید</Label>
                                <Input
                                    id="factor-due"
                                    type="datetime-local"
                                    value={dueAt}
                                    onChange={(e) => setDueAt(e.target.value)}
                                    dir="ltr"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factor-expiry">انقضای لینک</Label>
                                <Input
                                    id="factor-expiry"
                                    type="datetime-local"
                                    value={expiresAt}
                                    onChange={(e) => setExpiresAt(e.target.value)}
                                    dir="ltr"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>کانال ترجیحی تحویل</Label>
                                <Select
                                    value={deliveryChannel}
                                    onValueChange={(value) =>
                                        setDeliveryChannel(value as FactorDocumentInput["delivery_channel"])
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
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">محاسبات سند</CardTitle>
                            <CardDescription>
                                نمایش اولیه است؛ سرور دوباره همه مبالغ را محاسبه و اعتبارسنجی می‌کند.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                                <div className="space-y-2">
                                    <Label htmlFor="factor-order-discount">تخفیف کلی (ریال)</Label>
                                    <Input
                                        id="factor-order-discount"
                                        type="number"
                                        min={0}
                                        value={orderDiscount}
                                        onChange={(e) => setOrderDiscount(Number(e.target.value))}
                                        dir="ltr"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="factor-shipping">هزینه ارسال (ریال)</Label>
                                    <Input
                                        id="factor-shipping"
                                        type="number"
                                        min={0}
                                        value={shipping}
                                        onChange={(e) => setShipping(Number(e.target.value))}
                                        dir="ltr"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="factor-tax">مالیات (%)</Label>
                                    <Input
                                        id="factor-tax"
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={taxPercent}
                                        onChange={(e) => setTaxPercent(Number(e.target.value))}
                                        dir="ltr"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="factor-round">گردکردن به مضرب ریال</Label>
                                    <Input
                                        id="factor-round"
                                        type="number"
                                        min={1}
                                        value={roundTo}
                                        onChange={(e) => setRoundTo(Number(e.target.value))}
                                        dir="ltr"
                                    />
                                </div>
                            </div>
                            <Separator />
                            <div className="space-y-2 text-sm">
                                <SummaryRow label="جمع اقلام" value={formatMoney(totals.subtotal, locale)} />
                                <SummaryRow label="تخفیف ردیف‌ها" value={`− ${formatMoney(totals.lineDiscount, locale)}`} />
                                <SummaryRow label="تخفیف کلی" value={`− ${formatMoney(totals.orderDiscount, locale)}`} />
                                <SummaryRow label="ارسال" value={formatMoney(totals.shipping, locale)} />
                                <SummaryRow label="مالیات" value={formatMoney(totals.tax, locale)} />
                                <SummaryRow label="گردکردن" value={formatMoney(totals.rounding, locale)} />
                            </div>
                            <Separator />
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-semibold">مبلغ قابل پرداخت</span>
                                <span className="font-semibold text-lg tabular-nums">{formatMoney(totals.payable, locale)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
