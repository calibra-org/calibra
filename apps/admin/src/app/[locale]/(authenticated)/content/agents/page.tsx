import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentAgentsPage } from "#/features/content/agents-page";
export const metadata: Metadata = { title: "مرکز فرمان Agent" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentAgentsPage />;
}
