import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

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
    return <NewOrder />;
}
