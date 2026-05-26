import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { getByTier, PRIMITIVES } from "#/design-system/showcase/registry";
import { Link } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

/**
 * Showcase shell. Gated behind `NODE_ENV !== "production"` — visiting `/dev/ds` in a production
 * build returns 404 so the showcase never ships to live admin operators.
 *
 * Renders a vertical side nav grouped by tier (UI / Composite / Business) reading from
 * `showcase/registry.ts`. The main panel hosts the per-primitive page.
 */
export default async function DesignSystemLayout({ children, params }: LayoutProps) {
    if (process.env.NODE_ENV === "production") notFound();
    const { locale } = await params;
    setRequestLocale(locale);

    const uiPrimitives = getByTier("ui");
    const compositePrimitives = getByTier("composite");
    const businessPrimitives = getByTier("business");

    return (
        <div className="flex h-[calc(100dvh-3.5rem)] gap-6 p-6">
            <aside className="w-64 shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-2">
                    <Link href="/dev/ds" className="font-semibold text-sm">
                        Design System
                    </Link>
                    <span className="text-muted-foreground text-xs">{PRIMITIVES.length} primitives</span>
                </div>

                <NavSection title="Reference">
                    <NavItem href="/dev/ds">Overview</NavItem>
                    <NavItem href="/dev/ds/tokens">Tokens</NavItem>
                </NavSection>

                <NavSection title={`Tier 2 — UI (${uiPrimitives.length})`}>
                    {uiPrimitives.map((p) => (
                        <NavItem key={p.name} href={`/dev/ds/${p.name}`}>
                            {p.label}
                        </NavItem>
                    ))}
                </NavSection>

                <NavSection title={`Tier 3 — Composite (${compositePrimitives.length})`}>
                    {compositePrimitives.map((p) => (
                        <NavItem key={p.name} href={`/dev/ds/${p.name}`}>
                            {p.label}
                        </NavItem>
                    ))}
                </NavSection>

                <NavSection title={`Tier 4 — Business (${businessPrimitives.length})`}>
                    {businessPrimitives.map((p) => (
                        <NavItem key={p.name} href={`/dev/ds/${p.name}`}>
                            {p.label}
                        </NavItem>
                    ))}
                </NavSection>
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background p-8">{children}</main>
        </div>
    );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="mb-4">
            <div className="mb-1 px-2 py-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</div>
            <ul className="flex flex-col">{children}</ul>
        </div>
    );
}

function NavItem({ href, children }: { href: string; children: ReactNode }) {
    return (
        <li>
            <Link
                href={href as never}
                className={cn(
                    "block rounded-sm px-2 py-1 text-sm transition-colors",
                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
            >
                {children}
            </Link>
        </li>
    );
}
