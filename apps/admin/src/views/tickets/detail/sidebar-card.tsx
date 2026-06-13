"use client";

import { MessageCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import {
    type TicketConversationDetail,
    useAddTicketTag,
    useRemoveTicketTag,
    useTicketAgents,
    useTicketTags,
    useUpdateTicket,
} from "#/lib/queries/tickets";
import { useSettleMutation } from "#/lib/queries/use-settle-mutation";

const STATUS_VALUES = ["open", "pending", "snoozed", "resolved", "closed", "archived"] as const;
const PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;

const UNASSIGNED = "__unassigned__";

interface SidebarCardProps {
    ticket: TicketConversationDetail;
}

/**
 * Conversation sidebar: the status / priority / assignee selects, the tag editor, the requester
 * card, and the channel block.
 *
 * Status, priority, and assignee all go through {@link useSettleMutation} — picking a value flips
 * the UI instantly and the PATCH only fires once the operator settles, so exploratory clicking
 * doesn't spam the timeline. Tags add/remove are discrete commits (explicit user intent) and write
 * immediately.
 */
export function SidebarCard({ ticket }: SidebarCardProps) {
    const t = useTranslations("Tickets");
    const update = useUpdateTicket(ticket.id);
    const { data: agents = [] } = useTicketAgents();

    const status = useSettleMutation<string, unknown>({
        committedValue: ticket.status,
        mutate: (next) => update.mutateAsync({ status: next }),
    });
    const priority = useSettleMutation<string, unknown>({
        committedValue: ticket.priority,
        mutate: (next) => update.mutateAsync({ priority: next }),
    });
    const assignee = useSettleMutation<string, unknown>({
        committedValue: ticket.assignee_agent_id ?? UNASSIGNED,
        mutate: (next) => update.mutateAsync({ assignee_agent_id: next === UNASSIGNED ? null : Number(next) }),
    });

    return (
        <div className="flex flex-col gap-5 text-sm">
            <Field label={t("sidebar.status")}>
                <Select value={status.pending} onValueChange={(value) => status.setPending(String(value))}>
                    <SelectTrigger aria-label={t("sidebar.status")}>
                        <SelectValue className="flex-1 truncate text-start">{t(`status.${status.pending}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                                {t(`status.${value}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <Field label={t("sidebar.priority")}>
                <Select value={priority.pending} onValueChange={(value) => priority.setPending(String(value))}>
                    <SelectTrigger aria-label={t("sidebar.priority")}>
                        <SelectValue className="flex-1 truncate text-start">{t(`priority.${priority.pending}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {PRIORITY_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                                {t(`priority.${value}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <Field label={t("sidebar.assignee")}>
                <Select value={assignee.pending} onValueChange={(value) => assignee.setPending(String(value))}>
                    <SelectTrigger aria-label={t("sidebar.assignee")}>
                        <SelectValue className="flex-1 truncate text-start">
                            {agents.find((agent) => agent.id === assignee.pending)?.user?.email ?? t("sidebar.unassigned")}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={UNASSIGNED}>{t("sidebar.unassigned")}</SelectItem>
                        {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                                {agent.user?.email ?? agent.id}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <TagsBlock ticket={ticket} t={t} />

            <RequesterBlock ticket={ticket} t={t} />

            <ChannelBlock ticket={ticket} t={t} />
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
            {children}
        </div>
    );
}

function TagsBlock({ ticket, t }: { ticket: TicketConversationDetail; t: ReturnType<typeof useTranslations> }) {
    const { data: allTags = [] } = useTicketTags();
    const add = useAddTicketTag(ticket.id);
    const remove = useRemoveTicketTag(ticket.id);
    const [input, setInput] = useState("");

    const submit = async () => {
        const name = input.trim();
        if (name.length === 0) return;
        await add.mutateAsync(name);
        setInput("");
    };

    const suggestions =
        input.length > 0
            ? allTags
                  .filter(
                      (tag) =>
                          tag.name.toLowerCase().includes(input.toLowerCase()) &&
                          !ticket.tags.some((attached: TicketConversationDetail["tags"][number]) => attached.id === tag.id),
                  )
                  .slice(0, 6)
            : [];

    return (
        <Field label={t("sidebar.tags")}>
            {ticket.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {ticket.tags.map((tag) => (
                        <Badge key={tag.id} variant="secondary" className="gap-1 ps-2.5 pe-1.5">
                            {tag.name}
                            <button
                                type="button"
                                className="rounded-full p-0.5 hover:bg-muted-foreground/15"
                                onClick={() => remove.mutate(tag.id)}
                                aria-label={t("sidebar.removeTag")}
                            >
                                <X className="size-3" aria-hidden="true" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <div className="flex gap-2">
                <Input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    placeholder={t("sidebar.addTag")}
                />
                <Button onClick={submit} disabled={add.isPending || input.trim().length === 0}>
                    {t("sidebar.addTag")}
                </Button>
            </div>
            {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {suggestions.map((tag) => (
                        <button
                            type="button"
                            key={tag.id}
                            className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                                add.mutate(tag.name);
                                setInput("");
                            }}
                        >
                            {tag.name}
                        </button>
                    ))}
                </div>
            )}
        </Field>
    );
}

function RequesterBlock({ ticket, t }: { ticket: TicketConversationDetail; t: ReturnType<typeof useTranslations> }) {
    return (
        <Field label={t("sidebar.requester")}>
            <div className="flex flex-col gap-0.5 rounded-md border bg-muted/30 p-3">
                <span className="font-medium text-foreground">{ticket.requester?.name ?? t("sidebar.unknownRequester")}</span>
                {ticket.requester?.identity !== undefined && (
                    <span className="text-muted-foreground text-xs">{ticket.requester.identity}</span>
                )}
            </div>
        </Field>
    );
}

function ChannelBlock({ ticket, t }: { ticket: TicketConversationDetail; t: ReturnType<typeof useTranslations> }) {
    return (
        <Field label={t("sidebar.channel")}>
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                    <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-foreground">{ticket.inbox?.name ?? t("sidebar.noInbox")}</span>
                </div>
                {ticket.inbox?.channel_type !== undefined && (
                    <span className="text-muted-foreground text-xs">{ticket.inbox.channel_type}</span>
                )}
                {/**
                 * Phase-2 placeholder for the WhatsApp 24h service-window countdown. The channel
                 * block is where that pill will live once the provider exposes the window state.
                 */}
                <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
                    {t("sidebar.whatsappWindowSoon")}
                </span>
            </div>
        </Field>
    );
}
