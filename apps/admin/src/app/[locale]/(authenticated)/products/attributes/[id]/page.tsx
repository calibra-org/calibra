import type { Locale } from "@calibra/shared/i18n";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DataTable } from "#/components/DataTable";
import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { getAttribute, listAttributeTerms } from "#/lib/mock/repos";
import type { AdminAttributeTerm } from "#/lib/mock/types";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const attribute = await getAttribute(Number(id));
    if (attribute === null) return { title: "—" };
    return { title: attribute.name[locale as Locale] };
}

export default async function AttributeTermsPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const attribute = await getAttribute(Number(id));
    if (attribute === null) notFound();
    const t = await getTranslations("Attributes");
    const cols = t.raw("termsTable") as Record<string, string>;
    const terms = await listAttributeTerms(attribute.id);

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={`${t("termsTitle")} — ${attribute.name[locale]}`}
                subtitle={t("termsSubtitle")}
                actions={
                    <Button>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("addAttribute")}
                    </Button>
                }
            />
            <DataTable<AdminAttributeTerm>
                columns={[
                    { id: "name", header: cols.name, cell: (row) => <span className="font-medium">{row.name[locale]}</span> },
                    { id: "slug", header: cols.slug, cell: (row) => <span className="font-mono text-muted-foreground text-xs">{row.slug}</span> },
                ]}
                rows={terms}
                getRowKey={(row) => row.id}
                emptyState="—"
            />
        </section>
    );
}
