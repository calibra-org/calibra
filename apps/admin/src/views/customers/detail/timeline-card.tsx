"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Bell, FileText, Mail, ShoppingBag, UserCog } from "lucide-react";
import { useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { formatRelativeTime } from "#/lib/format";
import { useCustomerTimeline } from "#/lib/queries/customers";
import type { AdminCustomerTimelineEntry } from "#/lib/types";

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

interface TimelineCardProps {
    customerId: number;
    locale: Locale;
    t: (key: string) => string;
}

export function TimelineCard({ customerId, locale }: TimelineCardProps) {
    const [filter, setFilter] = useState<AdminCustomerTimelineEntry["kind"] | null>(null);
    const types = filter === null ? [] : [filter];
    const { data: rows = [] } = useCustomerTimeline(customerId, types);

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-1">
                <Button
                    type="button"
                    variant={filter === null ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setFilter(null)}
                >
                    All
                </Button>
                {KINDS.map((kind) => (
                    <Button
                        type="button"
                        key={kind}
                        variant={filter === kind ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setFilter(kind)}
                    >
                        {kind}
                    </Button>
                ))}
            </div>
            <ul className="flex flex-col gap-2">
                {rows.length === 0 ? <li className="text-muted-foreground">—</li> : null}
                {rows.map((row, idx) => {
                    const Icon = iconForKind(row.kind);
                    return (
                        <li key={`${row.kind}-${idx}`} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
                            <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-background ring-1 ring-border">
                                <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <div className="flex items-center justify-between gap-2">
                                    <Badge variant="outline" className="text-xs">
                                        {row.kind}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">
                                        {formatRelativeTime(row.occurredAt, locale)}
                                    </span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                                    {JSON.stringify(row.payload, null, 0)}
                                </pre>
                                {row.actor !== null && (
                                    <span className="text-muted-foreground text-xs">{row.actor.email}</span>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
