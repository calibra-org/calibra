import { setRequestLocale } from "next-intl/server";

import { PlansView } from "#/views/plans";

export default async function PlansPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <PlansView />;
}
