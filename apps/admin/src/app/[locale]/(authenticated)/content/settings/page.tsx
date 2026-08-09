import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentSettingsPage } from "#/features/content/settings-page";
export const metadata: Metadata = { title: "تنظیمات نوشته‌ها" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentSettingsPage />;
}
