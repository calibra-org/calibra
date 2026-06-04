"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Sparkline } from "#/components/Sparkline";
import { StatusPill, tenantStatusTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { ChevronDown, ChevronsUpDown, ChevronUp, ExternalLink, Store, TriangleAlert, UserCheck } from "#/icons";
import { formatBytes, formatMoney, formatNumber } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { isEditableTarget } from "#/lib/keyboard";
import { openImpersonationTab, useImpersonate, usePlans, useTenants } from "#/lib/queries";
import type { TenantListItem } from "#/lib/types";
import { cn } from "#/lib/utils";

const SELECT_CLASS =
    "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

type Sort = { field: "name" | "status"; dir: "asc" | "desc" } | null;

/** Sortable column header — caret reflects the active direction; only `name` + `status` are server-orderable. */
function SortHeader({
    field,
    label,
    sort,
    onSort,
    className,
}: {
    field: "name" | "status";
    label: string;
    sort: Sort;
    onSort: (field: "name" | "status") => void;
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

export function TenantsListView() {
    const t = useTranslations("Tenants");
    const tc = useTranslations("Common");
    const locale = useLocale();
    const router = useRouter();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [planId, setPlanId] = useState("");
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState<Sort>(null);
    const [selected, setSelected] = useState(-1);
    const bodyRef = useRef<HTMLTableSectionElement>(null);

    const plans = usePlans();
    const tenants = useTenants({
        page,
        q: q || undefined,
        status: status || undefined,
        planId: planId ? Number(planId) : undefined,
        sort: sort ? `${sort.field}:${sort.dir}` : undefined,
    });
    const rows = tenants.data?.data ?? [];

    function onSort(field: "name" | "status") {
        setSort((current) =>
            current?.field === field ? { field, dir: current.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" },
        );
        setPage(1);
    }

    /** Reset the keyboard selection whenever the result set changes. */
    // biome-ignore lint/correctness/useExhaustiveDependencies: re-clamp selection only when the row set identity changes
    useEffect(() => {
        setSelected(-1);
    }, [tenants.data]);

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
                router.push(`/tenants/${rows[selected].id}`);
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
            <PageHeader
                title={t("title")}
                actions={
                    <Button onClick={() => router.push("/tenants/new")}>
                        <Store className="size-4" aria-hidden="true" />
                        {t("newShop")}
                    </Button>
                }
            />

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
                <select
                    aria-label={t("filterStatus")}
                    className={SELECT_CLASS}
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                >
                    <option value="">{t("filterStatus")}</option>
                    <option value="active">{t("statusActive")}</option>
                    <option value="suspended">{t("statusSuspended")}</option>
                    <option value="archived">{t("statusArchived")}</option>
                </select>
                <select
                    aria-label={t("filterPlan")}
                    className={SELECT_CLASS}
                    value={planId}
                    onChange={(event) => {
                        setPlanId(event.target.value);
                        setPage(1);
                    }}
                >
                    <option value="">{t("filterPlan")}</option>
                    {plans.data?.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                            {plan.name}
                        </option>
                    ))}
                </select>
            </div>

            {tenants.isError ? (
                <EmptyState
                    icon={TriangleAlert}
                    title={tc("errorTitle")}
                    description={t("errorBody")}
                    action={
                        <Button variant="outline" onClick={() => tenants.refetch()}>
                            {tc("retry")}
                        </Button>
                    }
                />
            ) : !tenants.isPending && rows.length === 0 ? (
                <EmptyState
                    icon={Store}
                    title={t("empty")}
                    action={<Button onClick={() => router.push("/tenants/new")}>{t("newShop")}</Button>}
                />
            ) : (
                <div className="mission-panel">
                    <Table>
                        <TableHeader>
                            <TableRow className="[&>th]:sticky [&>th]:top-14 [&>th]:z-10 [&>th]:bg-card">
                                <SortHeader field="name" label={t("colName")} sort={sort} onSort={onSort} />
                                <SortHeader field="status" label={t("colStatus")} sort={sort} onSort={onSort} />
                                <TableHead>{t("colPlan")}</TableHead>
                                <TableHead>{t("colDomain")}</TableHead>
                                <TableHead className="text-end">{t("colOrders")}</TableHead>
                                <TableHead className="text-end">{t("colRevenue")}</TableHead>
                                <TableHead className="text-end">{t("colStorage")}</TableHead>
                                <TableHead className="text-end">{t("colTrend")}</TableHead>
                                <TableHead className="sticky end-0 z-10 bg-card" />
                            </TableRow>
                        </TableHeader>
                        <TableBody ref={bodyRef}>
                            {tenants.isPending
                                ? ["r1", "r2", "r3", "r4", "r5", "r6"].map((k) => (
                                      <TableRow key={k}>
                                          <TableCell colSpan={9}>
                                              <Skeleton className="h-5 w-full" />
                                          </TableCell>
                                      </TableRow>
                                  ))
                                : rows.map((shop, index) => (
                                      <ShopRow
                                          key={shop.id}
                                          shop={shop}
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

            {tenants.data && tenants.data.meta.lastPage > 1 ? (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        ‹
                    </Button>
                    <span className="text-muted-foreground tabular-nums">
                        {formatNumber(page, locale)} / {formatNumber(tenants.data.meta.lastPage, locale)}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= tenants.data.meta.lastPage}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        ›
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function ShopRow({
    shop,
    index,
    selected,
    locale,
    t,
}: {
    shop: TenantListItem;
    index: number;
    selected: boolean;
    locale: string;
    t: ReturnType<typeof useTranslations<"Tenants">>;
}) {
    const impersonate = useImpersonate(shop.id);

    async function onImpersonate() {
        openImpersonationTab(await impersonate.mutateAsync());
    }

    const stickyBg = cn("sticky end-0 transition-colors", selected ? "bg-accent/60" : "bg-card group-hover:bg-accent/40");

    return (
        <TableRow
            data-row={index}
            className={cn(
                "group transition-colors hover:bg-accent/40",
                selected && "bg-accent/60 ring-1 ring-primary/30 ring-inset",
            )}
        >
            <TableCell>
                <Link href={`/tenants/${shop.id}`} className="font-medium hover:underline">
                    {shop.name}
                </Link>
                <div className="font-mono text-muted-foreground text-xs">{shop.slug}</div>
            </TableCell>
            <TableCell>
                <StatusPill tone={tenantStatusTone(shop.status)}>{t(`status${cap(shop.status)}` as "statusActive")}</StatusPill>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{shop.plan.name}</TableCell>
            <TableCell className="max-w-44 truncate font-mono text-muted-foreground text-xs" dir="ltr">
                {shop.primary_domain ?? "—"}
            </TableCell>
            <TableCell className="text-end tabular-nums">{formatNumber(shop.kpis.orders_30d, locale)}</TableCell>
            <TableCell className="text-end tabular-nums">
                {formatMoney(shop.kpis.revenue_30d, shop.currency_code, locale)}
            </TableCell>
            <TableCell className="text-end tabular-nums">{formatBytes(shop.kpis.storage_bytes, locale)}</TableCell>
            <TableCell>
                <div className="flex justify-end">
                    {shop.spark.some((v) => v > 0) ? (
                        <Sparkline data={shop.spark} width={72} height={22} strokeClass="stroke-accent-cyan" />
                    ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                    )}
                </div>
            </TableCell>
            <TableCell className={stickyBg}>
                <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="icon" aria-label={t("open")}>
                        <Link href={`/tenants/${shop.id}`}>
                            <ExternalLink className="size-4" aria-hidden="true" />
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("impersonate")}
                        disabled={impersonate.isPending}
                        onClick={onImpersonate}
                    >
                        <UserCheck className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
