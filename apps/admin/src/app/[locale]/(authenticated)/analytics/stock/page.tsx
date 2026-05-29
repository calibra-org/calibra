import { setRequestLocale } from "next-intl/server";

import { StockView } from "#/views/analytics/stock/stock-view";

export default async function AnalyticsStockPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <StockView />;
}
