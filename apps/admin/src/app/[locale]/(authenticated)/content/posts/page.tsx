import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentPostsPage } from "#/features/content/posts-page";
export const metadata: Metadata = { title: "مدیریت نوشته‌ها" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentPostsPage />;
}
