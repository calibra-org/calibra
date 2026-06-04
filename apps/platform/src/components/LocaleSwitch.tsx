"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { getPathname, usePathname } from "#/lib/i18n/navigation";

/**
 * Two-locale toggle (fa ↔ en). Renders as a plain anchor so the browser does a full navigation —
 * cheaper than a client-side router push and guarantees the `<html lang>` / `dir` attributes flip.
 */
export function LocaleSwitch() {
    const locale = useLocale() as Locale;
    const label = useTranslations("Common")("switchLocale");
    const pathname = usePathname();
    const nextLocale: Locale = locale === "fa" ? "en" : "fa";

    return (
        <Button asChild variant="outline" size="sm">
            <a href={getPathname({ href: pathname, locale: nextLocale })}>
                <Languages className="size-3.5" aria-hidden="true" />
                <span>{label}</span>
            </a>
        </Button>
    );
}
