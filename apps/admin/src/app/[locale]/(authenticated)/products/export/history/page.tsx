import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExportHistory } from "#/views/products/export/export-history";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "ProductsExport.history" });
    return { title: t("title") };
}

export default async function ExportHistoryPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ExportHistory />;
}
