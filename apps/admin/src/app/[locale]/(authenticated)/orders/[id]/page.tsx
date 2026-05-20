import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getOrder } from "#/lib/server-repos";

import { OrderDetailClient } from "./OrderDetailClient";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const order = await getOrder(Number(id));
    if (order === null) return { title: "—" };
    const t = await getTranslations({ locale, namespace: "Orders.detail" });
    return { title: t("title", { number: order.orderNumber }) };
}

export default async function OrderDetailPage({ params }: PageProps) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    return <OrderDetailClient id={Number(id)} />;
}
