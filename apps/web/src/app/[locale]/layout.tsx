import { directionFor, type Locale, locales } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Footer } from "#/components/Footer";
import { Header } from "#/components/Header";
import { routing } from "#/lib/i18n/routing";
import "#/styles/globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const vazirmatn = Vazirmatn({
    subsets: ["arabic", "latin"],
    variable: "--font-vazirmatn",
    display: "swap",
});

export const metadata: Metadata = {
    title: { default: "Shop", template: "%s · Shop" },
    description: "Online store.",
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
        <html
            lang={locale}
            dir={directionFor(locale)}
            className={`${inter.variable} ${vazirmatn.variable}`}
        >
            <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
                <NextIntlClientProvider>
                    <Header />
                    <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
                    <Footer />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
