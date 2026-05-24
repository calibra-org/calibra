import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrdersList } from "#/views/orders/list/orders-list";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders" });
    return { title: t("title") };
}

export default async function OrdersPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <OrdersList />;
}
