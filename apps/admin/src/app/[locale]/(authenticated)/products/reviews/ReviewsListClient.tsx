"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { SearchInput } from "#/components/SearchInput";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useReviewsList } from "#/lib/queries/reviews";
import type { AdminReview, ReviewStatus } from "#/lib/types";

const tone: Record<ReviewStatus, StatusTone> = {
    pending: "warning",
    approved: "success",
    spam: "danger",
    trash: "neutral",
};

export function ReviewsListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Reviews");
    const statusT = useTranslations("ReviewStatus");
    const cols = t.raw("table") as Record<string, string>;
    const { data, isPending, isError } = useReviewsList({ perPage: 100 });

    if (isPending) {
        return (
            <>
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-96 w-full" />
            </>
        );
    }
    if (isError || data === undefined) return <p className="text-muted-foreground text-sm">—</p>;

    return (
        <>
            <SearchInput placeholder={t("search")} />

            <DataTable<AdminReview>
                columns={[
                    {
                        id: "reviewer",
                        header: cols.reviewer,
                        cell: (row) => (
                            <div className="flex flex-col">
                                <span className="font-medium">{row.reviewerName}</span>
                                <span className="text-muted-foreground text-xs">{row.reviewerEmail}</span>
                            </div>
                        ),
                    },
                    {
                        id: "product",
                        header: cols.product,
                        cell: (row) => (
                            <Link href={`/products/${row.productId}` as never} className="text-sm hover:underline">
                                {row.productName[locale]}
                            </Link>
                        ),
                    },
                    {
                        id: "rating",
                        header: cols.rating,
                        cell: (row) => (
                            <div className="flex items-center gap-0.5 text-amber-500">
                                {Array.from({ length: 5 }).map((_, index) => (
                                    <Star
                                        // biome-ignore lint/suspicious/noArrayIndexKey: rating stars rendered in fixed order
                                        key={index}
                                        className={
                                            index < row.rating ? "size-3.5 fill-current" : "size-3.5 stroke-current opacity-25"
                                        }
                                        aria-hidden="true"
                                    />
                                ))}
                            </div>
                        ),
                    },
                    {
                        id: "body",
                        header: cols.body,
                        cell: (row) => (
                            <span className="line-clamp-2 max-w-[28rem] text-muted-foreground text-sm">{row.body}</span>
                        ),
                    },
                    {
                        id: "status",
                        header: cols.status,
                        cell: (row) => <StatusBadge tone={tone[row.status]}>{statusT(row.status)}</StatusBadge>,
                    },
                    {
                        id: "createdAt",
                        header: cols.createdAt,
                        cell: (row) => <span className="text-muted-foreground text-xs">{formatDate(row.createdAt, locale)}</span>,
                    },
                ]}
                rows={data.data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </>
    );
}
