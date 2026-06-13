"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";
import { parseAsString, parseAsStringEnum } from "nuqs";
import { useCallback, useEffect, useMemo } from "react";

import { PageHeader } from "#/components/PageHeader";
import {
    ActiveFilterChips,
    DataTable,
    DataTableToolbar,
    DataTableViewOptions,
    type FacetedFilterDef,
    useColumnState,
    useSelectionState,
} from "#/components/ui/data-grid";
import { Flag, Inbox, UserCircle } from "#/icons";
import { formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import type { TicketConversation } from "#/lib/queries/tickets";
import { type TicketTab, useInboxes, useTicketAgents, useTicketsList } from "#/lib/queries/tickets";
import {
    type FacetColumnMap,
    singleSortToTableView,
    tableViewToSingleSort,
    useFacetValuesFromQuery,
    useSetFacetValue,
    useTableView,
} from "#/lib/table-view";

import { TicketBulkActions } from "./bulk-actions";
import { buildTicketColumns } from "./columns";
import { TicketStatusTabs } from "./status-tabs";

const TABLE_ID = "admin.tickets.list";

const TAB_VALUES: TicketTab[] = ["all", "open", "pending", "snoozed", "resolved", "closed", "archived"];

const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;

/**
 * Facet → TableView column mapping. The toolbar's `inbox` facet projects onto
 * `filter[]=inbox_id:in:...`; `priority` onto `filter[]=priority:in:...`; `assignee` onto
 * `filter[]=assignee_agent_id:in:...`. Status lives on the tab strip, not a facet.
 */
const FACET_COLUMN_MAP: FacetColumnMap = {
    inbox: { field: "inbox_id", op: "in" },
    priority: { field: "priority", op: "in" },
    assignee: { field: "assignee_agent_id", op: "in" },
};

export function TicketsListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Tickets");
    const statusT = useTranslations("Tickets.status");
    const priorityT = useTranslations("Tickets.priority");
    const router = useRouter();

    const tv = useTableView({
        extras: {
            q: parseAsString.withDefault(""),
            tab: parseAsStringEnum<TicketTab>(TAB_VALUES).withDefault("all"),
        },
    });

    const ui = useColumnState({
        id: TABLE_ID,
        defaultColumnVisibility: { tags: false },
    });

    const selection = useSelectionState();

    const { data: inboxes } = useInboxes();
    const { data: agents } = useTicketAgents();

    const agentName = useCallback(
        (agentId: string | null | undefined): string | null => {
            if (agentId === null || agentId === undefined) return null;
            const agent = (agents ?? []).find((a) => a.id === agentId);
            return agent?.user?.email ?? agentId;
        },
        [agents],
    );

    const facets = useMemo<FacetedFilterDef[]>(
        () => [
            {
                paramKey: "inbox",
                label: t("table.inbox"),
                multiple: true,
                icon: <Inbox className="size-3.5" aria-hidden="true" />,
                options: (inboxes ?? []).map((i) => ({ value: i.id, label: i.name })),
            },
            {
                paramKey: "priority",
                label: t("table.priority"),
                multiple: true,
                icon: <Flag className="size-3.5" aria-hidden="true" />,
                options: PRIORITY_OPTIONS.map((p) => ({ value: p, label: priorityT(p as never) })),
            },
            {
                paramKey: "assignee",
                label: t("table.assignee"),
                multiple: true,
                icon: <UserCircle className="size-3.5" aria-hidden="true" />,
                options: (agents ?? []).map((a) => ({ value: a.id, label: a.user?.email ?? a.id })),
            },
        ],
        [t, priorityT, inboxes, agents],
    );

    const facetValues = useFacetValuesFromQuery(tv.query, FACET_COLUMN_MAP);
    const setFacetValues = useSetFacetValue(tv.query, tv.setFilter, FACET_COLUMN_MAP);

    const sort = tableViewToSingleSort(tv.query.sort);
    const setSort = useCallback(
        (next: typeof sort) => {
            tv.setSort(singleSortToTableView(next));
        },
        [tv.setSort],
    );

    const {
        data: result,
        isPending,
        isError,
        refetch,
    } = useTicketsList({
        query: tv.query,
        q: tv.q.length > 0 ? tv.q : undefined,
        tab: tv.tab,
    });

    const columns = useMemo(
        () =>
            buildTicketColumns({
                locale,
                sort,
                onSort: setSort,
                onHideColumn: (columnId) => ui.setColumnVisibility({ ...ui.columnVisibility, [columnId]: false }),
                sortLabels: { asc: t("sort.asc"), desc: t("sort.desc"), hide: t("sort.hide") },
                t: (key, values) => t(key, values),
                statusT: (key) => statusT(key as never),
                priorityT: (key) => priorityT(key as never),
                agentName,
                onOpen: (row) => router.push(`/tickets/${row.id}` as never),
            }),
        [locale, t, statusT, priorityT, agentName, sort, setSort, ui.columnVisibility, ui.setColumnVisibility, router],
    );

    const meta = result?.meta ?? { page: tv.query.page, limit: tv.query.limit, total: 0, lastPage: 1 };

    const columnVisibilityItems = useMemo(
        () => [
            { id: "displayId", label: t("table.id"), canHide: true },
            { id: "requester", label: t("table.requester"), canHide: false },
            { id: "subject", label: t("table.subject"), canHide: false },
            { id: "channel", label: t("table.channel"), canHide: true },
            { id: "status", label: t("table.status"), canHide: true },
            { id: "priority", label: t("table.priority"), canHide: true },
            { id: "assignee", label: t("table.assignee"), canHide: true },
            { id: "lastActivity", label: t("table.lastActivity"), canHide: true },
            { id: "tags", label: t("table.tags"), canHide: true },
        ],
        [t],
    );

    const activeChips = useMemo(() => {
        const out: { key: string; value: string; label: React.ReactNode }[] = [];
        for (const facet of facets) {
            const values = facetValues[facet.paramKey] ?? [];
            for (const v of values) {
                const opt = facet.options.find((o) => o.value === v);
                out.push({ key: facet.paramKey, value: v, label: opt?.label ?? v });
            }
        }
        return out;
    }, [facets, facetValues]);

    const hasActiveFilters =
        tv.q.length > 0 || tv.tab !== "all" || Object.values(facetValues).some((arr) => Array.isArray(arr) && arr.length > 0);

    const clearAllFilters = useCallback(() => {
        tv.resetFilters({ q: "", tab: "all" });
    }, [tv]);

    /** Keyboard navigation — j/k move the active row, Enter opens it. Skips when focus is in an input. */
    useEffect(() => {
        const rows = result?.data ?? [];
        if (rows.length === 0) return;
        let active = 0;
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
            if (event.key === "j") {
                active = Math.min(active + 1, rows.length - 1);
            } else if (event.key === "k") {
                active = Math.max(active - 1, 0);
            } else if (event.key === "Enter") {
                const row = rows[active];
                if (row) router.push(`/tickets/${row.id}` as never);
                return;
            } else {
                return;
            }
            event.preventDefault();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [result?.data, router]);

    const emptyToggleValues = useMemo<Record<string, boolean>>(() => ({}), []);

    return (
        <section className="flex flex-col gap-4">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />

            <TicketStatusTabs
                value={tv.tab}
                onChange={(next) => tv.setTab(next)}
                statusT={(key) => statusT(key as never)}
                allLabel={t("tabs.all")}
            />

            <DataTable<TicketConversation>
                data={result?.data ?? []}
                columns={columns}
                getRowId={(row) => String(row.id)}
                meta={meta}
                limitOptions={[10, 20, 50, 100]}
                onPageChange={(page) => tv.setPage(page)}
                onLimitChange={(limit) => tv.setLimit(limit)}
                sort={sort}
                onSortChange={setSort}
                selectedIds={selection.selectedIds}
                onSelectedIdsChange={selection.setSelected}
                columnVisibility={ui.columnVisibility}
                onColumnVisibilityChange={ui.setColumnVisibility}
                columnOrder={ui.columnOrder}
                onColumnOrderChange={ui.setColumnOrder}
                columnSizing={ui.columnSizing}
                onColumnSizingChange={ui.setColumnSizing}
                density={ui.density}
                isLoading={isPending}
                isError={isError}
                onRetry={() => refetch()}
                onClearFilters={clearAllFilters}
                hasActiveFilters={hasActiveFilters}
                onRowOpen={(row) => router.push(`/tickets/${row.id}` as never)}
                toolbar={
                    <div className="flex flex-col gap-2">
                        <DataTableToolbar
                            searchPlaceholder={t("search")}
                            q={tv.q}
                            onQChange={tv.setQ}
                            facets={facets}
                            facetValues={facetValues}
                            onFacetValuesChange={setFacetValues}
                            toggles={[]}
                            toggleValues={emptyToggleValues}
                            onToggleChange={() => {}}
                            locale={locale}
                            hasActiveFilters={hasActiveFilters}
                            onClearAll={clearAllFilters}
                            onRefresh={() => refetch()}
                            labels={{
                                clearAll: t("toolbar.clearAll"),
                                refresh: t("refresh"),
                                selectedCount: (n: number) => t("bulk.selectedCount", { count: n }),
                                clearFilter: t("toolbar.clearFilter"),
                            }}
                            rightSlot={
                                <DataTableViewOptions
                                    columns={columnVisibilityItems}
                                    visibility={ui.columnVisibility}
                                    onVisibilityChange={ui.setColumnVisibility}
                                    density={ui.density}
                                    onDensityChange={ui.setDensity}
                                    columnOrder={ui.columnOrder}
                                    onColumnOrderChange={ui.setColumnOrder}
                                    pinnedIds={["select", "actions"]}
                                    onReset={ui.reset}
                                    labels={{
                                        trigger: t("toolbar.viewOptions"),
                                        densityHeading: t("toolbar.density"),
                                        density: {
                                            comfortable: t("toolbar.densityComfortable"),
                                            cozy: t("toolbar.densityCozy"),
                                            compact: t("toolbar.densityCompact"),
                                        },
                                        columnsHeading: t("toolbar.columns"),
                                    }}
                                />
                            }
                        />
                        <ActiveFilterChips
                            chips={activeChips}
                            onRemove={(key, value) => {
                                const next = (facetValues[key] ?? []).filter((v) => v !== value);
                                setFacetValues(key, next);
                            }}
                        />
                    </div>
                }
                bulkActions={({ selectedIds, clearSelection }) => (
                    <TicketBulkActions
                        selectedIds={selectedIds}
                        onClear={clearSelection}
                        agents={agents ?? []}
                        t={(key, values) => t(key, values)}
                        statusT={(key) => statusT(key as never)}
                    />
                )}
                labels={{
                    empty: { title: t("empty") },
                    filtered: { title: t("emptyFiltered"), description: t("emptyFilteredHint") },
                    clearFiltersLabel: t("toolbar.clearAll"),
                    errorTitle: t("errorTitle"),
                    errorRetry: t("errorRetry"),
                    pagination: {
                        rowsPerPage: t("pagination.rowsPerPage"),
                        showing: (from, to, total) => t("pagination.showing", { from, to, total }),
                        selectedOf: (selected, total) => t("pagination.selectedOf", { selected, total }),
                        first: t("pagination.first"),
                        previous: t("pagination.previous"),
                        next: t("pagination.next"),
                        last: t("pagination.last"),
                        pageOf: (page, lastPage) => t("pagination.pageOf", { page, lastPage }),
                    },
                }}
                formatNumber={(value: number) => formatNumber(value, locale)}
            />
        </section>
    );
}
