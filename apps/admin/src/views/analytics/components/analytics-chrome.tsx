"use client";

import type { ReactNode } from "react";

import { usePathname } from "#/lib/i18n/navigation";

import { AnalyticsToolbar } from "./analytics-toolbar";

/**
 * Sticky chrome shared by every `/analytics` page: the global date / compare / interval toolbar
 * sits above the routed report. On the Stock report (a current snapshot) the windowed controls are
 * suppressed — that page renders its own status filter instead.
 */
export function AnalyticsChrome({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isStock = pathname.startsWith("/analytics/stock");

    return (
        <div className="flex flex-col gap-7">
            {!isStock && (
                <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-1 border-border border-b bg-background/85 px-6 py-4 backdrop-blur">
                    <AnalyticsToolbar />
                </div>
            )}
            {children}
        </div>
    );
}
