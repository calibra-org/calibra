import { setRequestLocale } from "next-intl/server";

import { ProductsView } from "#/views/analytics/products/products-view";

export default async function AnalyticsProductsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ProductsView />;
}
