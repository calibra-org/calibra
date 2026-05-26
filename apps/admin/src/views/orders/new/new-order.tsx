"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { useRouter } from "#/lib/i18n/navigation";
import { type CreateOrderInput, useCreateOrder } from "#/lib/queries/orders";

interface NewOrderProps {
    paymentMethods: { id: number; code: string; title: string }[];
}

const COUNTRY_OPTIONS = ["IR", "TR", "AE", "DE"] as const;

let lineCounter = 0;
function lineKey(): string {
    lineCounter += 1;
    return `line-${lineCounter}`;
}

/**
 * Manual order entry. The new endpoint requires a `payment_gateway_id` (the dropdown is the
 * resolved server-side list of enabled gateways) and at least one line. Save-as-draft and
 * place-order both POST to `/admin/orders`; place-order then optionally walks the state machine
 * to `pending` so the order shows up in the live tab right away.
 */
export function NewOrder({ paymentMethods }: NewOrderProps) {
    const _locale = useLocale() as Locale;
    const t = useTranslations("Orders.new");
    const addressT = useTranslations("Orders.new.address");
    const router = useRouter();
    const create = useCreateOrder();

    const [billing, setBilling] = useState<CreateOrderInput["billing_address"]>({
        first_name: "",
        last_name: "",
        address_line_1: "",
        city: "",
        country: "IR",
    });
    const [shippingSame, setShippingSame] = useState(true);
    const [shipping, setShipping] = useState<CreateOrderInput["billing_address"]>({ ...billing });
    const [lines, setLines] = useState<{ key: string; product_id: string; quantity: string }[]>([
        { key: lineKey(), product_id: "", quantity: "1" },
    ]);
    const [paymentGatewayId, setPaymentGatewayId] = useState<number | null>(paymentMethods[0]?.id ?? null);
    const [customerNote, setCustomerNote] = useState("");

    const submit = async () => {
        if (paymentGatewayId === null) {
            toast.add({ title: t("createFailed"), timeout: 3500, data: { tone: "error" } });
            return;
        }
        const numericLines = lines
            .map((line) => ({ product_id: Number(line.product_id), quantity: Number(line.quantity) }))
            .filter((line) => Number.isFinite(line.product_id) && line.product_id > 0 && line.quantity > 0);
        if (numericLines.length === 0) {
            toast.add({ title: t("createFailed"), timeout: 3500, data: { tone: "error" } });
            return;
        }
        try {
            const result = await create.mutateAsync({
                billing_address: billing,
                shipping_address: shippingSame ? undefined : shipping,
                payment_gateway_id: paymentGatewayId,
                customer_note: customerNote || null,
                lines: numericLines,
            });
            toast.add({ title: t("created"), timeout: 2500, data: { tone: "success" } });
            router.push(`/orders/${result.data.id}` as never);
        } catch {
            toast.add({ title: t("createFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                    <AddressCard
                        title={t("billing")}
                        addressT={addressT}
                        value={billing}
                        onChange={(next) => {
                            setBilling(next);
                            if (shippingSame) setShipping(next);
                        }}
                    />
                    <Card>
                        <CardHeader className="flex items-center justify-between border-b pb-4">
                            <CardTitle className="text-sm">{t("shipping")}</CardTitle>
                            <div className="flex items-center gap-2 text-xs">
                                <Switch
                                    checked={shippingSame}
                                    onCheckedChange={(value) => {
                                        const next = value === true;
                                        setShippingSame(next);
                                        if (next) setShipping(billing);
                                    }}
                                    aria-label={t("sameAsBilling")}
                                />
                                {t("sameAsBilling")}
                            </div>
                        </CardHeader>
                        {!shippingSame && (
                            <CardContent className="pt-4">
                                <AddressFields addressT={addressT} value={shipping} onChange={setShipping} />
                            </CardContent>
                        )}
                    </Card>

                    <Card>
                        <CardHeader className="flex items-center justify-between border-b pb-4">
                            <CardTitle className="text-sm">{t("items")}</CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setLines((current) => [...current, { key: lineKey(), product_id: "", quantity: "1" }])
                                }
                            >
                                {t("addProduct")}
                            </Button>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 pt-4">
                            {lines.map((line, index) => (
                                <div key={line.key} className="grid grid-cols-[1fr_120px_40px] items-end gap-2">
                                    <div className="flex flex-col gap-1">
                                        <Label htmlFor={`product-${index}`}>{t("productPlaceholder")}</Label>
                                        <Input
                                            id={`product-${index}`}
                                            inputMode="numeric"
                                            value={line.product_id}
                                            onChange={(event) =>
                                                setLines((current) =>
                                                    current.map((row, idx) =>
                                                        idx === index ? { ...row, product_id: event.target.value } : row,
                                                    ),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Label htmlFor={`qty-${index}`}>{t("quantity")}</Label>
                                        <Input
                                            id={`qty-${index}`}
                                            inputMode="numeric"
                                            value={line.quantity}
                                            onChange={(event) =>
                                                setLines((current) =>
                                                    current.map((row, idx) =>
                                                        idx === index ? { ...row, quantity: event.target.value } : row,
                                                    ),
                                                )
                                            }
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-danger hover:text-danger"
                                        onClick={() => setLines((current) => current.filter((_, idx) => idx !== index))}
                                        aria-label={t("remove")}
                                        disabled={lines.length === 1}
                                    >
                                        <Trash2 className="size-4" aria-hidden="true" />
                                    </Button>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{t("notes")}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <Textarea rows={3} value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} />
                        </CardContent>
                    </Card>
                </div>

                <aside className="flex flex-col gap-4">
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{t("payment")}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <Select
                                value={paymentGatewayId !== null ? String(paymentGatewayId) : undefined}
                                onValueChange={(value) => setPaymentGatewayId(value ? Number(value) : null)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t("payment")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {paymentMethods.map((method) => (
                                        <SelectItem key={method.id} value={String(method.id)}>
                                            {method.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    <Button onClick={submit} disabled={create.isPending}>
                        {t("place")}
                    </Button>
                </aside>
            </div>
        </section>
    );
}

interface AddressCardProps {
    title: string;
    addressT: ReturnType<typeof useTranslations>;
    value: CreateOrderInput["billing_address"];
    onChange: (next: CreateOrderInput["billing_address"]) => void;
}

function AddressCard({ title, addressT, value, onChange }: AddressCardProps) {
    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                <AddressFields addressT={addressT} value={value} onChange={onChange} />
            </CardContent>
        </Card>
    );
}

interface AddressFieldsProps {
    addressT: ReturnType<typeof useTranslations>;
    value: CreateOrderInput["billing_address"];
    onChange: (next: CreateOrderInput["billing_address"]) => void;
}

function AddressFields({ addressT, value, onChange }: AddressFieldsProps) {
    const patch = (key: keyof CreateOrderInput["billing_address"], next: string) => onChange({ ...value, [key]: next });

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label={addressT("firstName")} value={value.first_name} onChange={(v) => patch("first_name", v)} />
            <Field label={addressT("lastName")} value={value.last_name} onChange={(v) => patch("last_name", v)} />
            <Field label={addressT("phone")} value={value.phone ?? ""} onChange={(v) => onChange({ ...value, phone: v })} />
            <Field label={addressT("email")} value={value.email ?? ""} onChange={(v) => onChange({ ...value, email: v })} />
            <div className="md:col-span-2">
                <Field
                    label={addressT("addressLine1")}
                    value={value.address_line_1}
                    onChange={(v) => patch("address_line_1", v)}
                />
            </div>
            <div className="md:col-span-2">
                <Field
                    label={addressT("addressLine2")}
                    value={value.address_line_2 ?? ""}
                    onChange={(v) => onChange({ ...value, address_line_2: v })}
                />
            </div>
            <Field label={addressT("city")} value={value.city} onChange={(v) => patch("city", v)} />
            <Field
                label={addressT("postcode")}
                value={value.postcode ?? ""}
                onChange={(v) => onChange({ ...value, postcode: v })}
            />
            <div className="flex flex-col gap-1">
                <Label>{addressT("country")}</Label>
                <Select value={value.country} onValueChange={(v) => patch("country", typeof v === "string" ? v : "")}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {COUNTRY_OPTIONS.map((code) => (
                            <SelectItem key={code} value={code}>
                                {code}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
    return (
        <div className="flex flex-col gap-1">
            <Label>{label}</Label>
            <Input value={value} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}
