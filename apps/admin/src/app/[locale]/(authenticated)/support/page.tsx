import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CalibraSupport } from "#/views/support/calibra-support";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale: locale as Locale, namespace: "Support" });
    return { title: t("title") };
}

/**
 * Shop-admin → Calibra support page — thin server shell. Resolves the locale for next-intl's
 * static optimization, then hands off to the client {@link CalibraSupport} view which owns the
 * ticket-list / thread query subscriptions.
 */
export default async function SupportPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CalibraSupport />;
}
