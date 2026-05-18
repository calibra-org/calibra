import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Sidebar } from "#/components/Sidebar";
import { Topbar } from "#/components/Topbar";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

/**
 * Authenticated shell. Wire a session check here once `@adonisjs/auth` is configured — read the
 * token cookie, call the API, and `redirect("/login")` on a 401. Keeping the check in the layout
 * (not middleware) lets us forward the resolved `user` object into client components via context.
 */
export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    return (
        <div className="flex min-h-dvh">
            <Sidebar />
            <div className="flex flex-1 flex-col">
                <Topbar />
                <main className="flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
            </div>
        </div>
    );
}
