import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorPaymentsPage } from "#/features/factor/payments-page";

export const metadata: Metadata = { title: "پرداخت‌ها و درگاه‌ها" };

export default async function FactorPaymentsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <FactorPaymentsPage />;
}
