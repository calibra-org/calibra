import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TopSellersView } from "#/views/reports/top-sellers-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Reports.topSellers" });
    return { title: t("title") };
}

/**
 * Thin server shell: resolves the locale for next-intl's static optimization and renders the client
 * view. The top-sellers report is a static fixture today, so the view renders instantly without a
 * server fetch.
 */
export default async function TopSellersPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TopSellersView />;
}
