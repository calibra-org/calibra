import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentTaxonomyPage } from "#/features/content/taxonomy-page";
export const metadata: Metadata = { title: "دسته‌ها و برچسب‌ها" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentTaxonomyPage />;
}
