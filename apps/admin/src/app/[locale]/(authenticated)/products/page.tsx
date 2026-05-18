import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    return { title: t("title") };
}

interface ProductRow {
    id: number;
    name: string;
    sku: string;
    price: string;
    stock: number | null;
    status: { tone: StatusTone; labelKey: "active" | "draft" | "outOfStock" };
}

const sampleRows: ProductRow[] = [
    { id: 1, name: "Sample Tee", sku: "TEE-001", price: "$25.00", stock: 100, status: { tone: "success", labelKey: "active" } },
    { id: 2, name: "Sample Mug", sku: "MUG-001", price: "$15.00", stock: 50, status: { tone: "success", labelKey: "active" } },
    {
        id: 3,
        name: "Sample Notebook",
        sku: "NB-001",
        price: "$18.00",
        stock: 0,
        status: { tone: "danger", labelKey: "outOfStock" },
    },
    {
        id: 4,
        name: "Limited Edition Hoodie",
        sku: "HOOD-001",
        price: "$65.00",
        stock: null,
        status: { tone: "neutral", labelKey: "draft" },
    },
];

export default async function ProductsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Products");
    const status = await getTranslations("Status");
    const cols = t.raw("table") as {
        product: string;
        sku: string;
        price: string;
        stock: string;
        status: string;
        actions: string;
    };

    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <Button>
                    <Plus className="size-4" aria-hidden="true" />
                    {t("addProduct")}
                </Button>
            </header>

            <div className="relative max-w-sm">
                <Search
                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input type="search" placeholder={t("search")} className="ps-9" />
            </div>

            <DataTable
                columns={[
                    {
                        id: "product",
                        header: cols.product,
                        cell: (row: ProductRow) => <span className="font-medium">{row.name}</span>,
                    },
                    {
                        id: "sku",
                        header: cols.sku,
                        cell: (row: ProductRow) => <span className="text-muted-foreground">{row.sku}</span>,
                    },
                    { id: "price", header: cols.price, cell: (row: ProductRow) => row.price, className: "text-end" },
                    {
                        id: "stock",
                        header: cols.stock,
                        cell: (row: ProductRow) =>
                            row.stock === null ? (
                                <span className="text-muted-foreground">—</span>
                            ) : (
                                row.stock.toLocaleString(locale)
                            ),
                        className: "text-end",
                    },
                    {
                        id: "status",
                        header: cols.status,
                        cell: (row: ProductRow) => (
                            <StatusBadge tone={row.status.tone}>{status(row.status.labelKey)}</StatusBadge>
                        ),
                    },
                ]}
                rows={sampleRows}
                getRowKey={(row: ProductRow) => row.id}
                emptyState={t("empty")}
            />
        </section>
    );
}
