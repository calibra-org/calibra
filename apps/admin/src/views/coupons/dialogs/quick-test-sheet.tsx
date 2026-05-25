"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { formatMoney } from "#/lib/format";
import { type TestResult, useTestCoupon } from "#/lib/queries/coupons";
import { ProductPicker } from "#/views/coupons/shared/product-picker";

interface QuickTestSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    couponId: number;
}

interface LineItem {
    productId: number;
    quantity: number;
}

/**
 * Slide-out that builds a synthetic cart and posts it to `POST /admin/coupons/:id/test`. The
 * result is rendered as either a green success card (with the discount math) or a red failure
 * card (with the localized reason). No DB writes happen — the backend reuses the same
 * `checkEligibility` + `computeDiscounts` pipeline the storefront cart uses.
 */
export function QuickTestSheet({ open, onOpenChange, couponId }: QuickTestSheetProps) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons.quickTest");

    const [email, setEmail] = useState("");
    const [country, setCountry] = useState("IR");
    const [items, setItems] = useState<LineItem[]>([]);
    const [result, setResult] = useState<TestResult | null>(null);

    const test = useTestCoupon(couponId);

    const addProduct = (productId: number) => {
        setItems((prev) => {
            const existing = prev.find((row) => row.productId === productId);
            if (existing) return prev;
            return [...prev, { productId, quantity: 1 }];
        });
    };

    const setQuantity = (productId: number, quantity: number) => {
        setItems((prev) => prev.map((row) => (row.productId === productId ? { ...row, quantity } : row)));
    };

    const removeItem = (productId: number) => {
        setItems((prev) => prev.filter((row) => row.productId !== productId));
    };

    const submit = async () => {
        if (items.length === 0) return;
        const payload = {
            email: email.trim() || null,
            country: country.trim() || undefined,
            line_items: items.map((row) => ({ product_id: row.productId, quantity: row.quantity })),
        };
        const response = await test.mutateAsync(payload);
        setResult(response.data);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="end" className="sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle>{t("title")}</SheetTitle>
                    <SheetDescription>{t("description")}</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-4 p-4">
                    <div className="flex flex-col gap-1.5">
                        <Label>{t("products")}</Label>
                        <ProductPicker
                            selectedIds={items.map((row) => row.productId)}
                            onSelectionChange={(next) => {
                                const removed = items.filter((row) => !next.includes(row.productId)).map((row) => row.productId);
                                for (const id of removed) removeItem(id);
                                const added = next.filter((id) => !items.find((row) => row.productId === id));
                                for (const id of added) addProduct(id);
                            }}
                            placeholder={t("addProduct")}
                        />
                        {items.length > 0 && (
                            <div className="flex flex-col gap-2 rounded-md border border-border p-2">
                                {items.map((row) => (
                                    <div key={row.productId} className="flex items-center gap-2 text-sm">
                                        <span className="grow truncate">#{row.productId}</span>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={row.quantity}
                                            onChange={(e) => setQuantity(row.productId, Math.max(1, Number(e.target.value) || 1))}
                                            className="h-8 w-20"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeItem(row.productId)}
                                            aria-label={t("removeItem")}
                                        >
                                            <Trash2 className="size-4" aria-hidden="true" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="qt-email">{t("email")}</Label>
                            <Input
                                id="qt-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                dir="ltr"
                                placeholder="user@example.com"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="qt-country">{t("country")}</Label>
                            <Input
                                id="qt-country"
                                value={country}
                                onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                                maxLength={2}
                                dir="ltr"
                            />
                        </div>
                    </div>

                    {result !== null && <ResultCard result={result} locale={locale} t={t} />}
                </div>
                <SheetFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={test.isPending}>
                        {t("close")}
                    </Button>
                    <Button onClick={submit} disabled={test.isPending || items.length === 0}>
                        {t("runTest")}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

function ResultCard({
    result,
    locale,
    t,
}: {
    result: TestResult;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}) {
    if (result.eligible) {
        const calc = result.calculation;
        return (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                <Badge className="w-fit bg-emerald-600 text-white">{t("eligibleBadge")}</Badge>
                {calc !== undefined && (
                    <div className="grid grid-cols-2 gap-2">
                        <ResultLine label={t("calc.subtotal")} value={formatMoney(calc.items_subtotal_minor, locale)} />
                        <ResultLine
                            label={t("calc.discount")}
                            value={`− ${formatMoney(calc.discount_minor, locale)}`}
                            emphasis
                        />
                        <ResultLine label={t("calc.shipping")} value={formatMoney(calc.shipping_minor, locale)} />
                        <ResultLine label={t("calc.total")} value={formatMoney(calc.grand_total_minor, locale)} emphasis />
                    </div>
                )}
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <Badge variant="destructive" className="w-fit">
                {t("ineligibleBadge")}
            </Badge>
            <p className="text-sm">{result.reason_message ?? result.reason ?? t("unknownReason")}</p>
        </div>
    );
}

function ResultLine({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className={emphasis ? "font-medium tabular-nums text-sm" : "tabular-nums text-xs"}>{value}</span>
        </div>
    );
}
