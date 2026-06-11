import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AttributeTermsView } from "#/views/products/attributes/terms";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "AttributeTerms" });
    return { title: t("title") };
}

/**
 * Thin server shell for `/products/attributes/{id}`. Forwards only the numeric route param; the
 * client view resolves the attribute and its terms through the admin proxy, rendering a 404 state
 * itself when the attribute does not exist.
 */
export default async function AttributeTermsPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <AttributeTermsView attributeId={Number(id)} />;
}
