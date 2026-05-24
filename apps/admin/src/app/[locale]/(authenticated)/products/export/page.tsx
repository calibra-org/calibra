import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExportWizard } from "#/views/products/export/export-wizard";

interface PageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ scope?: string; ids?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "ProductsExport" });
    return { title: t("title") };
}

/**
 * Export wizard entry. Pre-hydrates `scope=selected` + the supplied id list when the operator
 * arrives via the bulk-action bar on the products page; otherwise defaults to the filter scope.
 */
export default async function ExportPage({ params, searchParams }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const sp = await searchParams;
    const scope = sp.scope === "selected" || sp.scope === "all" ? sp.scope : "filter";
    const ids =
        sp.ids !== undefined
            ? sp.ids
                  .split(",")
                  .map((v) => Number(v))
                  .filter((n) => Number.isFinite(n))
            : [];
    return <ExportWizard initialScope={scope} initialSelectedIds={ids} />;
}
