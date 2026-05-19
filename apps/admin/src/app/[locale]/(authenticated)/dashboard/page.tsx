import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardClient } from "./DashboardClient";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Dashboard" });
    return { title: t("title") };
}

/**
 * Thin server shell: resolves the locale for next-intl's static optimization and forwards into the
 * client component that owns every widget's React Query subscription. No data is fetched here — by
 * design — so the page header / KPI outlines / chart cards render on first paint regardless of how
 * slow the admin API is.
 */
export default async function DashboardPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <DashboardClient />;
}
