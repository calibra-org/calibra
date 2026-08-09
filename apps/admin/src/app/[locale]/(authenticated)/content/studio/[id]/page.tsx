import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentStudioPage } from "#/features/content/studio-page";
export const metadata: Metadata = { title: "ویرایش نوشته" };
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <ContentStudioPage postId={Number(id)} />;
}
