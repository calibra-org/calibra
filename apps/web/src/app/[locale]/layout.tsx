import { directionFor } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Footer } from "#/components/Footer";
import { Header } from "#/components/Header";
import { fontVariables } from "#/lib/fonts";
import { routing } from "#/lib/i18n/routing";
import { brandMonogram, paletteToCssVars } from "#/lib/tenant/branding";
import { currentTenant, requireTenant } from "#/lib/tenant/current-tenant";
import "#/styles/globals.css";

/**
 * Per-tenant metadata (RULE B). Title, description, favicon, and OpenGraph all come from the
 * resolved tenant's branding — never hardcoded. Reads the request-cached tenant, so no extra fetch.
 */
export async function generateMetadata(): Promise<Metadata> {
    const tenant = await currentTenant();
    if (!tenant) return { title: "Shop" };
    const { name, tagline, faviconUrl } = tenant.branding;
    return {
        title: { default: name, template: `%s · ${name}` },
        description: tagline || undefined,
        ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
        openGraph: { title: name, description: tagline || undefined, siteName: name },
    };
}

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    if (!hasLocale(routing.locales, locale)) notFound();
    setRequestLocale(locale);

    /**
     * The tenant is an invariant here — the middleware rewrites platform / unknown / suspended /
     * misrouted hosts to `/platform/*` before any shop route renders (RULE A / RULE C).
     */
    const tenant = await requireTenant();
    const { branding } = tenant;

    return (
        <html lang={locale} dir={directionFor(locale)} className={fontVariables} style={paletteToCssVars(branding.palette)}>
            <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
                <NextIntlClientProvider>
                    <Header brandName={branding.name} logoUrl={branding.logoUrl} monogram={brandMonogram(branding.name)} />
                    <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
                    <Footer brandName={branding.name} />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
