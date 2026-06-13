import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TicketDetailView } from "#/views/tickets/ticket-detail";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tickets" });
    return { title: t("title") };
}

export default async function TicketDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <TicketDetailView id={id} />;
}
