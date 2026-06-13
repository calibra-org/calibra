"use client";

import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";

import { Banknote, CalendarDays, ImageIcon, MessageCircle, Palette, Settings2, Truck, Wallet } from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface SettingsTab {
    /** Link target — each section's real first page (never a redirect-only index route). */
    href: string;
    /** Path prefix used for active-state matching across the section's subpages. */
    match: string;
    labelKey: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Store-configuration tabs. Tax / shipping / payments live here (folded out of the main sidebar)
 * alongside the General tab. Each `href` targets the section's first real page directly, bypassing
 * the redirect-only index routes (which trip a Next dev `performance.measure` error).
 */
const TABS: SettingsTab[] = [
    { href: "/settings/general", match: "/settings/general", labelKey: "general", icon: Settings2 },
    { href: "/settings/datetime", match: "/settings/datetime", labelKey: "datetime", icon: CalendarDays },
    { href: "/settings/media", match: "/settings/media", labelKey: "media", icon: ImageIcon },
    { href: "/branding", match: "/branding", labelKey: "branding", icon: Palette },
    { href: "/tax/classes", match: "/tax", labelKey: "tax", icon: Wallet },
    { href: "/shipping/zones", match: "/shipping", labelKey: "shipping", icon: Truck },
    { href: "/payments", match: "/payments", labelKey: "payments", icon: Banknote },
    { href: "/settings/support", match: "/settings/support", labelKey: "support", icon: MessageCircle },
];

function isActive(pathname: string, match: string): boolean {
    return pathname === match || pathname.startsWith(`${match}/`);
}

export function SettingsNav() {
    const tGroups = useTranslations("Settings.groups");
    const tNav = useTranslations("Settings");
    const pathname = usePathname();
    return (
        <nav aria-label={tNav("groupsNav")} className="flex flex-col gap-1 text-sm">
            {TABS.map(({ href, match, labelKey, icon: Icon }) => {
                const active = isActive(pathname, match);
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
