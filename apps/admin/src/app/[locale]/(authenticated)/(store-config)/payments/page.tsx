import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { PaymentsView } from "#/views/store-config/payments/payments-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Payments" });
    return { title: t("title") };
}

/**
 * Payments screen — thin server shell. The {@link PaymentsView} client view owns the gateways table's
 * React Query subscription, skeleton, and error state.
 */
export default async function PaymentsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Payments");

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <PaymentsView />
        </section>
    );
}
