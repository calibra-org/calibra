import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

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
 * Thin server shell: resolves the locale and renders the client workbench. The attribute list is
 * fetched in the browser through the admin proxy; each row's terms are lazy-loaded on expand, so
 * the page never fans out a per-attribute terms request the way the old SSR repo did.
 */
export default async function AttributesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <AttributesView />;
}
