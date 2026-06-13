"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Reveal } from "#/components/Reveal";
import { StatusPill } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import { ArrowStart, CornerDownLeft, Inbox, MessageSquareReply, TriangleAlert, User } from "#/icons";
import { formatDate } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useReplyTicket, useTicket, useUpdateTicket } from "#/lib/queries";
import type { TicketConversationDetail, TicketMessage } from "#/lib/types";
import { cn } from "#/lib/utils";

import { STATUSES, ticketStatusTone } from "./tickets-list";

export function TicketDetailView({ id }: { id: string }) {
    const t = useTranslations("Tickets");
    const tc = useTranslations("Common");
    const ticket = useTicket(id);
    const router = useRouter();

    if (ticket.isPending) return <Skeleton className="h-96 w-full rounded-lg" />;
    if (ticket.isError || !ticket.data) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title={tc("errorTitle")}
                description={tc("error")}
                action={
                    <Button variant="outline" onClick={() => ticket.refetch()}>
                        {tc("retry")}
                    </Button>
                }
            />
        );
    }
    const conversation = ticket.data;

    return (
        <Reveal>
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push("/tickets")}>
                <ArrowStart className="size-4" aria-hidden="true" />
                {t("back")}
            </Button>

            <Header conversation={conversation} id={id} />

            <Thread messages={conversation.messages} />

            <Composer id={id} />
        </Reveal>
    );
}

function Header({ conversation, id }: { conversation: TicketConversationDetail; id: string }) {
    const t = useTranslations("Tickets");
    const update = useUpdateTicket(id);

    return (
        <PageHeader
            title={
                <span className="flex items-center gap-3">
                    <span className="font-mono text-base text-muted-foreground tabular-nums">#{conversation.display_id}</span>
                    {conversation.subject || t("noSubject")}
                </span>
            }
            description={
                <span className="flex items-center gap-2 text-muted-foreground">
                    <StatusPill tone={ticketStatusTone(conversation.status)}>
                        {t(`status${cap(conversation.status)}` as "statusOpen")}
                    </StatusPill>
                    <span>·</span>
                    <span>{conversation.inbox?.name ?? conversation.requester?.identity ?? "—"}</span>
                </span>
            }
            actions={
                <Select
                    value={conversation.status}
                    onValueChange={(next) => update.mutate({ status: String(next) })}
                    items={STATUSES.map((s) => ({ value: s, label: t(`status${cap(s)}` as "statusOpen") }))}
                >
                    <SelectTrigger className="w-44" loading={update.isPending} aria-label={t("statusLabel")}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                                {t(`status${cap(s)}` as "statusOpen")}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            }
        />
    );
}

function Thread({ messages }: { messages: TicketMessage[] }) {
    const t = useTranslations("Tickets");

    if (messages.length === 0) {
        return (
            <div className="mt-6">
                <EmptyState icon={Inbox} title={t("threadEmpty")} />
            </div>
        );
    }

    return (
        <div className="mt-6 flex flex-col gap-3">
            {messages.map((message) => (
                <MessageBubble key={message.id} message={message} t={t} />
            ))}
        </div>
    );
}

function MessageBubble({ message, t }: { message: TicketMessage; t: ReturnType<typeof useTranslations<"Tickets">> }) {
    const locale = useLocale();
    const outbound = message.direction === "outbound";
    const internal = message.private || message.direction === "internal" || message.kind === "note";

    return (
        <div className={cn("flex flex-col gap-1", outbound && "items-end")}>
            <div
                className={cn(
                    "max-w-2xl rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset",
                    internal
                        ? "bg-warning/10 ring-warning/25"
                        : outbound
                          ? "bg-primary/10 ring-primary/20"
                          : "bg-muted/50 ring-border",
                )}
            >
                {internal ? (
                    <p className="mb-1 font-medium text-[10px] text-warning uppercase tracking-widest">{t("internalNote")}</p>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{message.body || "—"}</p>
            </div>
            <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-xs">
                <User className="size-3" aria-hidden="true" />
                <span>{t(`author${cap(message.author_kind)}` as "authorSystem")}</span>
                <span>·</span>
                <span className="tabular-nums">{formatDate(message.created_at, locale)}</span>
            </div>
        </div>
    );
}

function Composer({ id }: { id: string }) {
    const t = useTranslations("Tickets");
    const reply = useReplyTicket(id);
    const [body, setBody] = useState("");

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (body.trim().length === 0) return;
        await reply.mutateAsync(body.trim());
        setBody("");
    }

    /** ⌘/Ctrl + Enter submits from the textarea without leaving the keyboard. */
    function onKeyDown(event: React.KeyboardEvent) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void onSubmit(event as unknown as FormEvent);
        }
    }

    return (
        <form onSubmit={onSubmit} className="mission-panel mt-6 flex flex-col gap-3 p-3">
            <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("replyPlaceholder")}
                rows={4}
                className="resize-none"
            />
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-muted-foreground text-xs">
                    <CornerDownLeft className="size-3" aria-hidden="true" />
                    {t("replyHint")}
                </span>
                <Button type="submit" disabled={reply.isPending || body.trim().length === 0}>
                    <MessageSquareReply className="size-4" aria-hidden="true" />
                    {t("reply")}
                </Button>
            </div>
        </form>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
