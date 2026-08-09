import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorDocumentsList } from "#/features/factor/documents-list";

export const metadata: Metadata = { title: "فاکتورها و پیش‌فاکتورها" };

export default async function FactorDocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <FactorDocumentsList />;
}
