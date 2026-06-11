import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { TaxClassesView } from "#/views/store-config/tax/tax-classes-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Tax.classes" });
    return { title: t("title") };
}

/** Tax-classes screen — thin server shell rendering the static-fixture {@link TaxClassesView}. */
export default async function TaxClassesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Tax");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <TaxClassesView />
        </section>
    );
}
