import { setRequestLocale } from "next-intl/server";

import { CategoriesView } from "#/views/analytics/categories/categories-view";

export default async function AnalyticsCategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CategoriesView />;
}
