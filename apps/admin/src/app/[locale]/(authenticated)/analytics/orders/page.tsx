import { setRequestLocale } from "next-intl/server";

import { OrdersView } from "#/views/analytics/orders/orders-view";

export default async function AnalyticsOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <OrdersView />;
}
