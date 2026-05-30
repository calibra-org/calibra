import { setRequestLocale } from "next-intl/server";

import { CouponsView } from "#/views/analytics/coupons/coupons-view";

export default async function AnalyticsCouponsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CouponsView />;
}
