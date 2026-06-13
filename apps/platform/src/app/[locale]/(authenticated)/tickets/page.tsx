import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TicketsListView } from "#/views/tickets/tickets-list";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tickets" });
    return { title: t("title") };
}

export default async function TicketsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketsListView />;
}
