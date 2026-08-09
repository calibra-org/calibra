import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentStudioPage } from "#/features/content/studio-page";
export const metadata: Metadata = { title: "استودیو محتوا و AI" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentStudioPage />;
}
