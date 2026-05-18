import { directionFor, type Locale, locales } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { routing } from "#/lib/i18n/routing";
import "#/styles/globals.css";

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
        <html lang={locale} dir={directionFor(locale)}>
            <body className="min-h-dvh bg-background text-foreground antialiased">
                <NextIntlClientProvider>{children}</NextIntlClientProvider>
            </body>
        </html>
    );
}
