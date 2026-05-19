"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "#/lib/i18n/navigation";
import type { AdminSettingsGroup } from "#/lib/types";
import { cn } from "#/lib/utils";

interface SettingsNavProps {
    groups: AdminSettingsGroup[];
    locale: Locale;
}

export function SettingsNav({ groups, locale }: SettingsNavProps) {
    const t = useTranslations("Settings");
    const pathname = usePathname();
    return (
        <nav aria-label={t("groupsNav")} className="flex flex-col gap-1 text-sm">
            {groups.map((group) => {
                const href = `/settings/${group.key}`;
                const active = pathname === href;
                return (
                    <Link
                        key={group.key}
                        href={href as never}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "rounded-md px-3 py-2 transition-colors",
                            active
                                ? "bg-accent font-medium text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                        )}
                    >
                        {group.title[locale]}
                    </Link>
                );
            })}
        </nav>
    );
}
