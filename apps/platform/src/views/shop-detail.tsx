"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { GrafanaEmbed } from "#/components/GrafanaEmbed";
import { MetricsChart } from "#/components/MetricsChart";
import { PageHeader } from "#/components/PageHeader";
import { Reveal } from "#/components/Reveal";
import { StatCard } from "#/components/StatCard";
import { StatusPill, tenantStatusTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { ArrowStart, Plus, TriangleAlert, UserCheck } from "#/icons";
import { formatBytes, formatMoney, formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import { useAttachDomain, useDetachDomain, useRecheckDomain, useTenant, useTenantMetrics, useUpdateTenant } from "#/lib/queries";
import type { MetricsRange, TenantDetail } from "#/lib/types";
import { cn } from "#/lib/utils";
import { AuditView } from "#/views/audit/audit-view";
import { DomainRow } from "#/views/domains/domain-row";
import { OperatorsTab } from "#/views/operators/operators-tab";

type Tab = "metrics" | "domains" | "operators" | "audit" | "plan";

const TABS: Tab[] = ["metrics", "domains", "operators", "audit", "plan"];

const TAB_LABELS: Record<Tab, string> = {
    metrics: "tabMetrics",
    domains: "tabDomains",
    operators: "tabOperators",
    audit: "tabAudit",
    plan: "tabPlan",
};

/** Percent change between the first and last point of a series, rounded. Null when undefined. */
function trendPct(series: number[]): number | null {
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    if (first === 0) return last === 0 ? 0 : null;
    return Math.round(((last - first) / first) * 100);
}

export function ShopDetailView({ id }: { id: string }) {
    const t = useTranslations("ShopDetail");
    const tc = useTranslations("Common");
    const tenant = useTenant(id);
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialTab = TABS.includes(searchParams.get("tab") as Tab) ? (searchParams.get("tab") as Tab) : "metrics";
    const [tab, setTab] = useState<Tab>(initialTab);

    if (tenant.isPending) return <Skeleton className="h-72 w-full rounded-lg" />;
    if (tenant.isError || !tenant.data) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title={tc("errorTitle")}
                description={tc("error")}
                action={
                    <Button variant="outline" onClick={() => tenant.refetch()}>
                        {tc("retry")}
                    </Button>
                }
            />
        );
    }
    const shop = tenant.data;

    return (
        <Reveal>
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push("/tenants")}>
                <ArrowStart className="size-4" aria-hidden="true" />
                {t("back")}
            </Button>

            <Header shop={shop} id={id} onImpersonate={() => setTab("operators")} />

            <div className="mt-6 flex gap-1 border-border border-b">
                {TABS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={cn(
                            "relative px-3 py-2 text-sm transition-colors",
                            tab === key ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t(TAB_LABELS[key] as "tabMetrics")}
                        {tab === key ? (
                            <motion.span
                                layoutId="tab-underline"
                                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                                aria-hidden="true"
                            />
                        ) : null}
                    </button>
                ))}
            </div>

            <div className="mt-5">
                {tab === "metrics" ? <MetricsTab id={id} currencyCode={shop.currency_code} /> : null}
                {tab === "domains" ? <DomainsTab id={id} shop={shop} /> : null}
                {tab === "operators" ? <OperatorsTab id={id} /> : null}
                {tab === "audit" ? <AuditView tenantId={id} /> : null}
                {tab === "plan" ? <PlanTab shop={shop} /> : null}
            </div>
        </Reveal>
    );
}

function Header({ shop, id, onImpersonate }: { shop: TenantDetail; id: string; onImpersonate: () => void }) {
    const t = useTranslations("ShopDetail");
    const tt = useTranslations("Tenants");
    const update = useUpdateTenant(id);

    const nextStatus = shop.status === "active" ? "suspended" : "active";

    return (
        <PageHeader
            title={
                <span className="flex items-center gap-3">
                    {shop.name}
                    <StatusPill tone={tenantStatusTone(shop.status)}>
                        {tt(`status${cap(shop.status)}` as "statusActive")}
                    </StatusPill>
                </span>
            }
            description={
                <span dir="ltr" className="font-mono text-muted-foreground">
                    {(shop.domains.find((d) => d.is_primary) ?? shop.domains[0])?.domain ?? shop.slug} · {shop.plan.name}
                </span>
            }
            actions={
                <>
                    <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: nextStatus })}>
                        {shop.status === "active" ? t("suspend") : t("activate")}
                    </Button>
                    <Button onClick={onImpersonate}>
                        <UserCheck className="size-4" aria-hidden="true" />
                        {t("impersonate")}
                    </Button>
                </>
            }
        />
    );
}

