"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { type PillTone, StatusPill } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ChevronDown, ChevronsUpDown, ChevronUp, ExternalLink, Inbox, TriangleAlert } from "#/icons";
import { formatDate, formatNumber } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { isEditableTarget } from "#/lib/keyboard";
import { useTickets } from "#/lib/queries";
import type { TicketConversation } from "#/lib/types";
import { cn } from "#/lib/utils";

/** Sentinel value for the "all" / no-filter option (base-ui Select needs a non-empty value). */
const ALL = "all";

/** Lifecycle statuses the queue can be filtered by, in workflow order. */
const STATUSES = ["open", "pending", "snoozed", "resolved", "closed", "archived"] as const;

type TicketStatus = (typeof STATUSES)[number];

/** Map a ticket lifecycle status to a pill tone. */
function ticketStatusTone(status: string): PillTone {
    if (status === "open") return "info";
    if (status === "pending" || status === "snoozed") return "warning";
    if (status === "resolved" || status === "closed") return "success";
    return "neutral";
}

/** Toolbar filter dropdown built on the base-ui `Select` primitive. `all` clears the filter. */
function FilterSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
}) {
    /** Include the "all" sentinel so `SelectValue` resolves its label (the filter name) too. */
    const items = [{ value: ALL, label }, ...options];
    return (
        <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : String(next))} items={items}>
            <SelectTrigger className="w-44" aria-label={label}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{label}</SelectItem>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

type Sort = { field: "status" | "last_activity_at"; dir: "asc" | "desc" } | null;

/** Sortable column header — caret reflects the active direction. */
function SortHeader({
    field,
    label,
    sort,
    onSort,
    className,
}: {
    field: "status" | "last_activity_at";
    label: string;
    sort: Sort;
    onSort: (field: "status" | "last_activity_at") => void;
    className?: string;
}) {
    const active = sort?.field === field;
    const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
    return (
        <TableHead className={className}>
            <button
                type="button"
                onClick={() => onSort(field)}
                className="inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:text-foreground"
            >
                {label}
                <Icon className={cn("size-3.5", active ? "text-foreground" : "text-muted-foreground/40")} aria-hidden="true" />
            </button>
        </TableHead>
    );
}

