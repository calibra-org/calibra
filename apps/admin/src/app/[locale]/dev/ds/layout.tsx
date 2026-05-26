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
 * Standalone design-system showcase shell. Lives **outside** the `(authenticated)` route group so
 * `/dev/ds` is a separate site with its own chrome — no login required, no admin sidebar / topbar,
 * no business surfaces leaking in. Reviewers hit `/dev/ds` directly and walk the primitive
 * inventory without ever touching the operator-facing admin.
 *
 * Production-gated: `NODE_ENV === "production"` returns 404 so the showcase never ships to live
 * operators. The gate runs server-side before any markup is emitted.
 */
export default async function DesignSystemLayout({ children, params }: LayoutProps) {
    if (process.env.NODE_ENV === "production") notFound();
    const { locale } = await params;
    setRequestLocale(locale);

    const uiPrimitives = getByTier("ui");
    const compositePrimitives = getByTier("composite");
    const businessPrimitives = getByTier("business");

    return (
        <div className="flex h-dvh flex-col bg-background text-foreground">
            <header className="flex h-12 shrink-0 items-center justify-between border-border border-b bg-card px-4">
                <Link href="/dev/ds" className="flex items-center gap-2 font-semibold text-sm">
                    <span className="grid size-6 place-items-center rounded-md bg-primary font-bold text-primary-foreground text-xs">
                        DS
                    </span>
                    Calibra Admin Design System
                </Link>
                <div className="flex items-center gap-3 text-muted-foreground text-xs">
                    <span>{PRIMITIVES.length} primitives</span>
                    <span>·</span>
                    <Link href="/" className="hover:text-foreground">
                        Back to admin
                    </Link>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 gap-6 p-6">
                <aside className="w-64 shrink-0 overflow-y-auto rounded-lg border border-border bg-card p-4">
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

                <main className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background p-8">
                    {children}
                </main>
            </div>
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
