import { setRequestLocale } from "next-intl/server";

import { TenantsListView } from "#/views/tenants-list";

export default async function TenantsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TenantsListView />;
}
