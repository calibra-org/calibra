import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorDocumentPrint } from "#/features/factor/document-print";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
    searchParams: Promise<{ print?: string }>;
}

export const metadata: Metadata = { title: "چاپ سند مالی" };

export default async function FactorDocumentPrintPage({ params, searchParams }: PageProps) {
    const { locale, id } = await params;
    const { print } = await searchParams;
    setRequestLocale(locale);
    return <FactorDocumentPrint documentId={Number(id)} autoPrint={print === "1"} />;
}
