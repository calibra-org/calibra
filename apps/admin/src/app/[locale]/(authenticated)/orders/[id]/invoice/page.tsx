import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getOrder } from "#/lib/server-repos";
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
    const order = await getOrder(Number(id));
    if (order === null) notFound();
    return <InvoiceView order={order} locale={locale as Locale} autoPrint={print === "1"} />;
}
