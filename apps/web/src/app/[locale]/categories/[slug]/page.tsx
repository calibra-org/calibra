import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { generateTaxonomyMetadata, TaxonomyPage } from "#/components/catalog/taxonomy-page";

interface PageProps {
    params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, slug } = await params;
    return generateTaxonomyMetadata("category", locale, slug);
}

export default async function CategoryPage({ params }: PageProps) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    return <TaxonomyPage kind="category" locale={locale} slug={slug} />;
}
