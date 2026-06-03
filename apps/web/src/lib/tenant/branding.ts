import type { CSSProperties } from "react";

import type { StorefrontTenant } from "./current-tenant";

type Palette = StorefrontTenant["branding"]["palette"];

/**
 * Map a tenant palette to the storefront's `--color-*` custom properties (RULE B). Applied inline on
 * `<html>` so it overrides the `@theme` defaults in globals.css before first paint — the existing
 * Tailwind token classes (`bg-background`, `text-accent`, …) then resolve to the shop's colors with
 * no flash of the baseline theme. Every key here MUST exist in `@theme` to be themeable.
 */
export function paletteToCssVars(palette: Palette): CSSProperties {
    return {
        "--color-background": palette.background,
        "--color-foreground": palette.foreground,
        "--color-muted": palette.muted,
        "--color-muted-foreground": palette.mutedForeground,
        "--color-border": palette.border,
        "--color-accent": palette.accent,
        "--color-accent-foreground": palette.accentForeground,
    } as CSSProperties;
}

/** First grapheme of the brand name, upper-cased — the monogram shown when a tenant has no logo. */
export function brandMonogram(name: string): string {
    return [...name.trim()][0]?.toUpperCase() ?? "•";
}
