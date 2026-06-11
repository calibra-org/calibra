import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MediaView } from "#/views/media";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Media" });
    return { title: t("title") };
}

/**
 * Thin server shell for the media workbench. Resolves the locale for next-intl's static
 * optimization and renders the client view — every row, month bucket, and the details modal are
 * fetched in the browser through the same-origin admin proxy, so the chrome paints on first render
 * regardless of how slow the admin API is.
 */
export default async function MediaPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <MediaView />;
}
