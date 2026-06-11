import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CategoriesView } from "#/views/products/categories";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Categories" });
    return { title: t("title") };
}

/**
 * Thin server shell: resolves the locale for next-intl's static optimization and renders the
 * client workbench. The category list — including product counts via the index `used_count` —
 * is fetched in the browser through the admin proxy, so the page never blocks on the API.
 */
export default async function CategoriesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CategoriesView />;
}
