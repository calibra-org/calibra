import { setRequestLocale } from "next-intl/server";

import { OverviewView } from "#/views/overview";

export default async function OverviewPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <OverviewView />;
}
