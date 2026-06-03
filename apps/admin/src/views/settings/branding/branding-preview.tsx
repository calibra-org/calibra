"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

import type { MediaFieldValue } from "#/components/media-picker";

import type { BrandingForm } from "./schema";

/** Map a font key to the CSS variable the locale layout exposes (next/font). */
function fontFamilyFor(font: BrandingForm["font"]): string {
    return font === "inter" ? "var(--font-inter)" : "var(--font-vazirmatn)";
}

/** First grapheme of the shop name, for the no-logo monogram fallback (mirrors the storefront). */
function monogram(name: string): string {
    return [...name.trim()][0]?.toUpperCase() ?? "؟";
}

interface BrandingPreviewProps {
    palette: BrandingForm["palette"];
    name: string;
    tagline: string;
    logo: MediaFieldValue | null;
    font: BrandingForm["font"];
}

/**
 * Live storefront preview. Renders a self-contained storefront-style swatch using the chosen palette
 * as **inline OKLCH values** — deliberately not the admin's Tailwind tokens, so it reflects the
 * storefront's look regardless of the admin theme (RULE C: this previews the shop, not the chrome).
 * Updates as the operator edits, so they see the effect before saving.
 */
export function BrandingPreview({ palette, name, tagline, logo, font }: BrandingPreviewProps) {
    const t = useTranslations("Branding.preview");
    const shell: CSSProperties = {
        background: palette.background,
        color: palette.foreground,
        borderColor: palette.border,
        fontFamily: fontFamilyFor(font),
    };

    return (
        <div className="overflow-hidden rounded-xl border shadow-sm" style={shell} dir="rtl">
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: palette.border }}>
                <div className="flex items-center gap-2">
                    {logo ? (
                        // biome-ignore lint/performance/noImgElement: small preview, no Next/Image loader
                        <img src={logo.url} alt="" className="h-6 w-auto object-contain" />
                    ) : (
                        <span
                            className="grid size-6 place-items-center rounded-md text-xs font-bold"
                            style={{ background: palette.accent, color: palette.accent_foreground }}
                        >
                            {monogram(name)}
                        </span>
                    )}
                    <span className="font-semibold text-sm">{name || t("nav")}</span>
                </div>
                <nav className="flex items-center gap-3 text-xs" style={{ color: palette.muted_foreground }}>
                    <span>{t("nav")}</span>
                    <span style={{ color: palette.foreground }}>{t("cta")}</span>
                </nav>
            </header>

            <div className="px-4 py-6">
                <h3 className="font-bold text-lg leading-tight">{t("heading")}</h3>
                <p className="mt-1 text-sm" style={{ color: palette.muted_foreground }}>
                    {tagline || t("body")}
                </p>
                <button
                    type="button"
                    className="mt-4 rounded-md px-4 py-2 font-medium text-sm"
                    style={{ background: palette.accent, color: palette.accent_foreground }}
                >
                    {t("cta")}
                </button>
            </div>

            <div className="px-4 py-2 text-center text-xs" style={{ background: palette.muted, color: palette.muted_foreground }}>
                {t("muted")}
            </div>
        </div>
    );
}
