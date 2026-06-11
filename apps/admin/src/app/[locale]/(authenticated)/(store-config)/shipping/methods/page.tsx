import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { ShippingMethodsView } from "#/views/store-config/shipping/shipping-methods-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Shipping.methods" });
    return { title: t("title") };
}

/** Shipping-methods screen — thin server shell rendering the static-fixture {@link ShippingMethodsView}. */
export default async function ShippingMethodsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Shipping");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <ShippingMethodsView />
        </section>
    );
}
