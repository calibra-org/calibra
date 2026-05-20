"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "#/components/ui/button";

interface ErrorBoundaryProps {
    error: Error & { digest?: string };
    reset: () => void;
}

/**
 * Route-segment error boundary. Surfaces an inline retry rather than redirecting — the live
 * client error is logged to the console so devs can spot regressions during preview deploys.
 */
export default function ProductsError({ error, reset }: ErrorBoundaryProps) {
    const t = useTranslations("Products.list");

    useEffect(() => {
        console.error("[products/error]", error);
    }, [error]);

    return (
        <section className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-destructive">
            <p className="font-medium">{t("loadError")}</p>
            <p className="text-destructive/80 text-sm">{error.message}</p>
            <Button variant="destructive" onClick={reset}>
                {t("retry")}
            </Button>
        </section>
    );
}