export function TicketsListView() {
    const t = useTranslations("Tickets");
    const tc = useTranslations("Common");
    const locale = useLocale();
    const router = useRouter();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<Sort>(null);
    const [selected, setSelected] = useState(-1);
    const bodyRef = useRef<HTMLTableSectionElement>(null);

    const tickets = useTickets({
        page,
        q: q || undefined,
        status: status || undefined,
        sort: sort ? `${sort.field}:${sort.dir}` : undefined,
    });
    const rows = tickets.data?.data ?? [];

    function onSort(field: "status" | "last_activity_at") {
        setSort((current) =>
            current?.field === field ? { field, dir: current.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" },
        );
        setPage(1);
    }

    /** Reset the keyboard selection whenever the result set changes. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-clamp selection only when the row set identity changes
    useEffect(() => {
        setSelected(-1);
    }, [tickets.data]);

    /** `j` / `k` move the row selection, `Enter` opens it, `Esc` clears — ignored while typing in a field. */
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
            if (rows.length === 0) return;
            if (event.key === "j") {
                event.preventDefault();
                setSelected((index) => Math.min(rows.length - 1, index + 1));
            } else if (event.key === "k") {
                event.preventDefault();
                setSelected((index) => Math.max(0, index < 0 ? 0 : index - 1));
            } else if (event.key === "Enter" && selected >= 0 && rows[selected]) {
                event.preventDefault();
                router.push(`/tickets/${rows[selected].id}`);
            } else if (event.key === "Escape") {
                setSelected(-1);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [rows, selected, router]);

    /** Keep the selected row scrolled into view. */
    useEffect(() => {
        if (selected < 0) return;
        bodyRef.current?.querySelector<HTMLElement>(`[data-row="${selected}"]`)?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    return (
        <div className="flex flex-col gap-4">
            <PageHeader title={t("title")} description={t("subtitle")} />

            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={q}
                    onChange={(event) => {
                        setQ(event.target.value);
                        setPage(1);
                    }}
                    placeholder={t("searchPlaceholder")}
                    className="max-w-xs"
                />
                <FilterSelect
                    label={t("filterStatus")}
                    value={status}
                    onChange={(next) => {
                        setStatus(next);
                        setPage(1);
                    }}
                    options={STATUSES.map((s) => ({ value: s, label: t(`status${cap(s)}` as "statusOpen") }))}
                />
            </div>

            {tickets.isError ? (
                <EmptyState
                    icon={TriangleAlert}
                    title={tc("errorTitle")}
                    description={t("errorBody")}
                    action={
                        <Button variant="outline" onClick={() => tickets.refetch()}>
                            {tc("retry")}
                        </Button>
                    }
                />
            ) : !tickets.isPending && rows.length === 0 ? (
                <EmptyState icon={Inbox} title={t("empty")} description={t("emptyHint")} />
            ) : (
                <div className="mission-panel overflow-hidden">
                    <Table className="console-table">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-20">{t("colId")}</TableHead>
                                <TableHead>{t("colShop")}</TableHead>
                                <TableHead>{t("colSubject")}</TableHead>
                                <SortHeader field="status" label={t("colStatus")} sort={sort} onSort={onSort} />
                                <SortHeader
                                    field="last_activity_at"
                                    label={t("colLastActivity")}
                                    sort={sort}
                                    onSort={onSort}
                                    className="text-end"
                                />
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody ref={bodyRef}>
                            {tickets.isPending
                                ? ["r1", "r2", "r3", "r4", "r5", "r6"].map((k) => (
                                      <TableRow key={k}>
                                          <TableCell colSpan={6}>
                                              <Skeleton className="h-5 w-full" />
                                          </TableCell>
                                      </TableRow>
                                  ))
                                : rows.map((ticket, index) => (
                                      <TicketRow
                                          key={ticket.id}
                                          ticket={ticket}
                                          index={index}
                                          selected={index === selected}
                                          locale={locale}
                                          t={t}
                                      />
                                  ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {tickets.data && tickets.data.meta.lastPage > 1 ? (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        ‹
                    </Button>
                    <span className="text-muted-foreground tabular-nums">
                        {formatNumber(page, locale)} / {formatNumber(tickets.data.meta.lastPage, locale)}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= tickets.data.meta.lastPage}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        ›
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function TicketRow({
    ticket,
    index,
    selected,
    locale,
    t,
}: {
    ticket: TicketConversation;
    index: number;
    selected: boolean;
    locale: string;
    t: ReturnType<typeof useTranslations<"Tickets">>;
}) {
    const shop = ticket.inbox?.name ?? ticket.requester?.name ?? ticket.requester?.identity ?? "—";

    return (
        <TableRow
            data-row={index}
            className={cn("transition-colors hover:bg-accent/40", selected && "bg-accent/60 ring-1 ring-primary/30 ring-inset")}
        >
            <TableCell className="font-mono text-muted-foreground text-xs tabular-nums">#{ticket.display_id}</TableCell>
            <TableCell className="max-w-44 truncate text-muted-foreground text-sm">{shop}</TableCell>
            <TableCell>
                <Link href={`/tickets/${ticket.id}`} className="font-medium hover:underline">
                    {ticket.subject || t("noSubject")}
                </Link>
            </TableCell>
            <TableCell>
                <StatusPill tone={ticketStatusTone(ticket.status)}>{t(`status${cap(ticket.status)}` as "statusOpen")}</StatusPill>
            </TableCell>
            <TableCell className="text-end text-muted-foreground text-sm tabular-nums">
                {formatDate(ticket.last_activity_at, locale)}
            </TableCell>
            <TableCell>
                <div className="flex justify-end">
                    <Button asChild variant="ghost" size="icon" aria-label={t("open")}>
                        <Link href={`/tickets/${ticket.id}`}>
                            <ExternalLink className="size-4" aria-hidden="true" />
                        </Link>
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export type { TicketStatus };
export { STATUSES, ticketStatusTone };
