import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

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
 * Thin server shell for the `/media/{id}` deep-link — the same workbench with the details modal
 * pre-opened over the requested row. Only the numeric route param is forwarded; the client view
 * resolves the row via `useMedia(openId)` so it stays shareable even when the row isn't on the
 * first list page. An unparseable id 404s here rather than rendering an empty modal.
 */
export default async function MediaDeepLinkPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) notFound();

    return <MediaView openId={numericId} />;
}
