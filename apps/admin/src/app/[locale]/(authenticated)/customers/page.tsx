import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CustomersListClient } from "#/views/customers/list/customers-list";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Customers" });
    return { title: t("title") };
}

export default async function CustomersPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CustomersListClient />;
}
