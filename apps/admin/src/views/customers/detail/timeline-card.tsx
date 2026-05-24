"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Bell, FileText, Mail, ShoppingBag, UserCog } from "lucide-react";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatMoney, formatRelativeTime } from "#/lib/format";
import { useCustomerTimeline } from "#/lib/queries/customers";
import type { AdminCustomerTimelineEntry, MoneyMinor } from "#/lib/types";

const KINDS: AdminCustomerTimelineEntry["kind"][] = ["order", "note", "status", "marketing", "impersonation"];

function iconForKind(kind: AdminCustomerTimelineEntry["kind"]) {
    switch (kind) {
        case "order":
            return ShoppingBag;
        case "note":
            return FileText;
        case "status":
            return UserCog;
        case "marketing":
            return Mail;
        case "impersonation":
            return Bell;
    }
}

/**
 * Renders a one-line, locale-aware summary for one timeline row's payload. Falls back to the raw
 * JSON only when the kind is unknown — every known kind has a tailored line that reads naturally
 * in both fa and en.
 */
function describePayload(
    entry: AdminCustomerTimelineEntry,
    locale: Locale,
    t: (key: string, values?: Record<string, string | number>) => string,
): React.ReactNode {
    const p = entry.payload;
    if (entry.kind === "order") {
        const number = String(p.number ?? p.order_id ?? "");
        const total = Number(p.grand_total_minor ?? 0) as MoneyMinor;
        const status = String(p.status ?? "");
        return t("timelineSection.order.summary", { number, total: formatMoney(total, locale), status });
    }
    if (entry.kind === "note") {
        return <span className="whitespace-pre-wrap break-words">{String(p.body ?? "")}</span>;
    }
    if (entry.kind === "status") {
        const from = p.from === null || p.from === undefined ? "—" : String(p.from);
        const to = String(p.to ?? "");
        const reason = p.reason !== null && p.reason !== undefined && p.reason !== "" ? String(p.reason) : null;
        return reason
            ? t("timelineSection.status.summaryWithReason", { from, to, reason })
            : t("timelineSection.status.summary", { from, to });
    }
    if (entry.kind === "marketing") {
        const channel = String(p.channel ?? "");
        const opt = p.opt_in === true;
        const onOff = opt ? t("detail.channelEnabled") : t("detail.channelDisabled");
        return t("timelineSection.marketing.summary", { channel, onOff });
    }
    if (entry.kind === "impersonation") {
        return t("timelineSection.impersonation.summary");
    }
    return <code className="text-xs">{JSON.stringify(p)}</code>;
}

interface TimelineCardProps {
    customerId: number;
    locale: Locale;
    t: (key: string, values?: Record<string, string | number>) => string;
}

export function TimelineCard({ customerId, locale, t }: TimelineCardProps) {
    const [filter, setFilter] = useState<AdminCustomerTimelineEntry["kind"] | null>(null);
    const types = filter === null ? [] : [filter];
    const { data: rows = [] } = useCustomerTimeline(customerId, types);

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-1">
                <Button type="button" variant={filter === null ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(null)}>
                    {t("timelineSection.filter.all")}
                </Button>
                {KINDS.map((kind) => (
                    <Button
                        type="button"
                        key={kind}
                        variant={filter === kind ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setFilter(kind)}
                    >
                        {t(`timelineSection.kind.${kind}`)}
                    </Button>
                ))}
            </div>
            <ul className="flex flex-col gap-2">
                {rows.length === 0 ? <li className="text-muted-foreground">—</li> : null}
                {rows.map((row) => {
                    const Icon = iconForKind(row.kind);
                    const stableKey = `${row.kind}:${row.occurredAt}:${JSON.stringify(row.payload)}`;
                    return (
                        <li key={stableKey} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
                            <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-background ring-1 ring-border">
                                <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex items-center justify-between gap-2">
                                    <Badge variant="outline" className="text-xs">
                                        {t(`timelineSection.kind.${row.kind}`)}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">
                                        {formatRelativeTime(row.occurredAt, locale)}
                                    </span>
                                </div>
                                <div className="text-foreground text-sm">{describePayload(row, locale, t)}</div>
                                {row.actor !== null && <span className="text-muted-foreground text-xs">{row.actor.email}</span>}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
