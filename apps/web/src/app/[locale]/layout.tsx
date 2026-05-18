import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Footer } from "#/components/Footer";
import { Header } from "#/components/Header";
import { directionFor, locales, type Locale } from "#/lib/i18n/config";
import { routing } from "#/lib/i18n/routing";
import "#/styles/globals.css";

export const metadata: Metadata = {
    title: { default: "calibra", template: "%s · calibra" },
    description: "calibra online store",
};

export function generateStaticParams(): { locale: Locale }[] {
    return locales.map((locale) => ({ locale }));
}

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    return (
        <html lang={locale} dir={directionFor(locale)}>
            <body className="min-h-dvh bg-background text-foreground">
                <NextIntlClientProvider>
                    <Header />
                    <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
                    <Footer />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
