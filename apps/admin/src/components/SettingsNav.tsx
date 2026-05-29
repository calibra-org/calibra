"use client";

import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";

import { Banknote, Settings2, Truck, Wallet } from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface SettingsTab {
    href: string;
    labelKey: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Store-configuration tabs. Tax / shipping / payments live here (folded out of the main sidebar)
 * alongside the General tab, each linking to its dedicated section.
 */
const TABS: SettingsTab[] = [
    { href: "/settings/general", labelKey: "general", icon: Settings2 },
    { href: "/tax", labelKey: "tax", icon: Wallet },
    { href: "/shipping", labelKey: "shipping", icon: Truck },
    { href: "/payments", labelKey: "payments", icon: Banknote },
];

function isActive(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav() {
    const tGroups = useTranslations("Settings.groups");
    const tNav = useTranslations("Settings");
    const pathname = usePathname();
    return (
        <nav aria-label={tNav("groupsNav")} className="flex flex-col gap-1 text-sm">
            {TABS.map(({ href, labelKey, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                    <Link
                        key={href}
                        href={href as never}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
                            active
                                ? "bg-accent font-medium text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                        )}
                    >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span>{tGroups(labelKey)}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
