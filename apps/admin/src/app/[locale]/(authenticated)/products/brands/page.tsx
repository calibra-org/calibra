import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BrandsView } from "#/views/products/brands";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Brands" });
    return { title: t("title") };
}

/**
 * Thin server shell: resolves the locale and renders the client workbench. The brand list and
 * its product counts (index `used_count`) are fetched in the browser through the admin proxy.
 */
export default async function BrandsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <BrandsView />;
}
