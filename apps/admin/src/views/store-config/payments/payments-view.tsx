"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { ArrowUpRight, Info } from "#/icons";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { usePaymentGateways } from "#/lib/queries/payments";
import type { AdminPaymentGateway } from "#/lib/types";

/**
 * Payment-gateways table — the store-config screen listing every PSP the platform recognises for the
 * tenant. Subscribes to the shared `usePaymentGateways` hook (same-origin proxy) and renders a
 * skeleton while loading and a retry-able error state on failure. `"stub"` rows surface a warning
 * badge + tooltip; live rows show enabled/disabled.
 */
export function PaymentsView() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Payments");
    const commonT = useTranslations("Common");
    const { data, isLoading, isError, refetch } = usePaymentGateways();
    const cols = t.raw("table") as Record<string, string>;

    const stubBadge = t("stub.badge");
    const stubTooltip = t("stub.tooltip");

    if (isLoading) {
        return (
            <div className="flex flex-col gap-3">
                {["a", "b", "c", "d", "e", "f"].map((row) => (
                    <Skeleton key={row} className="h-12 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (isError || data === undefined) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
                <p className="text-muted-foreground text-sm">{commonT("errorLoading")}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    {commonT("retry")}
                </Button>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <DataTable<AdminPaymentGateway>
                columns={[
                    {
                        id: "title",
                        header: cols.title,
                        cell: (row) => (
                            <div className="flex flex-col">
                                <span className="font-medium">{row.title[locale]}</span>
                                <span className="text-muted-foreground text-xs">{row.description[locale]}</span>
                            </div>
                        ),
                    },
                    {
                        id: "code",
                        header: cols.code,
                        cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.code}</span>,
                    },
                    {
                        id: "status",
                        header: cols.status,
                        cell: (row) =>
                            row.implementationStatus === "stub" ? (
                                <Tooltip>
                                    <TooltipTrigger
                                        className="inline-flex cursor-help items-center gap-1"
                                        aria-label={stubTooltip}
                                    >
                                        <StatusBadge tone="warning">{stubBadge}</StatusBadge>
                                        <Info className="size-3 text-muted-foreground" aria-hidden="true" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">{stubTooltip}</TooltipContent>
                                </Tooltip>
                            ) : (
                                <StatusBadge tone={row.enabled ? "success" : "neutral"}>
                                    {row.enabled ? commonT("enabled") : commonT("disabled")}
                                </StatusBadge>
                            ),
                    },
                    {
                        id: "refunds",
                        header: cols.supportsRefunds,
                        cell: (row) => (row.supportsRefunds ? commonT("yes") : commonT("no")),
                    },
                    {
                        id: "ordering",
                        header: cols.ordering,
                        cell: (row) => formatNumber(row.ordering, locale),
                        className: "text-end",
                    },
                    {
                        id: "actions",
                        header: cols.actions,
                        cell: (row) => (
                            <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                                <Link href={`/payments/${row.code}` as never}>
                                    {commonT("view")}
                                    <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                                </Link>
                            </Button>
                        ),
                        className: "text-end",
                    },
                ]}
                rows={data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </TooltipProvider>
    );
}
