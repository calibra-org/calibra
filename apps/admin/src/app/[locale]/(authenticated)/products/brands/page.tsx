import type { Locale } from "@calibra/shared/i18n";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import { listBrands } from "#/lib/server-repos";
import type { AdminBrand } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Brands" });
    return { title: t("title") };
}

export default async function BrandsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Brands");
    const cols = t.raw("table") as Record<string, string>;
    const { data } = await listBrands({ perPage: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addBrand")}
                    </Button>
                }
            />
            <DataTable<AdminBrand>
                columns={[
                    {
                        id: "name",
                        header: cols.name,
                        cell: (row) => (
                            <div className="flex items-center gap-2">
                                <div className="grid size-8 place-items-center rounded-md bg-accent font-semibold text-accent-foreground text-xs">
                                    {row.name.en.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium">{row.name[locale]}</span>
                            </div>
                        ),
                    },
                    {
                        id: "slug",
                        header: cols.slug,
                        cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.slug[locale]}</span>,
                    },
                    {
                        id: "products",
                        header: cols.productCount,
                        cell: (row) => formatNumber(row.productCount, locale),
                        className: "text-end",
                    },
                ]}
                rows={data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
