"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { useCommandPalette } from "#/components/CommandPalette";
import { LocaleSwitch } from "#/components/LocaleSwitch";
import { ThemeToggle } from "#/components/ThemeToggle";
import { UserMenu } from "#/components/UserMenu";
import { ChevronEnd, Command, Search } from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";

interface Crumb {
    label: string;
    href?: string;
}

/** Derive breadcrumb trail from the locale-stripped pathname. */
function useCrumbs(): Crumb[] {
    const nav = useTranslations("Nav");
    const tn = useTranslations("NewShop");
    const pathname = usePathname();
    const segments = pathname.split("/").filter(Boolean);

    const crumbs: Crumb[] = [{ label: nav("overview"), href: "/" }];
    if (segments[0] === "tenants") {
        crumbs.push({ label: nav("tenants"), href: "/tenants" });
        if (segments[1] === "new") crumbs.push({ label: tn("title") });
        else if (segments[1]) crumbs.push({ label: `#${segments[1]}` });
    } else if (segments[0] === "plans") {
        crumbs.push({ label: nav("plans"), href: "/plans" });
    }
    return crumbs;
}

/** Console top bar: breadcrumbs (start), a palette-opening search field (center), operator controls (end). Sticky. */
export function Topbar({ name, email }: { name: string; email: string }) {
    const t = useTranslations("Command");
    const palette = useCommandPalette();
    const crumbs = useCrumbs();

    return (
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-border border-b bg-card/70 px-5 backdrop-blur">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                {crumbs.map((crumb, index) => (
                    <Fragment key={crumb.label}>
                        {index > 0 ? (
                            <ChevronEnd className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                        ) : null}
                        {crumb.href && index < crumbs.length - 1 ? (
                            <Link
                                href={crumb.href}
                                className="truncate text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {crumb.label}
                            </Link>
                        ) : (
                            <span className="truncate font-medium text-foreground">{crumb.label}</span>
                        )}
                    </Fragment>
                ))}
            </nav>

            <button
                type="button"
                onClick={palette.open}
                className="mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-border/70 bg-background/60 px-3 text-muted-foreground text-sm outline-none transition-colors hover:border-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:flex"
            >
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t("placeholder")}</span>
                <kbd className="ms-auto inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                    <Command className="size-2.5" aria-hidden="true" />K
                </kbd>
            </button>

            <div className="ms-auto flex items-center gap-2 md:ms-0">
                <button
                    type="button"
                    onClick={palette.open}
                    aria-label={t("placeholder")}
                    className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
                >
                    <Search className="size-4" aria-hidden="true" />
                </button>
                <ThemeToggle />
                <LocaleSwitch />
                <UserMenu name={name} email={email} />
            </div>
        </header>
    );
}
