import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorReportsPage } from "#/features/factor/reports-page";

export const metadata: Metadata = { title: "گزارش‌های فاکتور" };

export default async function FactorReportsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <FactorReportsPage />;
}
