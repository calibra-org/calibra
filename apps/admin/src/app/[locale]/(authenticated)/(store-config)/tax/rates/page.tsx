import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { TaxRatesView } from "#/views/store-config/tax/tax-rates-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tax.rates" });
    return { title: t("title") };
}

/** Tax-rates screen — thin server shell rendering the static-fixture {@link TaxRatesView}. */
export default async function TaxRatesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Tax");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <TaxRatesView />
        </section>
    );
}
