import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getAttribute, listAttributeTerms } from "#/lib/server-repos";
import { AttributeTermsView } from "#/views/products/attributes/terms";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const t = await getTranslations({ locale, namespace: "AttributeTerms" });
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return { title: t("title") };
    const attribute = await getAttribute(numericId);
    if (attribute === null) return { title: t("title") };
    return { title: t("titleFor", { name: attribute.name[locale as Locale] }) };
}

/**
 * Server entry point for `/products/attributes/{id}`. Resolves the attribute (404s if it
 * doesn't exist), seeds the terms list from the live API, and hands both to the client
 * workbench. The view then drives every interaction through React Query against the
 * `/admin/attributes/{attribute_id}/terms[/:id]` endpoints.
 */
export default async function AttributeTermsPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) notFound();
    const attribute = await getAttribute(numericId);
    if (attribute === null) notFound();
    const terms = await listAttributeTerms(numericId);

    return <AttributeTermsView attribute={attribute} initialRows={terms} />;
}
