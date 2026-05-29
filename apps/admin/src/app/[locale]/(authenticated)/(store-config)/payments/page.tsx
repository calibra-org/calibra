import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#/components/ui/tooltip";
import { ArrowUpRight, Info } from "#/icons";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listPaymentGateways } from "#/lib/server-repos";
import type { AdminPaymentGateway } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Payments" });
    return { title: t("title") };
}

export default async function PaymentsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Payments");
    const commonT = await getTranslations("Common");
    const cols = t.raw("table") as Record<string, string>;
    const rows = await listPaymentGateways();

    const stubBadge = t("stub.badge");
    const stubTooltip = t("stub.tooltip");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
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
                    rows={rows}
                    getRowKey={(row) => row.id}
                    emptyState="—"
                />
            </TooltipProvider>
        </section>
    );
}
