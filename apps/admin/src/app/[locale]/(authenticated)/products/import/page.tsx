import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ImportWizard } from "#/views/products/import/import-wizard";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "ProductsImport" });
    return { title: t("title") };
}

/**
 * Entry route for the 4-step CSV product importer wizard. The page is a server component (so the
 * route is statically prerendered and the locale flows through next-intl's static optimization);
 * all wizard state lives inside the client component.
 */
export default async function ImportPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ImportWizard />;
}
