import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listAttributesWithTerms } from "#/lib/server-repos";
import { AttributesView } from "#/views/products/attributes";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Attributes" });
    return { title: t("title") };
}

/**
 * Server entry point. Fetches the flat attribute list along with each row's term count + a
 * short preview of term names (SSR fan-out). The view plants the rows into the React Query
 * cache on first mount so the list never flashes empty; the term-preview chips are decorative
 * and stay client-stable across mutations.
 */
export default async function AttributesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const { attributes, termPreviews, termCounts } = await listAttributesWithTerms();

    return <AttributesView initialRows={attributes} termPreviews={termPreviews} termCounts={termCounts} />;
}
