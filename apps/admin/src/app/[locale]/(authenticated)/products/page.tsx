import type { Locale } from "@calibra/shared/i18n";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { SearchInput } from "#/components/SearchInput";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { formatDate, formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listProducts } from "#/lib/mock/repos";
import type { AdminProduct, ProductStatus, StockStatus } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    return { title: t("title") };
}

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

export default async function ProductsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Products");
    const statusT = await getTranslations("ProductStatus");
    const stockT = await getTranslations("StockStatus");
    const cols = t.raw("table") as Record<string, string>;
    const { data } = await listProducts({ perPage: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button asChild>
                        <Link href="/products/new">
                            <Plus className="size-4" aria-hidden="true" />
                            {t("addProduct")}
                        </Link>
                    </Button>
                }
            />

            <SearchInput placeholder={t("search")} />

            <DataTable<AdminProduct>
                columns={[
                    {
                        id: "product",
                        header: cols.product ?? "",
                        cell: (row) => (
                            <Link href={`/products/${row.id}` as never} className="flex items-center gap-3 hover:underline">
                                {row.imageUrl !== null ? (
                                    /** biome-ignore lint/performance/noImgElement: mock CDN avoids `next/image` remote-patterns config */
                                    // biome-ignore lint/a11y/useAltText: alt is the product name, set on the wrapping link
                                    <img
                                        src={row.imageUrl}
                                        alt=""
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
                rows={data}
                getRowKey={(row) => row.id}
                emptyState={t("empty")}
            />
        </section>
    );
}
