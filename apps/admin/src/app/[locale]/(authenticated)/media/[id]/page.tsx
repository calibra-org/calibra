import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getMedia, listMedia, listMediaMonths } from "#/lib/server-repos";
import { MediaView } from "#/views/media";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Media" });
    return { title: `${t("modal.title")} — ${t("title")}` };
}

/**
 * Deep-link entry — `/media/{id}` renders the same workbench with the details modal pre-open
 * for the requested row. The view receives the same SSR seed as the bare `/media` page; it
 * recognises `initialOpenId` and mounts the modal on first paint so the URL is shareable.
 *
 * If the id doesn't parse or the row is missing, fall back to a 404 — the operator gets a
 * cleaner error than an empty modal.
 */
export default async function MediaDeepLinkPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) notFound();

    const [row, initial, months] = await Promise.all([getMedia(numericId), listMedia({ limit: 60 }), listMediaMonths()]);
    if (row === null) notFound();

    return <MediaView initialPage={initial} initialMonths={months} initialOpenId={numericId} initialOpenRow={row} />;
}
