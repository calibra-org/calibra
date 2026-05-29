import { setRequestLocale } from "next-intl/server";

import { TaxesView } from "#/views/analytics/taxes/taxes-view";

export default async function AnalyticsTaxesPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TaxesView />;
}
