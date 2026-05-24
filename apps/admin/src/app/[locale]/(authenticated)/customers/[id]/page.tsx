import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getCustomer } from "#/lib/server-repos";
import { CustomersDetailClient } from "#/views/customers/detail/customers-detail";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id, locale } = await params;
    const customer = await getCustomer(Number(id));
    if (customer === null) {
        const t = await getTranslations({ locale, namespace: "Customers" });
        return { title: t("title") };
    }
    return { title: `${customer.firstName} ${customer.lastName}` };
}

export default async function CustomerDetailPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);
    const customer = await getCustomer(Number(id));
    if (customer === null) notFound();
    return <CustomersDetailClient initialCustomerId={customer.id} locale={rawLocale as Locale} />;
}
