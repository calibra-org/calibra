import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentCalendarPage } from "#/features/content/calendar-page";
export const metadata: Metadata = { title: "تقویم و انتشار" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentCalendarPage />;
}
