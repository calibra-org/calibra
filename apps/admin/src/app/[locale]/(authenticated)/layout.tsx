import { setRequestLocale } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import { Sidebar } from "#/components/Sidebar";
import { Topbar } from "#/components/Topbar";
import { Toaster } from "#/components/ui/toast";
import { requireSession } from "#/lib/auth";
import { QueryProvider } from "#/lib/queries/QueryProvider";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

/**
 * Authenticated shell. Guards every page inside `(authenticated)`: unauthenticated requests are
 * redirected to `/login` from {@link requireSession}. The resolved user is passed down into the
 * `Topbar`'s user menu so the sign-out form can submit the right server action.
 */
export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const session = await requireSession(locale);

    return (
        <NuqsAdapter>
            <QueryProvider>
                {/**
                 * `min-w-0` on every flex child along the chain is critical. Without it, a wide
                 * descendant (like the products table on narrow viewports) pushes the flex column
                 * past the viewport edge, taking the top bar / page header / toolbar buttons with
                 * it. `min-w-0` lets the flex child shrink below its content width so `overflow-x`
                 * actually clips/scrolls instead of expanding the parent.
                 */}
                <div className="flex min-h-dvh">
                    <Sidebar />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <Topbar user={{ email: session.email, displayName: session.displayName }} />
                        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
                    </div>
                </div>
                <Toaster />
            </QueryProvider>
        </NuqsAdapter>
    );
}
