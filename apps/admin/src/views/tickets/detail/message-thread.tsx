"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Activity, ArrowDownLeft, ArrowUpRight, Lock, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { formatRelativeTime } from "#/lib/format";
import type { TicketMessage } from "#/lib/queries/tickets";
import { cn } from "#/lib/utils";

interface MessageThreadProps {
    messages: TicketMessage[];
    locale: Locale;
}

/**
 * Unified conversation feed. Messages and activity rows share one chronological stream so the
 * operator reads the whole history top-to-bottom without tab-hopping:
 *  - `kind: "activity"` renders as a centred, icon-coded system line (status changes, assignments).
 *  - Internal notes (`private: true`) render in an amber card labelled "Internal note".
 *  - Inbound customer messages align to the start; outbound agent replies align to the end.
 */
export function MessageThread({ messages, locale }: MessageThreadProps) {
    const t = useTranslations("Tickets");

    const ordered = useMemo(
        () => [...messages].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? "")),
        [messages],
    );

    if (ordered.length === 0) {
        return <p className="py-8 text-center text-muted-foreground text-sm">{t("thread.empty")}</p>;
    }

    return (
        <ol className="flex flex-col gap-4">
            {ordered.map((message) => (
                <MessageRow key={message.id} message={message} locale={locale} t={t} />
            ))}
        </ol>
    );
}

interface MessageRowProps {
    message: TicketMessage;
    locale: Locale;
    t: ReturnType<typeof useTranslations>;
}

function MessageRow({ message, locale, t }: MessageRowProps) {
    if (message.kind === "activity") {
        return <ActivityRow message={message} locale={locale} t={t} />;
    }

    const isNote = message.private || message.direction === "internal";
    const isOutbound = message.direction === "outbound";
    const at = message.created_at ?? new Date().toISOString();

    return (
        <li className={cn("flex flex-col gap-1", isOutbound && !isNote ? "items-end" : "items-start")}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                {isNote ? (
                    <Lock className="size-3" aria-hidden="true" />
                ) : isOutbound ? (
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                ) : (
                    <ArrowDownLeft className="size-3" aria-hidden="true" />
                )}
                <span className="font-medium uppercase tracking-wide">
                    {isNote ? t("thread.internalNote") : isOutbound ? t("thread.outbound") : t("thread.inbound")}
                </span>
                <span>{formatRelativeTime(at, locale)}</span>
            </div>
            <div
                className={cn(
                    "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                    isNote
                        ? "border-warning/40 bg-warning/10 text-foreground"
                        : isOutbound
                          ? "border-primary/30 bg-primary/10 text-foreground"
                          : "border-border bg-muted/40 text-foreground",
                )}
            >
                {message.body !== null && message.body !== undefined && message.body.length > 0 ? (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                ) : (
                    <p className="text-muted-foreground italic">{t("thread.noBody")}</p>
                )}
                {message.attachments.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 border-border/60 border-t pt-2">
                        {message.attachments.map((attachment: TicketMessage["attachments"][number]) => (
                            <li key={attachment.id} className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                <Paperclip className="size-3" aria-hidden="true" />
                                {attachment.url !== null && attachment.url !== undefined ? (
                                    <a
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate underline hover:text-foreground"
                                    >
                                        {attachment.url}
                                    </a>
                                ) : (
                                    <span className="truncate">{t("thread.attachment")}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </li>
    );
}

function ActivityRow({ message, locale, t }: MessageRowProps) {
    const at = message.created_at ?? new Date().toISOString();
    return (
        <li className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
            <Activity className="size-3" aria-hidden="true" />
            <span>{message.body ?? t("thread.activity")}</span>
            <span>·</span>
            <span>{formatRelativeTime(at, locale)}</span>
        </li>
    );
}
