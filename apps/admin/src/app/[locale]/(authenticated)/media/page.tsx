import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listMedia, listMediaMonths } from "#/lib/server-repos";
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
 * Media library SSR entry. Seeds the workbench with the first page of rows + the list of months
 * that drive the date dropdown, so the operator sees real content on first paint instead of a
 * skeleton-then-flash. The client view plants the seed into the React Query cache.
 */
export default async function MediaPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const [initial, months] = await Promise.all([listMedia({ limit: 60 }), listMediaMonths()]);
    return <MediaView initialPage={initial} initialMonths={months} />;
}
