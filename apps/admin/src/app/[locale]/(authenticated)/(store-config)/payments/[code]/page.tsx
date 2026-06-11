import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PaymentGatewayDetailView } from "#/views/store-config/payments/payment-gateway-detail-view";

interface PageProps {
    params: Promise<{ locale: string; code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Payments" });
    return { title: t("title") };
}

/**
 * Payment-gateway detail screen — thin server shell. Forwards only the route `code`; the
 * {@link PaymentGatewayDetailView} client view resolves the gateway via `usePaymentGateway` and owns
 * the skeleton + not-found state.
 */
export default async function PaymentGatewayDetailPage({ params }: PageProps) {
    const { locale, code } = await params;
    setRequestLocale(locale);
    return <PaymentGatewayDetailView code={code} />;
}
