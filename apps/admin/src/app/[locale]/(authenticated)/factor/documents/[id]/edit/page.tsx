import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorDocumentEditor } from "#/features/factor/document-editor";

export const metadata: Metadata = { title: "ویرایش سند فروش" };

export default async function EditFactorDocumentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <FactorDocumentEditor documentId={Number(id)} />;
}
