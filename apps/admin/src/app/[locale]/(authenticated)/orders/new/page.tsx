import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { listPaymentGateways } from "#/lib/server-repos";
import { NewOrder } from "#/views/orders/new/new-order";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders.new" });
    return { title: t("title") };
}

export default async function NewOrderPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const gateways = await listPaymentGateways();
    const paymentMethods = gateways.map((gateway) => ({
        id: gateway.id,
        code: gateway.code,
        title: gateway.title[locale === "fa" ? "fa" : "en"],
    }));
    return <NewOrder paymentMethods={paymentMethods} />;
}
