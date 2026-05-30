import { setRequestLocale } from "next-intl/server";

import { RevenueView } from "#/views/analytics/revenue/revenue-view";

export default async function AnalyticsRevenuePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <RevenueView />;
}
