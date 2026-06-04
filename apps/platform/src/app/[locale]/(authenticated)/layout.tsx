import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { QueryProvider } from "#/components/QueryProvider";
import { Sidebar } from "#/components/Sidebar";
import { Topbar } from "#/components/Topbar";
import { requireSession } from "#/lib/auth";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

/**
 * Authenticated console shell. Guards every route with `requireSession` (bounces to `/login` when
 * the operator cookie is absent) and mounts the React Query provider here so the login route stays
 * out of that bundle.
 */
export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const session = await requireSession(locale);

    return (
        <QueryProvider>
            <div className="flex min-h-dvh">
                <Sidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                    <Topbar name={session.name} email={session.email} />
                    <main className="min-w-0 flex-1 overflow-x-hidden p-6">{children}</main>
                </div>
            </div>
        </QueryProvider>
    );
}
