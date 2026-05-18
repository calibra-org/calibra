"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

export interface SubTab {
    href: string;
    labelKey: string;
}

interface SubTabsProps {
    namespace: string;
    tabs: SubTab[];
}

/**
 * Link-based tab strip for sub-routes (settings, tax, shipping). Each tab is a real route, so
 * deep-links work and SSR is preserved. Active state is derived from `usePathname()` with a
 * prefix match.
 */
export function SubTabs({ namespace, tabs }: SubTabsProps) {
    const t = useTranslations(namespace);
    const pathname = usePathname();
    return (
        <div className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground text-sm">
            {tabs.map((tab) => {
                const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
                return (
                    <Link
                        key={tab.href}
                        href={tab.href as never}
                        className={cn(
                            "inline-flex h-7 items-center justify-center rounded-md px-3 font-medium transition-colors",
                            active ? "bg-background text-foreground shadow-sm" : "hover:bg-background/60",
                        )}
                    >
                        {t(tab.labelKey as Parameters<typeof t>[0])}
                    </Link>
                );
            })}
        </div>
    );
}
