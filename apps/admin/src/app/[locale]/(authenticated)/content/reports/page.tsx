import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentReportsPage } from "#/features/content/reports-page";
export const metadata: Metadata = { title: "تحلیل و گزارش‌ها" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentReportsPage />;
}
