import { DEFAULT_FONT, DEFAULT_PALETTE } from "#services/storefront_branding_service";

/** A resolved media reference for the admin branding editor — the id to persist + the URL to preview. */
export interface BrandingMediaRef {
    id: number;
    url: string;
}

/** Font keys the storefront knows how to load. Surfaced as the branding-screen font picker options. */
export const BRANDING_FONTS = ["vazirmatn", "inter"] as const;

function str(group: Record<string, unknown>, key: string, fallback: string): string {
    const value = group[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Project the flat `branding` settings group into the typed shape the admin Branding screen
 * consumes. The logo/favicon media ids are resolved to `{ id, url }` upstream (in the controller,
 * which has the tenant-scoped `media` table to hand) and passed in here. Palette tokens fall back to
 * {@link DEFAULT_PALETTE} so an un-customized shop still paints a coherent preview. Mirrors the
 * storefront's `branding` contract (`storefront_tenant_transformer`) but additionally exposes the
 * media ids the form must round-trip, and the font option list.
 */
export function toBrandingSettings(
    group: Record<string, unknown>,
    media: { logo: BrandingMediaRef | null; favicon: BrandingMediaRef | null },
) {
    return {
        name: str(group, "name", ""),
        tagline: str(group, "tagline", ""),
        font: str(group, "font", DEFAULT_FONT),
        logo: media.logo,
        favicon: media.favicon,
        palette: {
            background: str(group, "palette_background", DEFAULT_PALETTE.background),
            foreground: str(group, "palette_foreground", DEFAULT_PALETTE.foreground),
            muted: str(group, "palette_muted", DEFAULT_PALETTE.muted),
            muted_foreground: str(group, "palette_muted_foreground", DEFAULT_PALETTE.mutedForeground),
            border: str(group, "palette_border", DEFAULT_PALETTE.border),
            accent: str(group, "palette_accent", DEFAULT_PALETTE.accent),
            accent_foreground: str(group, "palette_accent_foreground", DEFAULT_PALETTE.accentForeground),
        },
        options: {
            fonts: BRANDING_FONTS.map((value) => ({ value })),
        },
    };
}
