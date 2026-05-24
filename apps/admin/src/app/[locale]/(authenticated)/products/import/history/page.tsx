import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ImportHistory } from "#/views/products/import/import-history";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "ProductsImport.history" });
    return { title: t("title") };
}

export default async function ImportHistoryPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ImportHistory />;
}
