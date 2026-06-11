import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { ShippingZonesView } from "#/views/store-config/shipping/shipping-zones-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Shipping.zones" });
    return { title: t("title") };
}

/** Shipping-zones screen — thin server shell rendering the static-fixture {@link ShippingZonesView}. */
export default async function ShippingZonesPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Shipping");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <ShippingZonesView />
        </section>
    );
}
