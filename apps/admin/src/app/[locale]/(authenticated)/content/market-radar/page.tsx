import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { ContentMarketPage } from "#/features/content/market-page";
export const metadata: Metadata = { title: "اخبار و رصد بازار" };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ContentMarketPage />;
}
