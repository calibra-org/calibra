import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { SettingsNav } from "#/components/SettingsNav";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

/**
 * Shared shell for the store-configuration sections (general settings, tax, shipping, payments).
 * Renders the persistent tab rail beside the active section's content, so the rail stays visible
 * as the operator moves between them — they read as one settings surface, not separate pages.
 */
export default async function StoreConfigLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return (
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-6 lg:self-start">
                <SettingsNav />
            </aside>
            <div className="min-w-0">{children}</div>
        </div>
    );
}
