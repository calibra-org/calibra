import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { Toaster } from "#/components/ui/toast";
import { PublicFactorCheckout } from "#/features/factor/public-checkout";

export const metadata: Metadata = {
    title: "پرداخت سند فروش",
    referrer: "no-referrer",
    robots: "noindex, nofollow, noarchive",
};

export default async function FactorPayPage({ params }: { params: Promise<{ locale: string; code: string }> }) {
    const { locale, code } = await params;
    setRequestLocale(locale);
    return (
        <>
            <PublicFactorCheckout code={code} />
            <Toaster />
        </>
    );
}
