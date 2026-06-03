import type { ReactNode } from "react";

import { fontVariables } from "#/lib/fonts";
import "#/styles/globals.css";

/**
 * Root layout for platform-level state pages (shop-not-found / unavailable / misrouted). Reached
 * only via an internal rewrite from the middleware for hosts that don't resolve to a renderable shop
 * (RULE A / Section 6). Deliberately un-branded and locale-agnostic — these are platform pages, not
 * tenant pages, so they use the baseline `@theme` palette with no per-tenant overrides.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" dir="ltr" className={fontVariables}>
            <body className="grid min-h-dvh place-items-center bg-background font-sans text-foreground antialiased">
                {children}
            </body>
        </html>
    );
}
