"use client";

import { LayoutDashboard, Package, ReceiptText, Settings, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";

import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface NavItem {
    href: "/dashboard" | "/products" | "/orders" | "/customers" | "/settings";
    labelKey: "dashboard" | "products" | "orders" | "customers" | "settings";
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const items: NavItem[] = [
    { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
    { href: "/products", labelKey: "products", icon: Package },
    { href: "/orders", labelKey: "orders", icon: ReceiptText },
    { href: "/customers", labelKey: "customers", icon: Users },
    { href: "/settings", labelKey: "settings", icon: Settings },
];

export function Sidebar() {
    const t = useTranslations("Nav");
    const siteName = useTranslations("Site")("name");
    const pathname = usePathname();

    return (
        <aside className="hidden w-64 shrink-0 flex-col gap-2 border-sidebar-border border-e bg-sidebar text-sidebar-foreground md:flex">
            <div className="flex h-14 items-center gap-2 border-sidebar-border border-b px-5">
                <div className="grid size-7 place-items-center rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground text-sm">
                    C
                </div>
                <span className="font-semibold text-sm tracking-tight">{siteName}</span>
            </div>

            <nav className="flex flex-col gap-0.5 px-3 py-4 text-sm">
                {items.map(({ href, labelKey, icon: Icon }) => {
                    const active = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex items-center gap-3 rounded-md px-3 py-2 transition",
                                active
                                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            )}
                        >
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            <span>{t(labelKey)}</span>
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
