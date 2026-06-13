"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useTicket, useTicketStream } from "#/lib/queries/tickets";

import { Composer } from "./composer";
import { MessageThread } from "./message-thread";
import { SidebarCard } from "./sidebar-card";

interface TicketDetailProps {
    id: string;
    locale: Locale;
}

const STATUS_TONE: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
    open: "info",
    pending: "warning",
    snoozed: "warning",
    resolved: "success",
    closed: "default",
    archived: "default",
};

/**
 * Conversation thread detail. The two-column layout pairs the live message feed + composer (main)
 * with the status / assignment / requester sidebar (320px).
 *
 * Realtime: {@link useTicketStream} subscribes to the conversation's SSE channel and invalidates the
 * ticket detail query whenever a message lands, so a peer agent's reply (or an inbound customer
 * message) appears without a manual refresh. If SSE is unavailable the hook degrades gracefully and
 * the operator can still refetch with the header button.
 */
export function TicketDetail({ id, locale }: TicketDetailProps) {
    const t = useTranslations("Tickets");
    const queryClient = useQueryClient();
    const { data: ticket, isPending, isError, refetch } = useTicket(id);

    const onStreamEvent = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
    }, [queryClient]);

    useTicketStream(id, onStreamEvent);

    if (isPending) {
        return <TicketDetailSkeleton />;
    }

    if (isError || ticket === undefined || ticket === null) {
        return (
            <section className="flex flex-col gap-3 p-6 text-center">
                <p className="text-muted-foreground text-sm">{t("detail.loadError")}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="self-center">
                    {t("detail.retry")}
                </Button>
            </section>
        );
    }

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-sm">#{ticket.display_id}</span>
                        <Badge variant="secondary" tone={STATUS_TONE[ticket.status] ?? "default"}>
                            {t(`status.${ticket.status}`)}
                        </Badge>
                    </div>
                    <h1 className="font-semibold text-foreground text-lg">
                        {ticket.subject !== null && ticket.subject !== undefined && ticket.subject.length > 0
                            ? ticket.subject
                            : t("detail.noSubject")}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        {ticket.requester?.name ?? ticket.requester?.identity ?? t("sidebar.unknownRequester")}
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    {t("detail.refresh")}
                </Button>
            </header>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                    <div className="rounded-lg border p-4">
                        <MessageThread messages={ticket.messages} locale={locale} />
                    </div>
                    <div className="rounded-lg border p-4">
                        <Composer ticketId={ticket.id} />
                    </div>
                </div>
                <div className="rounded-lg border p-4">
                    <SidebarCard ticket={ticket} />
                </div>
            </div>
        </section>
    );
}

/**
 * First-paint placeholder mirroring the real two-column layout so the screen doesn't reflow when
 * {@link useTicket} resolves.
 */
function TicketDetailSkeleton() {
    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-72" />
                <Skeleton className="h-4 w-40" />
            </header>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 rounded-lg border p-4">
                        {[0, 1, 2].map((key) => (
                            <Skeleton key={key} className="h-16 w-3/4" />
                        ))}
                    </div>
                    <Skeleton className="h-32 w-full rounded-lg" />
                </div>
                <div className="flex flex-col gap-3 rounded-lg border p-4">
                    {[0, 1, 2, 3].map((key) => (
                        <Skeleton key={key} className="h-9 w-full" />
                    ))}
                </div>
            </div>
        </section>
    );
}
