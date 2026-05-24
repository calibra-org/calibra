"use client";

import type { Locale } from "@calibra/shared/i18n";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { formatDateTime, formatMoney } from "#/lib/format";
import { useCreateRefund, useOrderRefunds } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

interface RefundsCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Full + partial refund form, plus a list of every prior refund on the order. The composer is
 * intentionally minimalist — a per-line picker is a follow-up once the line-level UI on the items
 * card lands. For now the operator types the amount (or leaves it blank to refund the full
 * outstanding) and an optional reason.
 */
export function RefundsCard({ order, locale }: RefundsCardProps) {
    const t = useTranslations("Orders.detail");
    const { data } = useOrderRefunds(order.id);
    const refunds = data?.data ?? [];
    const mutation = useCreateRefund();

    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [restock, setRestock] = useState(false);
    const [open, setOpen] = useState(false);

    const submit = async () => {
        const minor = amount.trim().length === 0 ? null : Number(amount);
        if (minor !== null && (Number.isNaN(minor) || minor <= 0)) {
            toast.add({ title: t("refundFailed"), timeout: 3500, data: { tone: "error" } });
            return;
        }
        try {
            await mutation.mutateAsync({
                order_id: order.id,
                amount_minor: minor,
                reason: reason.trim() || null,
                restock_requested: restock,
            });
            toast.add({ title: t("refundCreated"), timeout: 2500, data: { tone: "success" } });
            setAmount("");
            setReason("");
            setRestock(false);
            setOpen(false);
        } catch {
            toast.add({ title: t("refundFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    return (
        <Card>
            <CardHeader className="flex items-center justify-between border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <RotateCcw className="size-4" aria-hidden="true" />
                    {t("refunds")}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
                    {t("addRefund")}
                </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-4">
                {open && (
                    <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="refund-amount">{t("refundAmount")}</Label>
                            <Input
                                id="refund-amount"
                                inputMode="numeric"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                placeholder={String(order.grandTotal)}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="refund-reason">{t("refundReason")}</Label>
                            <Textarea
                                id="refund-reason"
                                rows={1}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Switch
                                checked={restock}
                                onCheckedChange={(value) => setRestock(value === true)}
                                aria-label={t("refundRestock")}
                            />
                            <span>{t("refundRestock")}</span>
                        </div>
                        <Button onClick={submit} disabled={mutation.isPending} className="md:col-start-2">
                            {t("refundSubmit")}
                        </Button>
                    </div>
                )}

                {refunds.length === 0 ? (
                    <EmptyState title={t("refunds")} description="—" />
                ) : (
                    <ul className="flex flex-col gap-2">
                        {refunds.map((refund) => (
                            <li
                                key={refund.id}
                                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                            >
                                <span>
                                    #{refund.refund_number} · {formatMoney(refund.amount_minor, locale)}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                    {refund.processed_at !== null ? formatDateTime(refund.processed_at, locale) : "—"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
