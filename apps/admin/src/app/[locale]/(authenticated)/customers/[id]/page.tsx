import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CustomersDetailClient } from "#/views/customers/detail/customers-detail";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Customers" });
    return { title: t("title") };
}

/**
 * Thin server shell: resolves the locale for next-intl's static optimization and forwards only the
 * route's customer id into the client view, which owns the `useCustomer` React Query subscription
 * and its own skeleton / error states. No data is fetched here — by design — so the detail chrome
 * paints on first render regardless of how slow the admin API is.
 */
export default async function CustomerDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <CustomersDetailClient initialCustomerId={Number(id)} locale={locale as Locale} />;
}
