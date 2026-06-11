import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { InvoiceView } from "#/views/orders/print/invoice-view";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
    searchParams: Promise<{ print?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Orders.print" });
    return { title: t("invoice") };
}

export default async function InvoicePage({ params, searchParams }: PageProps) {
    const { locale, id } = await params;
    const { print } = await searchParams;
    setRequestLocale(locale);
    return <InvoiceView orderId={Number(id)} autoPrint={print === "1"} />;
}
