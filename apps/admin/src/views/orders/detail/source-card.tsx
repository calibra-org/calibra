"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AdminOrder } from "#/lib/types";

interface SourceCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Compact "where did this order come from" card. Lives in the sidebar grid. Browser line parses
 * a best-effort browser/OS string out of the recorded user-agent; we never persist that parsed
 * form server-side because user-agents drift and we'd rather re-derive at render time.
 */
export function SourceCard({ order, locale: _locale }: SourceCardProps) {
    const t = useTranslations("Orders.detail.sourceCard");
    const sourceLabel = labelForSource(order.source, t);
    const browser = parseBrowser(order.userAgent);

    return (
        <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">{t("origin")}</span>
                <span className="inline-flex items-center gap-1.5">
                    <Globe className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    {sourceLabel}
                </span>
            </div>
            {order.ipAddress && (
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t("ip")}</span>
                    <span className="font-mono text-xs">{order.ipAddress}</span>
                </div>
            )}
            {browser && (
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t("browser")}</span>
                    <span className="text-xs">{browser}</span>
                </div>
            )}
            {order.referrer && (
                <div className="flex items-center justify-between gap-2">
                    <span className="shrink-0 text-muted-foreground text-xs">{t("referrer")}</span>
                    <span className="truncate text-xs" title={order.referrer}>
                        {order.referrer}
                    </span>
                </div>
            )}
        </div>
    );
}

function labelForSource(source: AdminOrder["source"], t: ReturnType<typeof useTranslations>): string {
    if (source === null) return t("unknown");
    try {
        return t(`channels.${source}` as never);
    } catch {
        return source;
    }
}

const BROWSER_MATCHERS: Array<{ name: string; pattern: RegExp }> = [
    { name: "Edge", pattern: /Edg\/(\d+)/ },
    { name: "Chrome", pattern: /Chrome\/(\d+)/ },
    { name: "Firefox", pattern: /Firefox\/(\d+)/ },
    { name: "Safari", pattern: /Version\/(\d+).*Safari/ },
];

function parseBrowser(ua: string | null): string | null {
    if (ua === null || ua.length === 0) return null;
    for (const matcher of BROWSER_MATCHERS) {
        const found = ua.match(matcher.pattern);
        if (found) {
            const os = /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
            return os ? `${matcher.name} ${found[1]} (${os})` : `${matcher.name} ${found[1]}`;
        }
    }
    return null;
}
