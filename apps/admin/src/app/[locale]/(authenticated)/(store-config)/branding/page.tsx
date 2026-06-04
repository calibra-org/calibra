import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { getBranding } from "#/lib/server-repos";
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
 * shop's staff self-serve. Sits in the store-config group beside payments/shipping/tax/settings. The
 * server-repo paints the initial data so the form renders without a skeleton; the client view's
 * React Query then owns saves + revalidation.
 */
export default async function BrandingPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Branding");
    const initialData = await getBranding();

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <BrandingSettings initialData={initialData ?? undefined} />
        </div>
    );
}
