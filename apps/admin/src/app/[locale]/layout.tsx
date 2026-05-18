import { directionFor, type Locale, locales } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

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
    title: { default: "Admin", template: "%s · Admin" },
    description: "Commerce admin panel.",
    robots: { index: false, follow: false },
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
                <NextIntlClientProvider>{children}</NextIntlClientProvider>
            </body>
        </html>
    );
}
