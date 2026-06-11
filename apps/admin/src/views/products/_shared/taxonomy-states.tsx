"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";

/**
 * Loading placeholder for the taxonomy workbenches (categories / tags / brands / attributes /
 * terms). Mirrors the two-column `inspector + list` grid so the chrome is stable while the
 * browser-side React Query fetch is in flight — header and layout paint instantly, only the
 * data regions show shimmer.
 */
export function TaxonomyWorkbenchSkeleton() {
    return (
        <section className="flex flex-col gap-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-48 rounded-md" />
                    <Skeleton className="h-4 w-72 rounded-md" />
                </div>
                <Skeleton className="h-9 w-32 rounded-md" />
            </header>
            <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
                <Skeleton className="h-80 w-full rounded-2xl" />
                <Skeleton className="h-[28rem] w-full rounded-2xl" />
            </div>
        </section>
    );
}

interface TaxonomyErrorStateProps {
    onRetry: () => void;
}

/**
 * Retry-able error state for the taxonomy workbenches. Rendered when the list query rejects
 * (proxy 5xx, network failure). Uses the shared `Common.errorLoading` / `Common.retry` strings
 * so every taxonomy surface fails identically.
 */
export function TaxonomyErrorState({ onRetry }: TaxonomyErrorStateProps) {
    const t = useTranslations("Common");
    return (
        <section className="flex flex-col gap-5">
            <div className="flex min-h-[28rem] flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 border-dashed bg-destructive/5 p-12 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
                    <AlertTriangle className="size-5" aria-hidden="true" />
                </div>
                <p className="max-w-sm text-muted-foreground text-sm">{t("errorLoading")}</p>
                <Button type="button" variant="outline" onClick={onRetry}>
                    {t("retry")}
                </Button>
            </div>
        </section>
    );
}
