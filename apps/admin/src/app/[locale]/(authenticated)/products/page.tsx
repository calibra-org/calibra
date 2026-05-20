import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProductsList } from "#/views/products/list/products-list";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    return { title: t("title") };
}

/**
 * Products list page. The page itself is a server component (so next-intl's static optimization
 * still kicks in); the interactive list, including TanStack Query hooks and TanStack Table
 * state, lives inside {@link ProductsList} as a client component.
 */
export default async function ProductsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    return <ProductsList />;
}
