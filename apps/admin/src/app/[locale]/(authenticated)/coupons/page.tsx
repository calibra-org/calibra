import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CouponsListClient } from "#/views/coupons/list/coupons-list";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Coupons" });
    return { title: t("title") };
}

/**
 * Server shell — sets the static locale for next-intl and forwards into the client list view.
 * The page header lives inside the client so the action button can navigate via
 * `#/lib/i18n/navigation`'s locale-aware `Link`.
 */
export default async function CouponsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CouponsListClient />;
}
