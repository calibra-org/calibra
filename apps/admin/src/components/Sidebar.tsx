"use client";

import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";
import { useEffect, useState } from "react";

import {
    BadgePercent,
    BarChart3,
    Bot,
    Box,
    Boxes,
    Bug,
    CalendarClock,
    ChartNoAxesCombined,
    ChevronDown,
    ContactRound,
    FileChartColumnIncreasing,
    FileText,
    FolderTree,
    ImageIcon,
    Landmark,
    LayoutDashboard,
    Library,
    Link2,
    ListTree,
    Newspaper,
    Package,
    PenLine,
    ReceiptText,
    Ribbon,
    Search,
    Settings,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Star,
    Tags as TagsIcon,
    TrendingUp,
    Users,
    Wallet,
    WandSparkles,
} from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface NavItem {
    href: string;
    labelKey: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface NavGroup {
    titleKey: "overview" | "catalog" | "sales" | "analytics" | "customersSection" | "configuration";
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
            { href: "/media", labelKey: "media", icon: ImageIcon },
        ],
    },
    {
        titleKey: "sales",
        items: [
            { href: "/orders", labelKey: "orders", icon: ReceiptText },
            { href: "/coupons", labelKey: "coupons", icon: BadgePercent },
        ],
    },
    {
        titleKey: "analytics",
        items: [
            { href: "/analytics", labelKey: "analyticsOverview", icon: BarChart3 },
            { href: "/analytics/revenue", labelKey: "analyticsRevenue", icon: TrendingUp },
            { href: "/analytics/orders", labelKey: "analyticsOrders", icon: ReceiptText },
            { href: "/analytics/products", labelKey: "analyticsProducts", icon: Package },
            { href: "/analytics/categories", labelKey: "analyticsCategories", icon: ListTree },
            { href: "/analytics/coupons", labelKey: "analyticsCoupons", icon: BadgePercent },
            { href: "/analytics/taxes", labelKey: "analyticsTaxes", icon: Wallet },
            { href: "/analytics/stock", labelKey: "analyticsStock", icon: Boxes },
        ],
    },
    {
        titleKey: "customersSection",
        items: [{ href: "/customers", labelKey: "customers", icon: Users }],
    },
    {
        titleKey: "configuration",
        items: [
            { href: "/settings/general", labelKey: "settings", icon: Settings },
            { href: "/reports", labelKey: "reports", icon: BarChart3 },
        ],
    },
];

const contentItems: NavItem[] = [
    { href: "/content/posts", labelKey: "contentPosts", icon: FileText },
    { href: "/content/market-radar", labelKey: "contentMarketRadar", icon: Newspaper },
    { href: "/content/agents", labelKey: "contentAgents", icon: Bot },
    { href: "/content/studio", labelKey: "contentStudio", icon: WandSparkles },
    { href: "/content/calendar", labelKey: "contentCalendar", icon: CalendarClock },
    { href: "/content/media", labelKey: "contentMedia", icon: Library },
    { href: "/content/taxonomy", labelKey: "contentTaxonomy", icon: FolderTree },
    { href: "/content/reports", labelKey: "contentReports", icon: ChartNoAxesCombined },
    { href: "/content/settings", labelKey: "contentSettings", icon: Settings2 },
];

