import { setRequestLocale } from "next-intl/server";

import { OverviewView } from "#/views/analytics/overview/overview-view";

export default async function AnalyticsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <OverviewView />;
}
