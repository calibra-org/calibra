"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, getPathname, usePathname } from "#/lib/i18n/navigation";
import type { Locale } from "#/lib/i18n/config";

export function Header() {
    const t = useTranslations("Nav");
    const siteName = useTranslations("Site")("name");
    const switchLabel = useTranslations("Common")("switchLocale");
    const locale = useLocale() as Locale;
    const pathname = usePathname();
    const nextLocale: Locale = locale === "en" ? "fa" : "en";

    return (
        <header className="border-b border-border">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4">
                <Link href="/" className="text-lg font-bold tracking-tight">
                    {siteName}
                </Link>
                <nav className="flex items-center gap-6 text-sm">
                    <Link href="/" className="transition hover:text-accent">
                        {t("home")}
                    </Link>
                    <Link href="/products" className="transition hover:text-accent">
                        {t("products")}
                    </Link>
                    <Link href="/cart" className="transition hover:text-accent">
                        {t("cart")}
                    </Link>
                    <a
                        href={getPathname({ href: pathname, locale: nextLocale })}
                        className="rounded-md border border-border px-3 py-1.5 text-xs transition hover:bg-muted"
                    >
                        {switchLabel}
                    </a>
                </nav>
            </div>
        </header>
    );
}
