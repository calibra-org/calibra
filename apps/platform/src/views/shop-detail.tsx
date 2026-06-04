"use client";

import { ArrowLeft, LogIn, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { GrafanaEmbed } from "#/components/GrafanaEmbed";
import { MetricsChart } from "#/components/MetricsChart";
import { PageHeader } from "#/components/PageHeader";
import { StatCard } from "#/components/StatCard";
import { StatusPill, tenantStatusTone, tlsStatusTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatBytes, formatMoney, formatNumber } from "#/lib/format";
import { useRouter } from "#/lib/i18n/navigation";
import {
    useAttachDomain,
    useDetachDomain,
    useImpersonate,
    useRecheckDomain,
    useTenant,
    useTenantMetrics,
    useUpdateTenant,
} from "#/lib/queries";
import type { MetricsRange, TenantDetail } from "#/lib/types";
import { cn } from "#/lib/utils";

type Tab = "metrics" | "domains" | "plan";

export function ShopDetailView({ id }: { id: string }) {
    const t = useTranslations("ShopDetail");
    const tenant = useTenant(id);
    const router = useRouter();
    const [tab, setTab] = useState<Tab>("metrics");

    if (tenant.isPending) return <Skeleton className="h-72 w-full rounded-lg" />;
    if (!tenant.data) return <p className="text-muted-foreground text-sm">404</p>;
    const shop = tenant.data;

    return (
        <div>
            <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push("/tenants")}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("back")}
            </Button>

            <Header shop={shop} id={id} />

            <div className="mt-6 flex gap-1 border-border border-b">
                {(["metrics", "domains", "plan"] as const).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={cn(
                            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                            tab === key
                                ? "border-primary font-medium text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t(key === "metrics" ? "tabMetrics" : key === "domains" ? "tabDomains" : "tabPlan")}
                    </button>
                ))}
            </div>

            <div className="mt-5">
                {tab === "metrics" ? <MetricsTab id={id} currencyCode={shop.currency_code} /> : null}
                {tab === "domains" ? <DomainsTab id={id} shop={shop} /> : null}
                {tab === "plan" ? <PlanTab shop={shop} /> : null}
            </div>
        </div>
    );
}

function Header({ shop, id }: { shop: TenantDetail; id: string }) {
    const t = useTranslations("ShopDetail");
    const tt = useTranslations("Tenants");
    const update = useUpdateTenant(id);
    const impersonate = useImpersonate(id);

    async function onImpersonate() {
        const grant = await impersonate.mutateAsync();
        const url = new URL(grant.admin_url);
        url.searchParams.set("__imp", grant.token.value);
        window.open(url.toString(), "_blank", "noopener");
    }

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
                <span dir="ltr" className="text-muted-foreground">
                    {(shop.domains.find((d) => d.is_primary) ?? shop.domains[0])?.domain ?? shop.slug} · {shop.plan.name}
                </span>
            }
            actions={
                <>
                    <Button variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: nextStatus })}>
                        {shop.status === "active" ? t("suspend") : t("activate")}
                    </Button>
                    <Button disabled={impersonate.isPending} onClick={onImpersonate}>
                        <LogIn className="size-4" aria-hidden="true" />
                        {t("impersonate")}
                    </Button>
                </>
            }
        />
    );
}

function MetricsTab({ id, currencyCode }: { id: string; currencyCode: string }) {
    const t = useTranslations("Metrics");
    const locale = useLocale();
    const [range, setRange] = useState<MetricsRange>("30d");
    const metrics = useTenantMetrics(id, range);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex gap-1">
                {(["7d", "30d", "90d", "12m"] as const).map((r) => (
                    <Button key={r} variant={range === r ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
                        {t(`range${r === "12m" ? "12m" : r}` as "range30d")}
                    </Button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {metrics.isPending || !metrics.data ? (
                    ["s1", "s2", "s3", "s4"].map((k) => <Skeleton key={k} className="h-24 rounded-lg" />)
                ) : (
                    <>
                        <StatCard label={t("revenue")} value={formatMoney(metrics.data.kpis.revenue, currencyCode, locale)} />
                        <StatCard label={t("orders")} value={formatNumber(metrics.data.kpis.orders, locale)} />
                        <StatCard label={t("customersNew")} value={formatNumber(metrics.data.kpis.customers_new, locale)} />
                        <StatCard label={t("storage")} value={formatBytes(metrics.data.kpis.storage_bytes, locale)} />
                    </>
                )}
            </div>

            <Card>
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
    const [cname, setCname] = useState<string | null>(null);

    async function onAttach(e: FormEvent) {
        e.preventDefault();
        const res = (await attach.mutateAsync(domain)) as { data: { cname_target?: string } };
        setCname(res.data.cname_target ?? null);
        setDomain("");
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

            {cname ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <p className="text-muted-foreground text-xs">{t("cnameHint")}</p>
                    <code className="mt-1 block text-xs" dir="ltr">
                        CNAME → {cname}
                    </code>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("domain")}</TableHead>
                            <TableHead>{t("kind")}</TableHead>
                            <TableHead>{t("tls")}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {shop.domains.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
                                    {t("empty")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            shop.domains.map((d) => (
                                <TableRow key={d.id}>
                                    <TableCell dir="ltr" className="font-medium">
                                        {d.domain}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">{d.kind}</TableCell>
                                    <TableCell>
                                        <StatusPill tone={tlsStatusTone(d.tls_status)}>
                                            {t(`tls${cap(d.tls_status)}` as "tlsPending")}
                                        </StatusPill>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={t("recheck")}
                                                onClick={() => recheck.mutate(d.id)}
                                            >
                                                <RefreshCw className="size-4" aria-hidden="true" />
                                            </Button>
                                            {!d.is_primary ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("detach")}
                                                    onClick={() => detach.mutate(d.id)}
                                                >
                                                    <Trash2 className="size-4 text-danger" aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function PlanTab({ shop }: { shop: TenantDetail }) {
    const t = useTranslations("PlanLimits");
    const locale = useLocale();
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
                    return (
                        <div key={row.label} className="rounded-lg border border-border p-3">
                            <div className="flex items-center justify-between text-sm">
                                <span>{row.label}</span>
                                <span className="text-muted-foreground tabular-nums">
                                    {row.fmt(row.used)} / {typeof limit === "number" ? row.fmt(limit) : t("unlimited")}
                                </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn("h-full rounded-full", pct !== null && pct >= 90 ? "bg-danger" : "bg-primary")}
                                    style={{ width: `${pct ?? 2}%` }}
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
