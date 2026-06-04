"use client";

import { ExternalLink, LogIn, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { StatusPill, tenantStatusTone } from "#/components/StatusPill";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatBytes, formatMoney, formatNumber } from "#/lib/format";
import { Link, useRouter } from "#/lib/i18n/navigation";
import { useImpersonate, usePlans, useTenants } from "#/lib/queries";

const SELECT_CLASS =
    "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function TenantsListView() {
    const t = useTranslations("Tenants");
    const locale = useLocale();
    const router = useRouter();
    const [q, setQ] = useState("");
    const [status, setStatus] = useState("");
    const [planId, setPlanId] = useState("");
    const [page, setPage] = useState(1);

    const plans = usePlans();
    const tenants = useTenants({
        page,
        q: q || undefined,
        status: status || undefined,
        planId: planId ? Number(planId) : undefined,
    });

    return (
        <div>
            <PageHeader
                title={t("title")}
                actions={
                    <Button onClick={() => router.push("/tenants/new")}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("newShop")}
                    </Button>
                }
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <Input
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                    }}
                    placeholder={t("searchPlaceholder")}
                    className="max-w-xs"
                />
                <select
                    aria-label={t("filterStatus")}
                    className={SELECT_CLASS}
                    value={status}
                    onChange={(e) => {
                        setStatus(e.target.value);
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
                    onChange={(e) => {
                        setPlanId(e.target.value);
                        setPage(1);
                    }}
                >
                    <option value="">{t("filterPlan")}</option>
                    {plans.data?.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("colName")}</TableHead>
                            <TableHead>{t("colStatus")}</TableHead>
                            <TableHead>{t("colPlan")}</TableHead>
                            <TableHead>{t("colDomain")}</TableHead>
                            <TableHead className="text-end">{t("colOrders")}</TableHead>
                            <TableHead className="text-end">{t("colRevenue")}</TableHead>
                            <TableHead className="text-end">{t("colStorage")}</TableHead>
                            <TableHead />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.isPending ? (
                            ["r1", "r2", "r3", "r4", "r5", "r6"].map((k) => (
                                <TableRow key={k}>
                                    <TableCell colSpan={8}>
                                        <Skeleton className="h-5 w-full" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : tenants.data && tenants.data.data.length > 0 ? (
                            tenants.data.data.map((shop) => <ShopRow key={shop.id} shop={shop} locale={locale} t={t} />)
                        ) : (
                            <TableRow>
                                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                                    {t("empty")}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {tenants.data && tenants.data.meta.lastPage > 1 ? (
                <div className="mt-4 flex items-center justify-end gap-2 text-sm">
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
    locale,
    t,
}: {
    shop: import("#/lib/types").TenantListItem;
    locale: string;
    t: ReturnType<typeof useTranslations<"Tenants">>;
}) {
    const impersonate = useImpersonate(shop.id);

    async function onImpersonate() {
        const grant = await impersonate.mutateAsync();
        const url = new URL(grant.admin_url);
        url.searchParams.set("__imp", grant.token.value);
        window.open(url.toString(), "_blank", "noopener");
    }

    return (
        <TableRow>
            <TableCell>
                <Link href={`/tenants/${shop.id}`} className="font-medium hover:underline">
                    {shop.name}
                </Link>
                <div className="text-muted-foreground text-xs">{shop.slug}</div>
            </TableCell>
            <TableCell>
                <StatusPill tone={tenantStatusTone(shop.status)}>{t(`status${cap(shop.status)}` as "statusActive")}</StatusPill>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">{shop.plan.name}</TableCell>
            <TableCell className="max-w-44 truncate text-muted-foreground text-xs">{shop.primary_domain ?? "—"}</TableCell>
            <TableCell className="text-end tabular-nums">{formatNumber(shop.kpis.orders_30d, locale)}</TableCell>
            <TableCell className="text-end tabular-nums">
                {formatMoney(shop.kpis.revenue_30d, shop.currency_code, locale)}
            </TableCell>
            <TableCell className="text-end tabular-nums">{formatBytes(shop.kpis.storage_bytes, locale)}</TableCell>
            <TableCell>
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
                        <LogIn className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
