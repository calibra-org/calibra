import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorDocumentDetail } from "#/features/factor/document-detail";

export const metadata: Metadata = { title: "جزئیات سند فروش" };

export default async function FactorDocumentDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <FactorDocumentDetail id={Number(id)} />;
}