const seoItems: NavItem[] = [
    { href: "/seo/overview", labelKey: "seoOverview", icon: BarChart3 },
    { href: "/seo/control-tower", labelKey: "seoControlTower", icon: Sparkles },
    { href: "/seo/products", labelKey: "seoProducts", icon: Package },
    { href: "/seo/categories-links", labelKey: "seoCategoriesLinks", icon: Link2 },
    { href: "/seo/images-alt", labelKey: "seoImagesAlt", icon: ImageIcon },
    { href: "/seo/schema-preview", labelKey: "seoSchemaPreview", icon: FileText },
    { href: "/seo/keywords-content", labelKey: "seoKeywordsContent", icon: TagsIcon },
    { href: "/seo/content-refresh", labelKey: "seoContentRefresh", icon: Newspaper },
    { href: "/seo/live-editor", labelKey: "seoLiveEditor", icon: PenLine },
    { href: "/seo/market-radar", labelKey: "seoMarketRadar", icon: TrendingUp },
    { href: "/seo/technical-health", labelKey: "seoTechnicalHealth", icon: ShieldCheck },
    { href: "/seo/crawl-monitoring", labelKey: "seoCrawlMonitoring", icon: Bug },
    { href: "/seo/rank-tracking", labelKey: "seoRankTracking", icon: TrendingUp },
    { href: "/seo/competitors-serp", labelKey: "seoCompetitorsSerp", icon: Users },
    { href: "/seo/reports", labelKey: "seoReports", icon: ChartNoAxesCombined },
    { href: "/seo/settings", labelKey: "seoSettings", icon: Settings2 },
];

