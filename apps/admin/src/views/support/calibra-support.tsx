"use client";

import type { Locale } from "@calibra/shared/i18n";
import { LifeBuoy, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import {
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
} from "#/components/ui/dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { formatRelativeTime } from "#/lib/format";
import {
    type TicketConversation,
    type TicketMessage,
    useOpenSupportTicket,
    usePostSupportMessage,
    useSupportTicket,
    useSupportTickets,
} from "#/lib/queries/tickets";
import { cn } from "#/lib/utils";

type SupportStatus = TicketConversation["status"];

const STATUS_TONE: Record<SupportStatus, "default" | "success" | "warning"> = {
    open: "warning",
    pending: "warning",
    snoozed: "default",
    resolved: "success",
    closed: "default",
    archived: "default",
};

/** Shop-admin → Calibra "Contact support" surface: a ticket list beside the active thread. */
export function CalibraSupport() {
    const t = useTranslations("Support");
    const { data, isLoading } = useSupportTickets();
    const [activeId, setActiveId] = useState<string | null>(null);

    const tickets = data?.data ?? [];

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<NewTicketDialog onCreated={setActiveId} />} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <TicketList tickets={tickets} isLoading={isLoading} activeId={activeId} onSelect={setActiveId} t={t} />
                <div className="min-w-0">
                    {activeId === null ? (
                        <Card>
                            <CardContent className="py-16">
                                <EmptyState
                                    icon={LifeBuoy}
                                    title={t("emptyThread.title")}
                                    description={t("emptyThread.description")}
                                />
                            </CardContent>
                        </Card>
                    ) : (
                        <TicketThread id={activeId} t={t} />
                    )}
                </div>
            </div>
        </div>
    );
}

interface TicketListProps {
    tickets: TicketConversation[];
    isLoading: boolean;
    activeId: string | null;
    onSelect: (id: string) => void;
    t: (key: string) => string;
}

function TicketList({ tickets, isLoading, activeId, onSelect, t }: TicketListProps) {
    const locale = useLocale() as Locale;

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
            </div>
        );
    }

    if (tickets.length === 0) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-muted-foreground text-sm">{t("noTickets")}</CardContent>
            </Card>
        );
    }

    return (
        <ul className="flex flex-col gap-2">
            {tickets.map((ticket) => (
                <li key={ticket.id}>
                    <button
                        type="button"
                        onClick={() => onSelect(ticket.id)}
                        className={cn(
                            "flex w-full flex-col gap-1 rounded-lg border p-3 text-start transition-colors hover:bg-muted/50",
                            activeId === ticket.id ? "border-primary bg-muted/40" : "bg-background",
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-sm">{ticket.subject ?? `#${ticket.display_id}`}</span>
                            <Badge variant="outline" tone={STATUS_TONE[ticket.status]} className="shrink-0">
                                {t(`status.${ticket.status}`)}
                            </Badge>
                        </div>
                        <span className="text-muted-foreground text-xs">
                            {ticket.last_activity_at ? formatRelativeTime(ticket.last_activity_at, locale) : ""}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function TicketThread({ id, t }: { id: string; t: (key: string) => string }) {
    const locale = useLocale() as Locale;
    const { data: ticket, isLoading } = useSupportTicket(id);
    const post = usePostSupportMessage(id);
    const [body, setBody] = useState("");

    const submit = async () => {
        if (body.trim().length === 0) return;
        await post.mutateAsync({ body: body.trim() });
        setBody("");
    };

    if (isLoading || !ticket) {
        return <Skeleton className="h-96 w-full rounded-xl" />;
    }

    return (
        <Card className="flex h-full flex-col">
            <CardContent className="flex flex-1 flex-col gap-4 pt-6">
                <div className="flex items-center justify-between gap-2 border-b pb-4">
                    <div className="flex flex-col gap-0.5">
                        <h2 className="font-semibold text-lg">{ticket.subject ?? `#${ticket.display_id}`}</h2>
                        <span className="text-muted-foreground text-xs" dir="ltr">
                            #{ticket.display_id}
                        </span>
                    </div>
                    <Badge variant="outline" tone={STATUS_TONE[ticket.status]}>
                        {t(`status.${ticket.status}`)}
                    </Badge>
                </div>
                <ul className="flex flex-1 flex-col gap-3">
                    {ticket.messages.map((message) => (
                        <MessageBubble key={message.id} message={message} locale={locale} />
                    ))}
                </ul>
                <div className="flex flex-col gap-2 border-t pt-4">
                    <Label className="text-sm">{t("reply")}</Label>
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder={t("replyPlaceholder")}
                        rows={3}
                    />
                    <div className="flex justify-end">
                        <Button onClick={submit} disabled={post.isPending || body.trim().length === 0} className="gap-2">
                            {post.isPending ? <Spinner className="size-4" /> : <Send className="size-4" />}
                            {t("send")}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function MessageBubble({ message, locale }: { message: TicketMessage; locale: Locale }) {
    /** Outbound = the shop replying to Calibra; render it end-aligned. Inbound = Calibra's reply. */
    const fromShop = message.direction === "outbound";

    return (
        <li className={cn("flex flex-col gap-1", fromShop ? "items-end" : "items-start")}>
            <div
                className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    fromShop ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
            >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </div>
            <span className="text-muted-foreground text-xs">
                {message.created_at ? formatRelativeTime(message.created_at, locale) : ""}
            </span>
        </li>
    );
}

function NewTicketDialog({ onCreated }: { onCreated: (id: string) => void }) {
    const t = useTranslations("Support");
    const open = useOpenSupportTicket();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");

    const submit = async () => {
        if (subject.trim().length === 0 || body.trim().length === 0) return;
        const created = await open.mutateAsync({ subject: subject.trim(), body: body.trim() });
        setSubject("");
        setBody("");
        setDialogOpen(false);
        if (created?.data?.id) onCreated(created.data.id);
    };

    return (
        <DialogRoot open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
                render={
                    <Button className="gap-2">
                        <LifeBuoy className="size-4" />
                        {t("newTicket")}
                    </Button>
                }
            />
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("newTicket")}</DialogTitle>
                    <DialogDescription>{t("newTicketSubtitle")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("subject")}</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-sm">{t("message")}</Label>
                        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                        {t("cancel")}
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={open.isPending || subject.trim().length === 0 || body.trim().length === 0}
                        className="gap-2"
                    >
                        {open.isPending ? <Spinner className="size-4" /> : null}
                        {t("create")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </DialogRoot>
    );
}
