import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getOrder } from "#/lib/server-repos";
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
    const order = await getOrder(Number(id));
    if (order === null) notFound();
    return <PackingSlipView order={order} locale={locale as Locale} autoPrint={print === "1"} />;
}