function MetricsTab({ id, currencyCode }: { id: string; currencyCode: string }) {
    const t = useTranslations("Metrics");
    const tc = useTranslations("Common");
    const locale = useLocale();
    const [range, setRange] = useState<MetricsRange>("30d");
    const metrics = useTenantMetrics(id, range);

    const revenueSeries = metrics.data?.series.map((point) => point.revenue) ?? [];
    const ordersSeries = metrics.data?.series.map((point) => point.orders) ?? [];

    return (
        <div className="flex flex-col gap-5">
            <div className="flex gap-1">
                {(["7d", "30d", "90d", "12m"] as const).map((r) => (
                    <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
                        {t(`range${r === "12m" ? "12m" : r}` as "range30d")}
                    </Button>
                ))}
            </div>

            {metrics.isError ? (
                <EmptyState
                    icon={TriangleAlert}
                    title={tc("errorTitle")}
                    description={tc("error")}
                    action={
                        <Button variant="outline" onClick={() => metrics.refetch()}>
                            {tc("retry")}
                        </Button>
                    }
                />
            ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {metrics.isPending || !metrics.data ? (
                        ["s1", "s2", "s3", "s4"].map((k) => <Skeleton key={k} className="h-28 rounded-lg" />)
                    ) : (
                        <>
                            <StatCard
                                label={t("revenue")}
                                countUp={{ to: metrics.data.kpis.revenue, format: (n) => formatMoney(n, currencyCode, locale) }}
                                spark={revenueSeries}
                                trend={
                                    trendPct(revenueSeries) !== null ? { value: trendPct(revenueSeries) as number } : undefined
                                }
                                tone="accent"
                            />
                            <StatCard
                                label={t("orders")}
                                countUp={{ to: metrics.data.kpis.orders, format: (n) => formatNumber(n, locale) }}
                                spark={ordersSeries}
                                trend={trendPct(ordersSeries) !== null ? { value: trendPct(ordersSeries) as number } : undefined}
                            />
                            <StatCard
                                label={t("customersNew")}
                                countUp={{ to: metrics.data.kpis.customers_new, format: (n) => formatNumber(n, locale) }}
                            />
                            <StatCard
                                label={t("storage")}
                                countUp={{ to: metrics.data.kpis.storage_bytes, format: (n) => formatBytes(n, locale) }}
                            />
                        </>
                    )}
                </div>
            )}

            <Card className="mission-panel">
                <CardContent className="pt-6">
                    {metrics.data ? <MetricsChart series={metrics.data.series} /> : <Skeleton className="h-64 w-full" />}
                </CardContent>
            </Card>

            <section>
                <div className="mb-2">
                    <h3 className="font-medium text-sm">{t("opsPanel")}</h3>
                    <p className="text-muted-foreground text-xs">{t("opsPanelHint")}</p>
                </div>
                <GrafanaEmbed tenantId={Number(id)} />
            </section>
        </div>
    );
}

function DomainsTab({ id, shop }: { id: string; shop: TenantDetail }) {
    const t = useTranslations("Domains");
    const attach = useAttachDomain(id);
    const detach = useDetachDomain(id);
    const recheck = useRecheckDomain(id);
    const [domain, setDomain] = useState("");
    const [pendingId, setPendingId] = useState<number | null>(null);

    async function onAttach(e: FormEvent) {
        e.preventDefault();
        await attach.mutateAsync(domain);
        setDomain("");
    }

    async function onRecheck(domainId: number) {
        setPendingId(domainId);
        try {
            await recheck.mutateAsync(domainId);
        } finally {
            setPendingId(null);
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <form onSubmit={onAttach} className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1.5">
                    <Input dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={t("placeholder")} />
                </div>
                <Button type="submit" disabled={attach.isPending || domain.length === 0}>
                    <Plus className="size-4" aria-hidden="true" />
                    {t("attach")}
                </Button>
            </form>

            {shop.domains.length === 0 ? (
                <EmptyState icon={TriangleAlert} title={t("empty")} />
            ) : (
                <div className="flex flex-col gap-3">
                    {shop.domains.map((d) => (
                        <DomainRow
                            key={d.id}
                            domain={d}
                            busy={pendingId === d.id}
                            onRecheck={() => onRecheck(d.id)}
                            onDetach={() => detach.mutate(d.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function PlanTab({ shop }: { shop: TenantDetail }) {
    const t = useTranslations("PlanLimits");
    const locale = useLocale();
    const reduce = useReducedMotion();
    const limits = shop.plan.limits as Record<string, number>;
    const rows: { label: string; used: number; limitKey: string; fmt: (n: number) => string }[] = [
        { label: t("products"), used: shop.usage.products, limitKey: "max_products", fmt: (n) => formatNumber(n, locale) },
        {
            label: t("orders"),
            used: shop.usage.orders_total,
            limitKey: "max_orders_per_month",
            fmt: (n) => formatNumber(n, locale),
        },
        {
            label: t("customers"),
            used: shop.usage.customers_total,
            limitKey: "max_customers",
            fmt: (n) => formatNumber(n, locale),
        },
        {
            label: t("storage"),
            used: shop.usage.storage_bytes,
            limitKey: "max_storage_bytes",
            fmt: (n) => formatBytes(n, locale),
        },
    ];

    return (
        <div className="flex max-w-2xl flex-col gap-4">
            <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{t("tier")}</span>
                <span className="font-medium">{shop.plan.name}</span>
                <StatusPill tone="info">{shop.plan.db_tier}</StatusPill>
            </div>
            <div className="flex flex-col gap-3">
                {rows.map((row) => {
                    const limit = limits?.[row.limitKey];
                    const pct =
                        typeof limit === "number" && limit > 0 ? Math.min(100, Math.round((row.used / limit) * 100)) : null;
                    const danger = pct !== null && pct >= 90;
                    return (
                        <div key={row.label} className="mission-panel p-3">
                            <div className="flex items-center justify-between text-sm">
                                <span>{row.label}</span>
                                <span className="text-muted-foreground tabular-nums">
                                    {row.fmt(row.used)} / {typeof limit === "number" ? row.fmt(limit) : t("unlimited")}
                                </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                <motion.div
                                    className={cn(
                                        "h-full rounded-full bg-gradient-to-r",
                                        danger ? "from-danger to-danger/70" : "from-primary to-primary/60",
                                    )}
                                    initial={reduce ? false : { width: 0 }}
                                    animate={{ width: `${pct ?? 2}%` }}
                                    transition={reduce ? { duration: 0 } : { duration: 0.5, ease: "easeOut" }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
