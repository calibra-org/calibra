import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { generateTaxonomyMetadata, TaxonomyPage } from "#/components/catalog/taxonomy-page";

interface PageProps {
    params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, slug } = await params;
    return generateTaxonomyMetadata("brand", locale, slug);
}

export default async function BrandPage({ params }: PageProps) {
    const { locale, slug } = await params;
    setRequestLocale(locale);
    return <TaxonomyPage kind="brand" locale={locale} slug={slug} />;
}
