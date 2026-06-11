import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { BrandingSettings } from "#/views/settings/branding/branding-settings";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale: locale as Locale, namespace: "Branding" });
    return { title: t("title") };
}

/**
 * Branding screen — the storefront-facing config (name/tagline/font/logo/favicon/OKLCH palette) the
 * shop's staff self-serve. Sits in the store-config group beside payments/shipping/tax/settings. Thin
 * server shell: the {@link BrandingSettings} client view owns the React Query fetch + skeleton + save.
 */
export default async function BrandingPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Branding");

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <BrandingSettings />
        </div>
    );
}
