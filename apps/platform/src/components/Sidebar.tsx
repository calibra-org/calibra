"use client";

import { Boxes, Layers, LayoutDashboard, Store } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

const NAV = [
    { href: "/", key: "overview", icon: LayoutDashboard, exact: true },
    { href: "/tenants", key: "tenants", icon: Store, exact: false },
    { href: "/plans", key: "plans", icon: Layers, exact: false },
] as const;

/**
 * Console left rail. Dense, icon + label, with an active-route highlight. Distinct from the
 * storefront/admin design — this is operator tooling (neutral, compact).
 */
export function Sidebar() {
    const t = useTranslations("Nav");
    const site = useTranslations("Site");
    const pathname = usePathname();

    return (
        <aside className="flex w-56 shrink-0 flex-col gap-1 border-border border-e bg-card/40 p-3">
            <div className="mb-3 flex items-center gap-2 px-2 py-1">
                <span className="grid size-8 place-items-center rounded-lg border border-border bg-card">
                    <Boxes className="size-4" aria-hidden="true" />
                </span>
                <span className="font-semibold text-sm leading-tight">{site("name")}</span>
            </div>
            <nav className="flex flex-col gap-0.5">
                {NAV.map(({ href, key, icon: Icon, exact }) => {
                    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <Link
                            key={key}
                            href={href}
                            className={cn(
                                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                                active
                                    ? "bg-accent font-medium text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                        >
                            <Icon className="size-4" aria-hidden="true" />
                            <span>{t(key)}</span>
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