const factorItems: NavItem[] = [
    { href: "/factor/documents", labelKey: "factorDocuments", icon: FileText },
    { href: "/factor/payments", labelKey: "factorPayments", icon: Landmark },
    { href: "/factor/reports", labelKey: "factorReports", icon: FileChartColumnIncreasing },
    { href: "/factor/records", labelKey: "factorRecords", icon: ContactRound },
    { href: "/factor/settings", labelKey: "factorSettings", icon: SlidersHorizontal },
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
    /** Settings links straight to the General tab; keep the parent active across every settings tab. */
    if (href === "/settings/general") return pathname === "/settings" || pathname.startsWith("/settings/");
    /** Analytics overview is the section root — only active on the exact path so it doesn't stay lit
     * on every `/analytics/<report>` sub-page (each has its own nav entry). */
    if (href === "/analytics") return pathname === "/analytics";
    if (href === "/factor/documents") return pathname === href || pathname.startsWith("/factor/documents/");
    if (href === "/content/posts") return pathname === href || pathname.startsWith("/content/posts/");
    if (href === "/content/studio") return pathname === href || pathname.startsWith("/content/studio/");
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
    const navT = useTranslations("Nav");
    const siteT = useTranslations("Site");
    const pathname = usePathname();
    const factorActive = pathname === "/factor" || pathname.startsWith("/factor/");
    const [factorOpen, setFactorOpen] = useState(factorActive);
    const contentActive = pathname === "/content" || pathname.startsWith("/content/");
    const [contentOpen, setContentOpen] = useState(contentActive);
    const seoActive = pathname === "/seo" || pathname.startsWith("/seo/");
    const [seoOpen, setSeoOpen] = useState(seoActive);

    useEffect(() => {
        if (factorActive) setFactorOpen(true);
    }, [factorActive]);

    useEffect(() => {
        if (contentActive) setContentOpen(true);
    }, [contentActive]);

    useEffect(() => {
        if (seoActive) setSeoOpen(true);
    }, [seoActive]);

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
                        <div className="px-3 pb-1 font-medium text-[0.65rem] text-sidebar-foreground/50 uppercase tracking-wider">
                            {navT(group.titleKey)}
                        </div>
                        {group.items.map(({ href, labelKey, icon: Icon }) => {
                            const active = isActive(pathname, href);
                            return (
                                <Link
                                    key={href}
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

                        {group.titleKey === "sales" ? (
                            <div className="mt-1">
                                <button
                                    type="button"
                                    className={cn(
                                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors",
                                        factorActive
                                            ? "bg-sidebar-accent/80 font-medium text-sidebar-accent-foreground"
                                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                    )}
                                    aria-expanded={factorOpen}
                                    aria-controls="factor-sidebar-items"
                                    onClick={() => setFactorOpen((open) => !open)}
                                >
                                    <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
                                    <span className="flex-1">{navT("factor")}</span>
                                    <ChevronDown
                                        className={cn("size-3.5 transition-transform", factorOpen && "rotate-180")}
                                        aria-hidden="true"
                                    />
                                </button>

                                {factorOpen ? (
                                    <div
                                        id="factor-sidebar-items"
                                        className="ms-5 mt-1 flex flex-col gap-0.5 border-sidebar-border border-s ps-2"
                                    >
                                        {factorItems.map(({ href, labelKey, icon: Icon }) => {
                                            const active = isActive(pathname, href);
                                            return (
                                                <Link
                                                    key={href}
                                                    href={href as never}
                                                    className={cn(
                                                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors",
                                                        active
                                                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                                            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                                    )}
                                                >
                                                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                                    <span>{navT(labelKey as Parameters<typeof navT>[0])}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                ) : null}

                                <div className="mt-1">
                                    <button
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors",
                                            contentActive
                                                ? "bg-sidebar-accent/80 font-medium text-sidebar-accent-foreground"
                                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                        )}
                                        aria-expanded={contentOpen}
                                        aria-controls="content-sidebar-items"
                                        onClick={() => setContentOpen((open) => !open)}
                                    >
                                        <PenLine className="size-4 shrink-0" aria-hidden="true" />
                                        <span className="flex-1">{navT("content")}</span>
                                        <ChevronDown
                                            className={cn("size-3.5 transition-transform", contentOpen && "rotate-180")}
                                            aria-hidden="true"
                                        />
                                    </button>

                                    {contentOpen ? (
                                        <div
                                            id="content-sidebar-items"
                                            className="ms-5 mt-1 flex flex-col gap-0.5 border-sidebar-border border-s ps-2"
                                        >
                                            {contentItems.map(({ href, labelKey, icon: Icon }) => {
                                                const active = isActive(pathname, href);
                                                return (
                                                    <Link
                                                        key={href}
                                                        href={href as never}
                                                        className={cn(
                                                            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors",
                                                            active
                                                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                                                : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                                        )}
                                                    >
                                                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                                        <span>{navT(labelKey as Parameters<typeof navT>[0])}</span>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="mt-1">
                                    <button
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors",
                                            seoActive
                                                ? "bg-sidebar-accent/80 font-medium text-sidebar-accent-foreground"
                                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                        )}
                                        aria-expanded={seoOpen}
                                        aria-controls="seo-sidebar-items"
                                        onClick={() => setSeoOpen((open) => !open)}
                                    >
                                        <Search className="size-4 shrink-0" aria-hidden="true" />
                                        <span className="flex-1">{navT("seo")}</span>
                                        <ChevronDown
                                            className={cn("size-3.5 transition-transform", seoOpen && "rotate-180")}
                                            aria-hidden="true"
                                        />
                                    </button>

                                    {seoOpen ? (
                                        <div
                                            id="seo-sidebar-items"
                                            className="ms-5 mt-1 flex flex-col gap-0.5 border-sidebar-border border-s ps-2"
                                        >
                                            {seoItems.map(({ href, labelKey, icon: Icon }, index) => {
                                                const active = isActive(pathname, href);
                                                const section =
                                                    index === 0
                                                        ? navT("seoSectionControl")
                                                        : index === 2
                                                          ? navT("seoSectionCatalog")
                                                          : index === 6
                                                            ? navT("seoSectionContent")
                                                            : index === 10
                                                              ? navT("seoSectionMonitoring")
                                                              : index === 14
                                                                ? navT("seoSectionSystem")
                                                                : null;
                                                return (
                                                    <div key={href}>
                                                        {section ? (
                                                            <div className="px-2.5 pt-2 pb-1 font-medium text-[0.6rem] text-sidebar-foreground/40 uppercase tracking-wider">
                                                                {section}
                                                            </div>
                                                        ) : null}
                                                        <Link
                                                            href={href as never}
                                                            className={cn(
                                                                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors",
                                                                active
                                                                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                                                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                                                            )}
                                                        >
                                                            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                                            <span>{navT(labelKey as Parameters<typeof navT>[0])}</span>
                                                        </Link>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
