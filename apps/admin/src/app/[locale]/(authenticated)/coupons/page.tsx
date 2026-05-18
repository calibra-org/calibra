import type { Locale } from "@calibra/shared/i18n";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { formatDate, formatMoney, formatNumber, formatPercent } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listCoupons } from "#/lib/mock/repos";
import type { AdminCoupon } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Coupons" });
    return { title: t("title") };
}

function valueLabel(coupon: AdminCoupon, locale: Locale): string {
    if (coupon.discountType === "free_shipping") return "—";
    if (coupon.discountType === "percent") return formatPercent(coupon.amountPercent ?? 0, locale);
    return formatMoney(coupon.amountMinor ?? 0, locale);
}

export default async function CouponsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Coupons");
    const cols = t.raw("table") as Record<string, string>;
    const typeT = t.raw("discountType") as Record<string, string>;
    const statusT = t.raw("status") as Record<string, string>;
    const { data } = await listCoupons({ perPage: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addCoupon")}
                    </Button>
                }
            />
            <DataTable<AdminCoupon>
                columns={[
                    {
                        id: "code",
                        header: cols.code,
                        cell: (row) => (
                            <Link href={`/coupons/${row.id}` as never} className="flex flex-col hover:underline">
                                <span className="font-medium font-mono">{row.code}</span>
                                <span className="text-muted-foreground text-xs">{row.description[locale]}</span>
                            </Link>
                        ),
                    },
                    { id: "type", header: cols.type, cell: (row) => typeT[row.discountType] },
                    {
                        id: "value",
                        header: cols.value,
                        cell: (row) => <span className="font-medium">{valueLabel(row, locale)}</span>,
                        className: "text-end",
                    },
                    {
                        id: "usage",
                        header: cols.usage,
                        cell: (row) => (
                            <span className="text-muted-foreground text-sm">
                                {formatNumber(row.usageCount, locale)}
                                {row.usageLimitGlobal !== null ? ` / ${formatNumber(row.usageLimitGlobal, locale)}` : ""}
                            </span>
                        ),
                        className: "text-end",
                    },
                    {
                        id: "expiresAt",
                        header: cols.expiresAt,
                        cell: (row) => (
                            <span className="text-muted-foreground text-sm">
                                {row.expiresAt === null ? t("neverExpires") : formatDate(row.expiresAt, locale)}
                            </span>
                        ),
                    },
                    {
                        id: "status",
                        header: cols.status,
                        cell: (row) => (
                            <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>
                                {statusT[row.status]}
                            </StatusBadge>
                        ),
                    },
                ]}
                rows={data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
