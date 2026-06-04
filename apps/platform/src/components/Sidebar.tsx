"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useCommandPalette } from "#/components/CommandPalette";
import { Command, Layers, LayoutDashboard, PanelLeft, Search, Store, Zap } from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

const NAV = [
    { href: "/", key: "overview", icon: LayoutDashboard, exact: true },
    { href: "/tenants", key: "tenants", icon: Store, exact: false },
    { href: "/plans", key: "plans", icon: Layers, exact: false },
] as const;

const STORAGE_KEY = "calibra-console-sidebar-collapsed";

/**
 * Console left rail — a collapsible mission-control nav. Workspace identity header (Console mark +
 * operator), an accent active-route pill that slides between items (`layoutId`), a grouped nav, and
 * a pinned ⌘K affordance at the foot. Collapse persists to localStorage; the width animates via
 * `motion`, honouring `prefers-reduced-motion`.
 */
export function Sidebar({ operatorName }: { operatorName: string }) {
    const t = useTranslations("Nav");
    const site = useTranslations("Site");
    const tc = useTranslations("Command");
    const pathname = usePathname();
    const palette = useCommandPalette();
    const reduce = useReducedMotion();
    const [collapsed, setCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
        setMounted(true);
    }, []);

    function toggle() {
        setCollapsed((current) => {
            const next = !current;
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
            return next;
        });
    }

    return (
        <motion.aside
            initial={false}
            animate={{ width: collapsed ? 68 : 240 }}
            transition={reduce || !mounted ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="flex shrink-0 flex-col gap-1 border-border border-e bg-card/40 p-3"
        >
            <div className="mb-3 flex items-center gap-2.5 px-1 py-1">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground accent-glow">
                    <Zap className="size-4" aria-hidden="true" />
                </span>
                {!collapsed ? (
                    <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold text-sm leading-tight">{site("name")}</span>
                        <span className="truncate text-muted-foreground text-xs leading-tight">{operatorName}</span>
                    </span>
                ) : null}
            </div>

            {!collapsed ? (
                <p className="px-2 pt-1 pb-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {site("tagline")}
                </p>
            ) : null}

            <nav className="flex flex-col gap-0.5">
                {NAV.map(({ href, key, icon: Icon, exact }) => {
                    const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                    return (
                        <Link
                            key={key}
                            href={href}
                            title={collapsed ? t(key) : undefined}
                            className={cn(
                                "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                                collapsed && "justify-center",
                                active
                                    ? "font-medium text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            )}
                        >
                            {active ? (
                                <motion.span
                                    layoutId="nav-active"
                                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
                                    className="absolute inset-0 rounded-md bg-accent ring-1 ring-primary/30"
                                    aria-hidden="true"
                                />
                            ) : null}
                            {active ? (
                                <span className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />
                            ) : null}
                            <Icon className="relative z-10 size-4 shrink-0" aria-hidden="true" />
                            {!collapsed ? <span className="relative z-10">{t(key)}</span> : null}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto flex flex-col gap-1 pt-3">
                <button
                    type="button"
                    onClick={palette.open}
                    title={collapsed ? tc("placeholder") : undefined}
                    className={cn(
                        "flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-2 text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                        collapsed && "justify-center",
                    )}
                >
                    <Search className="size-4 shrink-0" aria-hidden="true" />
                    {!collapsed ? (
                        <>
                            <span className="truncate">{tc("searchLabel")}</span>
                            <kbd className="ms-auto inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                                <Command className="size-2.5" aria-hidden="true" />K
                            </kbd>
                        </>
                    ) : null}
                </button>
                <button
                    type="button"
                    onClick={toggle}
                    aria-label={collapsed ? tc("expandRail") : tc("collapseRail")}
                    className={cn(
                        "flex items-center gap-2 rounded-md px-2.5 py-2 text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                        collapsed && "justify-center",
                    )}
                >
                    <PanelLeft className="size-4 shrink-0" data-rtl-flip aria-hidden="true" />
                    {!collapsed ? <span>{tc("collapseRail")}</span> : null}
                </button>
            </div>
        </motion.aside>
    );
}
