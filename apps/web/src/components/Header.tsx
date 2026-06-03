"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale, useTranslations } from "next-intl";

import { getPathname, Link, usePathname } from "#/lib/i18n/navigation";

interface HeaderProps {
    /** Brand display name from the tenant's branding. */
    brandName: string;
    /** Absolute logo URL, or null to render the monogram fallback. */
    logoUrl: string | null;
    /** Single-letter monogram shown when the tenant has no logo image. */
    monogram: string;
}

export function Header({ brandName, logoUrl, monogram }: HeaderProps) {
    const t = useTranslations("Nav");
    const switchLabel = useTranslations("Common")("switchLocale");
    const locale = useLocale() as Locale;
    const pathname = usePathname();
    const nextLocale: Locale = locale === "fa" ? "en" : "fa";

    return (
        <header className="border-border border-b">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-4">
                <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
                    {logoUrl ? (
                        // biome-ignore lint/performance/noImgElement: per-tenant CDN logo; next/image remote-patterns + sizing are overkill for a small header mark
                        <img src={logoUrl} alt={brandName} className="h-7 w-auto" />
                    ) : (
                        <span
                            aria-hidden
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent font-bold text-accent-foreground text-sm"
                        >
                            {monogram}
                        </span>
                    )}
                    <span>{brandName}</span>
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
