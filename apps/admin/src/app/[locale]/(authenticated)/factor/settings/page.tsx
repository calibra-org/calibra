import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { FactorSettingsPage } from "#/features/factor/settings-page";

export const metadata: Metadata = { title: "تنظیمات فاکتور" };

export default async function FactorSettingsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <FactorSettingsPage />;
}
