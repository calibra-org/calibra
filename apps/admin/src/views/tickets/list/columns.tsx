"use client";

import type { Locale } from "@calibra/shared/i18n";
import type { ColumnDef } from "@tanstack/react-table";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { DataTableColumnHeader } from "#/components/ui/data-grid/data-table-column-header";
import type { SortState } from "#/components/ui/data-grid/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "#/components/ui/dropdown-menu";
import { ArrowUpRight, Globe, Mail, MessageCircle, MoreHorizontal, Phone, Send } from "#/icons";
import { formatDate, formatRelativeTime } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { TicketConversation } from "#/lib/queries/tickets";

/** Tone mapping for the status pill — open is loud, terminal states are muted. */
function statusTone(status: TicketConversation["status"]): "default" | "secondary" | "destructive" | "outline" {
    if (status === "open") return "default";
    if (status === "pending" || status === "snoozed") return "secondary";
    if (status === "resolved" || status === "closed") return "outline";
    return "outline";
}

/** Tone mapping for the priority pill. */
function priorityTone(priority: TicketConversation["priority"]): "default" | "secondary" | "destructive" | "outline" {
    if (priority === "urgent") return "destructive";
    if (priority === "high") return "default";
    if (priority === "normal") return "secondary";
    return "outline";
}

