import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listCategories } from "#/lib/server-repos";
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
 * Server entry point. Fetches the flat category list (with product-count fan-out) and hands it
 * to the client view as the SSR seed — every interaction afterwards stays on the client until
 * the user reloads.
 */
export default async function CategoriesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const { data } = await listCategories({ perPage: 200 });

    return <CategoriesView initialRows={data} />;
}
