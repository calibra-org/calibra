"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

export interface NavigationGuardProps {
    /** When true, the guard activates: tab close and in-app navigation will both confirm. */
    when: boolean;
}

/**
 * Warns the operator before discarding unsaved changes. Two channels: `beforeunload` for tab
 * close / browser nav, and the same handler is exported as `confirmDiscard()` for in-app
 * router calls to invoke. Next's App Router doesn't yet expose a stable `useBeforeUnload` so we
 * roll our own — the tab-close path is the one that matters in practice.
 */
export function NavigationGuard({ when }: NavigationGuardProps) {
    const t = useTranslations("Products.detail");
    useEffect(() => {
        if (!when) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = t("unsavedConfirm");
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [when, t]);
    return null;
}

/** Returns true when the operator confirmed leaving with unsaved changes. */
export function confirmDiscard(message: string): boolean {
    if (typeof window === "undefined") return true;
    return window.confirm(message);
}
