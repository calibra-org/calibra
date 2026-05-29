"use client";

import type { Locale } from "@calibra/shared/i18n";
import { RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatRelativeTime } from "#/lib/format";

/** "Updated X ago" chip sourced from a report's `generated_at`, signalling cache freshness. */
export function FreshnessChip({ generatedAt }: { generatedAt?: string | null }) {
    const locale = useLocale() as Locale;
    const t = useTranslations("Analytics");
    if (!generatedAt) return null;
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground text-xs">
            <RefreshCw className="size-3" aria-hidden="true" />
            {t("updated", { when: formatRelativeTime(generatedAt, locale) })}
        </span>
    );
}
