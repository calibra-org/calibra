import type { Locale } from "@calibra/shared/i18n";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import { listTags } from "#/lib/mock/repos";
import type { AdminTag } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tags" });
    return { title: t("title") };
}

export default async function TagsPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Tags");
    const cols = t.raw("table") as Record<string, string>;
    const { data } = await listTags({ perPage: 100 });

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addTag")}
                    </Button>
                }
            />
            <DataTable<AdminTag>
                columns={[
                    { id: "name", header: cols.name, cell: (row) => <span className="font-medium">{row.name[locale]}</span> },
                    { id: "slug", header: cols.slug, cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.slug[locale]}</span> },
                    { id: "products", header: cols.productCount, cell: (row) => formatNumber(row.productCount, locale), className: "text-end" },
                ]}
                rows={data}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
