import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { OrdersDetail } from "#/views/orders/detail/orders-detail";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders.detail" });
    return { title: t("metaTitle") };
}

export default async function OrderDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <OrdersDetail id={Number(id)} />;
}
