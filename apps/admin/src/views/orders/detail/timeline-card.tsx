"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Activity, Banknote, MessageSquare, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { OrderStatusBadge } from "#/components/OrderStatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { formatDateTime, formatMoney } from "#/lib/format";
import { useAddOrderNote, useOrderNotes, useOrderRefunds } from "#/lib/queries/orders";
import type { AdminOrder, OrderStatus } from "#/lib/types";
import { cn } from "#/lib/utils";

interface TimelineCardProps {
    order: AdminOrder;
    locale: Locale;
}

type TimelineEntry =
    | { kind: "status"; id: string; at: string; to: OrderStatus; reason: string | null }
    | { kind: "note"; id: string; at: string; body: string; visibility: "internal" | "customer" }
    | { kind: "refund"; id: string; at: string; number: number; amount: number; reason: string | null };

/**
 * Unified order timeline. Merges status history + notes + refunds into a single feed so the
 * operator stops hunting across tabs. Newest first. The compose box at the top posts a new note;
 * the visibility toggle decides whether it is internal or sent to the customer.
 */
export function TimelineCard({ order, locale }: TimelineCardProps) {
    const t = useTranslations("Orders.detail.timeline");
    const tStatus = useTranslations("OrderStatus");
    const { data: notesData } = useOrderNotes(order.id);
    const { data: refundsData } = useOrderRefunds(order.id);
    const addNote = useAddOrderNote();

    const [body, setBody] = useState("");
    const [internal, setInternal] = useState(true);

    const entries = useMemo<TimelineEntry[]>(() => {
        const out: TimelineEntry[] = [];
        for (const h of order.history) {
            out.push({ kind: "status", id: `status-${h.id}`, at: h.occurredAt, to: h.toStatus, reason: h.reason });
        }
        for (const note of notesData?.data ?? []) {
            out.push({
                kind: "note",
                id: `note-${note.id}`,
                at: note.created_at,
                body: note.body,
                visibility: note.visibility,
            });
        }
        for (const refund of refundsData?.data ?? []) {
            out.push({
                kind: "refund",
                id: `refund-${refund.id}`,
                at: refund.processed_at ?? new Date().toISOString(),
                number: refund.refund_number,
                amount: refund.amount_minor,
                reason: refund.reason,
            });
        }
        out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
        return out;
    }, [order.history, notesData?.data, refundsData?.data]);

    const submit = async () => {
        const trimmed = body.trim();
        if (trimmed.length === 0) return;
        try {
            await addNote.mutateAsync({
                order_id: order.id,
                body: trimmed,
                visibility: internal ? "internal" : "customer",
                send_email: !internal,
            });
            setBody("");
        } catch {
            toast.add({ title: t("send"), timeout: 3500, data: { tone: "error" } });
        }
    };

    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                    <Activity className="size-4" aria-hidden="true" />
                    {t("title")}
                </CardTitle>
                <p className="text-muted-foreground text-xs">{t("subtitle")}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-5">
                <div className="flex flex-col gap-2">
                    <Textarea
                        rows={2}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder={t("addNotePlaceholder")}
                    />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                            <Switch
                                checked={!internal}
                                onCheckedChange={(value) => setInternal(!(value === true))}
                                aria-label={internal ? t("internal") : t("customer")}
                            />
                            <span>{internal ? t("internal") : t("customer")}</span>
                        </div>
                        <Button size="sm" onClick={submit} disabled={addNote.isPending || body.trim().length === 0}>
                            {t("send")}
                        </Button>
                    </div>
                </div>

                <Separator />

                {entries.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t("empty")}</p>
                ) : (
                    <ol className="flex flex-col gap-3">
                        {entries.map((entry) => (
                            <TimelineRow key={entry.id} entry={entry} locale={locale} tStatus={tStatus} t={t} />
                        ))}
                    </ol>
                )}
            </CardContent>
        </Card>
    );
}

interface TimelineRowProps {
    entry: TimelineEntry;
    locale: Locale;
    tStatus: ReturnType<typeof useTranslations>;
    t: ReturnType<typeof useTranslations>;
}

function TimelineRow({ entry, locale, tStatus, t }: TimelineRowProps) {
    return (
        <li className="flex items-start gap-3">
            <span
                className={cn(
                    "mt-1 grid size-7 shrink-0 place-items-center rounded-full",
                    entry.kind === "status" && "bg-sky-500/15 text-sky-600",
                    entry.kind === "note" && "bg-muted text-foreground/70",
                    entry.kind === "refund" && "bg-rose-500/15 text-rose-600",
                )}
                aria-hidden="true"
            >
                {entry.kind === "status" && <Activity className="size-3.5" />}
                {entry.kind === "note" && <MessageSquare className="size-3.5" />}
                {entry.kind === "refund" && <RotateCcw className="size-3.5" />}
            </span>
            <div className="flex flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {entry.kind === "status" && (
                        <>
                            <span>{t("statusChange", { status: tStatus(entry.to) })}</span>
                            <OrderStatusBadge status={entry.to} />
                        </>
                    )}
                    {entry.kind === "note" && (
                        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                            {entry.visibility === "customer" ? t("customerNote") : t("internalNote")}
                        </span>
                    )}
                    {entry.kind === "refund" && (
                        <span className="flex items-center gap-2">
                            <Banknote className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            {t("refundEntry", { number: entry.number, amount: formatMoney(entry.amount, locale) })}
                        </span>
                    )}
                    <span className="text-muted-foreground text-xs">{formatDateTime(entry.at, locale)}</span>
                </div>
                {entry.kind === "note" && <p className="text-sm">{entry.body}</p>}
                {entry.kind === "status" && entry.reason !== null && (
                    <p className="text-muted-foreground text-xs">{entry.reason}</p>
                )}
                {entry.kind === "refund" && entry.reason !== null && (
                    <p className="text-muted-foreground text-xs">{entry.reason}</p>
                )}
            </div>
        </li>
    );
}
