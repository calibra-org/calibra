import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { SupportSettings } from "#/views/settings/support/support-settings";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale: locale as Locale, namespace: "Settings.support" });
    return { title: t("title") };
}

/**
 * Support-configuration settings — thin server shell. Resolves the locale for next-intl's static
 * optimization, then hands off to the client {@link SupportSettings} tabbed view (agents / tags /
 * canned responses). Rendered inside the shared `SettingsNav` rail via the store-config layout.
 */
export default async function SupportSettingsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations({ locale: locale as Locale, namespace: "Settings.support" });

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <SupportSettings />
        </div>
    );
}
