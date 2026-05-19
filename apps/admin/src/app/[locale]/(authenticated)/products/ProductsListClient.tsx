"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { DataTable } from "#/components/DataTable";
import { SearchInput } from "#/components/SearchInput";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Skeleton } from "#/components/ui/skeleton";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { useProductsList } from "#/lib/queries/products";
import type { AdminProduct, ProductStatus, StockStatus } from "#/lib/types";

const productStatusTone: Record<ProductStatus, StatusTone> = {
    publish: "success",
    draft: "neutral",
    pending: "warning",
    private: "info",
};

const stockTone: Record<StockStatus, StatusTone> = {
    instock: "success",
    outofstock: "danger",
    onbackorder: "warning",
};

export function ProductsListClient() {
    const locale = useLocale() as Locale;
    const t = useTranslations("Products");
    const statusT = useTranslations("ProductStatus");
    const stockT = useTranslations("StockStatus");
    const cols = t.raw("table") as Record<string, string>;
    const { data, isPending, isError } = useProductsList({ perPage: 100 });

    if (isPending) {
        return (
            <>
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-96 w-full" />
            </>
        );
    }
    if (isError || data === undefined) {
        return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
    }

    return (
        <>
            <SearchInput placeholder={t("search")} />

            <DataTable<AdminProduct>
                columns={[
                    {
                        id: "product",
                        header: cols.product ?? "",
                        cell: (row) => (
                            <Link href={`/products/${row.id}` as never} className="flex items-center gap-3 hover:underline">
                                {row.imageUrl !== null ? (
                                    // biome-ignore lint/performance/noImgElement: mock CDN avoids `next/image` remote-patterns config
                                    <img
                                        src={row.imageUrl}
                                        alt={row.name[locale]}
                                        className="size-9 rounded-md object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="size-9 rounded-md bg-muted" aria-hidden="true" />
                                )}
                                <div className="flex flex-col">
                                    <span className="font-medium">{row.name[locale]}</span>
                                    <span className="text-muted-foreground text-xs">{row.sku}</span>
                                </div>
                            </Link>
                        ),
                    },
                    {
                        id: "price",
                        header: cols.price ?? "",
                        cell: (row) => (
                            <div className="flex flex-col text-end">
                                <span className="font-medium">{formatMoney(row.salePrice ?? row.regularPrice, locale)}</span>
                                {row.salePrice !== null && (
                                    <span className="text-muted-foreground text-xs line-through">
                                        {formatMoney(row.regularPrice, locale)}
                                    </span>
                                )}
                            </div>
                        ),
                        className: "text-end",
                    },
                    {
                        id: "stock",
                        header: cols.stock ?? "",
                        cell: (row) =>
                            row.stockQuantity === null ? (
                                <span className="text-muted-foreground">—</span>
                            ) : (
                                <div className="flex items-center justify-end gap-2">
                                    <span className="font-mono text-sm">{formatNumber(row.stockQuantity, locale)}</span>
                                    <StatusBadge tone={stockTone[row.stockStatus]}>{stockT(row.stockStatus)}</StatusBadge>
                                </div>
                            ),
                        className: "text-end",
                    },
                    {
                        id: "status",
                        header: cols.status ?? "",
                        cell: (row) => <StatusBadge tone={productStatusTone[row.status]}>{statusT(row.status)}</StatusBadge>,
                    },
                    {
                        id: "updated",
                        header: cols.updated ?? "",
                        cell: (row) => <span className="text-muted-foreground text-xs">{formatDate(row.updatedAt, locale)}</span>,
                    },
                ]}
                rows={data.data}
                getRowKey={(row) => row.id}
                emptyState={t("empty")}
            />
        </>
    );
}
