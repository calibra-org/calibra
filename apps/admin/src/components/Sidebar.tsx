"use client";

import {
    BadgePercent,
    BarChart3,
    Box,
    CreditCard,
    LayoutDashboard,
    ListTree,
    Package,
    ReceiptText,
    RefreshCcw,
    Ribbon,
    Settings,
    Sparkles,
    Star,
    Tags as TagsIcon,
    Truck,
    Users,
    Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";

import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface NavItem {
    href: string;
    labelKey: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface NavGroup {
    titleKey: "overview" | "catalog" | "sales" | "customersSection" | "configuration";
    items: NavItem[];
}

const groups: NavGroup[] = [
    {
        titleKey: "overview",
        items: [{ href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard }],
    },
    {
        titleKey: "catalog",
        items: [
            { href: "/products", labelKey: "products", icon: Package },
            { href: "/products/categories", labelKey: "categories", icon: ListTree },
            { href: "/products/tags", labelKey: "tags", icon: TagsIcon },
            { href: "/products/brands", labelKey: "brands", icon: Ribbon },
            { href: "/products/attributes", labelKey: "attributes", icon: Sparkles },
            { href: "/products/reviews", labelKey: "reviews", icon: Star },
        ],
    },
    {
        titleKey: "sales",
        items: [
            { href: "/orders", labelKey: "orders", icon: ReceiptText },
            { href: "/refunds", labelKey: "refunds", icon: RefreshCcw },
            { href: "/coupons", labelKey: "coupons", icon: BadgePercent },
        ],
    },
    {
        titleKey: "customersSection",
        items: [{ href: "/customers", labelKey: "customers", icon: Users }],
    },
    {
        titleKey: "configuration",
        items: [
            { href: "/tax", labelKey: "tax", icon: Wallet },
            { href: "/shipping", labelKey: "shipping", icon: Truck },
            { href: "/payments", labelKey: "payments", icon: CreditCard },
            { href: "/settings", labelKey: "settings", icon: Settings },
            { href: "/reports", labelKey: "reports", icon: BarChart3 },
        ],
    },
];

/** Matches a nav item against the current path, with a special case for `/products` so the parent
 * stays highlighted on detail and new-product routes but not on the catalog sub-sections that
 * have their own entry (categories / tags / brands / attributes / reviews). */
function isActive(pathname: string, href: string): boolean {
    if (href === "/products") {
        if (pathname === "/products") return true;
        if (pathname === "/products/new") return true;
        return /^\/products\/\d+(?:\/|$)/.test(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
    const navT = useTranslations("Nav");
    const siteT = useTranslations("Site");
    const pathname = usePathname();

    return (
        <aside className="hidden w-64 shrink-0 flex-col gap-1 border-sidebar-border border-e bg-sidebar text-sidebar-foreground md:flex">
            <div className="flex h-14 items-center gap-2 border-sidebar-border border-b px-5">
                <div className="grid size-7 place-items-center rounded-md bg-sidebar-primary font-bold text-sidebar-primary-foreground text-sm">
                    <Box className="size-4" aria-hidden="true" />
                </div>
                <span className="font-semibold text-sm tracking-tight">{siteT("name")}</span>
            </div>

            <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 text-sm">
                {groups.map((group) => (
                    <div key={group.titleKey} className="flex flex-col gap-1">
                        <div className="px-3 pb-1 font-medium text-sidebar-foreground/50 text-[0.65rem] uppercase tracking-wider">
                            {navT(group.titleKey)}
                        </div>
                        {group.items.map(({ href, labelKey, icon: Icon }) => {
                            const active = isActive(pathname, href);
                            return (
                                <Link
                                    key={href}
                                    /** next-intl `Link` accepts `string` when typed pathnames aren't configured (the default here). */
                                    href={href as never}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                                        active
                                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                                    <span>{navT(labelKey as Parameters<typeof navT>[0])}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
