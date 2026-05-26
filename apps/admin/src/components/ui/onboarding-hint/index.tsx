"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { type LucideIcon, X } from "#/icons";
import { cn } from "#/lib/utils";

const STORAGE_PREFIX = "calibra.hints.";

/**
 * Reads the dismissal state for a hint id from localStorage. SSR-safe (returns false during
 * hydration so the hint can render on the server and dismiss client-side once mounted).
 */
export function useHintDismissed(id: string): [boolean, () => void] {
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            setDismissed(window.localStorage.getItem(`${STORAGE_PREFIX}${id}`) === "1");
        } catch {
            /** Storage disabled — show the hint forever, but at least don't crash. */
        }
    }, [id]);

    const dismiss = useCallback(() => {
        setDismissed(true);
        try {
            window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
        } catch {
            /** noop */
        }
    }, [id]);

    return [dismissed, dismiss];
}

/** Imperative undismiss — exposed for "show hint again" admin controls. */
export function resetHint(id: string): void {
    try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    } catch {
        /** noop */
    }
}

export interface OnboardingHintProps {
    /** Stable id used for localStorage dismissal. Pick a kebab-case identifier per surface. */
    id: string;
    /** Icon rendered in the leading slot (from `#/icons`). Wrapped in a soft tinted circle. */
    icon: LucideIcon;
    title: string;
    description: ReactNode;
    cta?: { label: string; onClick: () => void };
    learnMore?: { href: string; label: string };
    /** "inline" is a compact dismiss-able banner; "card" is a hero card with primary CTA. */
    variant?: "inline" | "card";
    /** Override the localised "Dismiss" aria-label. */
    dismissLabel?: string;
    className?: string;
}

/**
 * Tier-3 composite. Empty-state / "next-step" hint card. Dismissal persists across sessions via
 * localStorage. The component renders nothing once dismissed, so it composes naturally inside any
 * container.
 */
export function OnboardingHint({
    id,
    icon: Icon,
    title,
    description,
    cta,
    learnMore,
    variant = "inline",
    dismissLabel,
    className,
}: OnboardingHintProps) {
    const t = useTranslations("Common");
    const [dismissed, dismiss] = useHintDismissed(id);
    if (dismissed) return null;

    if (variant === "card") {
        return (
            <Card className={cn("relative border-primary/30 bg-primary/[0.04]", className)}>
                <button
                    type="button"
                    aria-label={dismissLabel ?? t("dismiss")}
                    onClick={dismiss}
                    className="absolute end-3 top-3 grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <X className="size-3.5" aria-hidden="true" />
                </button>
                <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-center">
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                        <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                        {cta !== undefined && (
                            <Button type="button" size="sm" onClick={cta.onClick}>
                                {cta.label}
                            </Button>
                        )}
                        {learnMore !== undefined && (
                            <a
                                href={learnMore.href}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary text-xs hover:underline"
                            >
                                {learnMore.label}
                            </a>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className={cn("relative flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm", className)}>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="font-medium text-foreground">{title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
                {(cta !== undefined || learnMore !== undefined) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {cta !== undefined && (
                            <button type="button" onClick={cta.onClick} className="text-primary text-xs hover:underline">
                                {cta.label}
                            </button>
                        )}
                        {learnMore !== undefined && (
                            <a
                                href={learnMore.href}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-primary text-xs hover:underline"
                            >
                                {learnMore.label}
                            </a>
                        )}
                    </div>
                )}
            </div>
            <button
                type="button"
                aria-label={dismissLabel ?? t("dismiss")}
                onClick={dismiss}
                className="ms-1 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
                <X className="size-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}
OnboardingHint.displayName = "OnboardingHint";
