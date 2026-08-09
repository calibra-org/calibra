import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorDocumentEditor } from "#/features/factor/document-editor";

export const metadata: Metadata = { title: "ساخت سند فروش" };

export default async function NewFactorDocumentPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <FactorDocumentEditor />;
}