/** Channel-type → icon. Falls back to a generic message bubble for unknown channels. */
function ChannelIcon({ channelType }: { channelType: string | undefined }) {
    const type = (channelType ?? "").toLowerCase();
    if (type.includes("email") || type.includes("mail"))
        return <Mail className="size-4 text-muted-foreground" aria-hidden="true" />;
    if (type.includes("phone") || type.includes("voice"))
        return <Phone className="size-4 text-muted-foreground" aria-hidden="true" />;
    if (type.includes("web") || type.includes("widget"))
        return <Globe className="size-4 text-muted-foreground" aria-hidden="true" />;
    if (type.includes("telegram") || type.includes("sms"))
        return <Send className="size-4 text-muted-foreground" aria-hidden="true" />;
    return <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

interface ColumnContext {
    locale: Locale;
    sort: SortState | undefined;
    onSort: (next: SortState | undefined) => void;
    onHideColumn: (columnId: string) => void;
    sortLabels: { asc: string; desc: string; hide: string };
    t: (key: string, values?: Record<string, string | number>) => string;
    statusT: (key: string) => string;
    priorityT: (key: string) => string;
    agentName: (agentId: string | null | undefined) => string | null;
    onOpen: (row: TicketConversation) => void;
}

export function buildTicketColumns(ctx: ColumnContext): ColumnDef<TicketConversation>[] {
    const { locale, t, statusT, priorityT, agentName, onOpen } = ctx;
    const sortableHeader = (columnId: string, title: string, className?: string) => () => (
        <DataTableColumnHeader
            columnId={columnId}
            title={title}
            sort={ctx.sort}
            onSort={ctx.onSort}
            onHide={() => ctx.onHideColumn(columnId)}
            labels={ctx.sortLabels}
            className={className}
        />
    );
    return [
        {
            id: "select",
            header: ({ table }) => {
                const all = table.getIsAllPageRowsSelected();
                const some = table.getIsSomePageRowsSelected();
                return (
                    <Checkbox
                        aria-label={t("selectAll")}
                        checked={all}
                        indeterminate={!all && some}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(value === true)}
                    />
                );
            },
            cell: ({ row }) => (
                <Checkbox
                    aria-label={t("selectRow")}
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(value === true)}
                    onClick={(event) => event.stopPropagation()}
                />
            ),
            enableSorting: false,
            enableHiding: false,
            size: 36,
        },
        {
            id: "displayId",
            header: sortableHeader("display_id", t("table.id")),
            cell: ({ row }) => (
                <span dir="ltr" className="font-medium text-muted-foreground text-xs">
                    #{row.original.display_id}
                </span>
            ),
            size: 72,
        },
        {
            id: "requester",
            header: t("table.requester"),
            cell: ({ row }) => {
                const requester = row.original.requester;
                const name = requester?.name ?? requester?.identity ?? t("unknownRequester");
                return (
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{name}</span>
                        {requester?.identity && requester.identity !== name ? (
                            <span dir="ltr" className="truncate text-muted-foreground text-xs">
                                {requester.identity}
                            </span>
                        ) : null}
                    </div>
                );
            },
        },
        {
            id: "subject",
            header: t("table.subject"),
            cell: ({ row }) => {
                const subject = row.original.subject;
                return (
                    <Link href={`/tickets/${row.original.id}` as never} className="truncate font-medium hover:underline">
                        {subject && subject.length > 0 ? subject : t("noSubject")}
                    </Link>
                );
            },
        },
        {
            id: "channel",
            header: t("table.channel"),
            cell: ({ row }) => (
                <div className="flex items-center" title={row.original.inbox?.channel_type ?? ""}>
                    <ChannelIcon channelType={row.original.inbox?.channel_type} />
                </div>
            ),
            size: 64,
        },
        {
            id: "status",
            header: sortableHeader("status", t("table.status")),
            cell: ({ row }) => (
                <Badge variant={statusTone(row.original.status)} className="text-xs">
                    {statusT(row.original.status)}
                </Badge>
            ),
        },
        {
            id: "priority",
            header: sortableHeader("priority", t("table.priority")),
            cell: ({ row }) => (
                <Badge variant={priorityTone(row.original.priority)} className="text-xs">
                    {priorityT(row.original.priority)}
                </Badge>
            ),
        },
        {
            id: "assignee",
            header: t("table.assignee"),
            cell: ({ row }) => {
                const name = agentName(row.original.assignee_agent_id);
                return name !== null ? (
                    <span className="truncate text-xs">{name}</span>
                ) : (
                    <span className="text-muted-foreground text-xs">{t("unassigned")}</span>
                );
            },
        },
        {
            id: "lastActivity",
            header: sortableHeader("last_activity_at", t("table.lastActivity")),
            cell: ({ row }) =>
                row.original.last_activity_at ? (
                    <span title={formatDate(row.original.last_activity_at, locale)} className="text-muted-foreground text-xs">
                        {formatRelativeTime(row.original.last_activity_at, locale)}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: "tags",
            header: t("table.tags"),
            cell: ({ row }) => {
                const visible = row.original.tags.slice(0, 3);
                const overflow = Math.max(0, row.original.tags.length - 3);
                if (visible.length === 0) return <span className="text-muted-foreground">—</span>;
                return (
                    <div className="flex flex-wrap gap-1">
                        {visible.map((tag) => (
                            <Badge key={tag.id} variant="secondary" className="text-xs">
                                {tag.name}
                            </Badge>
                        ))}
                        {overflow > 0 ? (
                            <Badge variant="outline" className="text-xs">
                                +{overflow}
                            </Badge>
                        ) : null}
                    </div>
                );
            },
        },
        {
            id: "actions",
            header: () => <span className="sr-only">{t("table.actions")}</span>,
            cell: ({ row }) => {
                const ticket = row.original;
                return (
                    <div className="flex items-center justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => onOpen(ticket)}
                            aria-label={t("rowActions.open")}
                        >
                            <ArrowUpRight className="size-4" aria-hidden="true" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={(props) => (
                                    <Button
                                        {...props}
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-8"
                                        aria-label={t("table.actions")}
                                    >
                                        <MoreHorizontal className="size-4" aria-hidden="true" />
                                    </Button>
                                )}
                            />
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                    render={(props) => (
                                        <Link {...props} href={`/tickets/${ticket.id}` as never}>
                                            {t("rowActions.open")}
                                        </Link>
                                    )}
                                />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                );
            },
            enableSorting: false,
            enableHiding: false,
            size: 88,
        },
    ];
}
