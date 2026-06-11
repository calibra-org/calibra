import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PackingSlipView } from "#/views/orders/print/packing-slip-view";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
    searchParams: Promise<{ print?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders.print" });
    return { title: t("packingSlip") };
}

export default async function PackingSlipPage({ params, searchParams }: PageProps) {
    const { locale, id } = await params;
    const { print } = await searchParams;
    setRequestLocale(locale);
    return <PackingSlipView orderId={Number(id)} autoPrint={print === "1"} />;
}
