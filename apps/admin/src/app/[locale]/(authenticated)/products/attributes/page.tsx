import type { Locale } from "@calibra/shared/i18n";
import { ArrowUpRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import { listAttributes } from "#/lib/server-repos";
import type { AdminAttribute } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Attributes" });
    return { title: t("title") };
}

export default async function AttributesPage({ params }: PageProps) {
    const { locale: rawLocale } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const t = await getTranslations("Attributes");
    const cols = t.raw("table") as Record<string, string>;
    const orderByT = t.raw("orderBy") as Record<string, string>;
    const commonT = await getTranslations("Common");
    const rows = await listAttributes();

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("title")}
                subtitle={t("subtitle")}
                actions={
                    <Button>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addAttribute")}
                    </Button>
                }
            />
            <DataTable<AdminAttribute>
                columns={[
                    { id: "name", header: cols.name, cell: (row) => <span className="font-medium">{row.name[locale]}</span> },
                    {
                        id: "code",
                        header: cols.code,
                        cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.code}</span>,
                    },
                    {
                        id: "terms",
                        header: cols.termCount,
                        cell: (row) => formatNumber(row.termCount, locale),
                        className: "text-end",
                    },
                    { id: "orderBy", header: cols.orderBy, cell: (row) => orderByT[row.orderBy] },
                    {
                        id: "archives",
                        header: cols.hasArchives,
                        cell: (row) => (row.hasArchives ? commonT("yes") : commonT("no")),
                    },
                    {
                        id: "actions",
                        header: cols.actions,
                        cell: (row) => (
                            <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                                <Link href={`/products/attributes/${row.id}` as never}>
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
        </section>
    );
}
