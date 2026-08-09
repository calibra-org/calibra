import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorRecordsPage } from "#/features/factor/records-page";

export const metadata: Metadata = { title: "مشتریان و کاتالوگ فاکتور" };

export default async function FactorRecordsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <FactorRecordsPage />;
}
