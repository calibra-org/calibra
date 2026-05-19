"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { StatusBadge } from "#/components/StatusBadge";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatMoney, formatNumber, formatPercent } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useCouponsList } from "#/lib/queries/coupons";
import type { AdminCoupon } from "#/lib/types";

function valueLabel(coupon: AdminCoupon, locale: Locale): string {
    if (coupon.discountType === "free_shipping") return "—";
    if (coupon.discountType === "percent") return formatPercent(coupon.amountPercent ?? 0, locale);
    return formatMoney(coupon.amountMinor ?? 0, locale);
}

export function CouponsListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Coupons");
    const cols = t.raw("table") as Record<string, string>;
    const typeT = t.raw("discountType") as Record<string, string>;
    const statusT = t.raw("status") as Record<string, string>;
    const { data, isPending, isError } = useCouponsList({ perPage: 100 });

    if (isPending) return <Skeleton className="h-96 w-full" />;
    if (isError || data === undefined) return <p className="text-muted-foreground text-sm">—</p>;

    return (
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
                        <StatusBadge tone={row.status === "active" ? "success" : "neutral"}>{statusT[row.status]}</StatusBadge>
                    ),
                },
            ]}
            rows={data.data}
            getRowKey={(row) => row.id}
            emptyState="—"
        />
    );
}
