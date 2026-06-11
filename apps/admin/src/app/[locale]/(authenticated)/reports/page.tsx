import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SalesReportView } from "#/views/reports/sales-report-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Reports.sales" });
    return { title: t("title") };
}

/**
 * Thin server shell: resolves the locale for next-intl's static optimization and renders the client
 * view that owns the sales-report React Query subscription. No data is fetched here — the KPI tiles
 * and chart stream into per-widget skeletons in the browser.
 */
export default async function ReportsSalesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <SalesReportView />;
}
