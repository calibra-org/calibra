import { z } from "zod";

import type { MediaFieldValue } from "#/components/media-picker";
import type { AdminBrandingSettings, AdminBrandingSettingsUpdate } from "#/lib/queries/branding";

/**
 * OKLCH color string — must match the API validator (`branding_settings_validator`) so a value the
 * form accepts is never rejected on save. The storefront consumes these verbatim as CSS custom
 * properties (RULE B).
 */
export const OKLCH_RE = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)$/i;

/** The seven palette tokens, in display order. Keys mirror the API's snake-case palette shape. */
export const PALETTE_TOKENS = [
    "background",
    "foreground",
    "muted",
    "muted_foreground",
    "border",
    "accent",
    "accent_foreground",
] as const;

export type PaletteToken = (typeof PALETTE_TOKENS)[number];

const mediaValue = z.object({ id: z.number(), url: z.string() }).nullable() satisfies z.ZodType<MediaFieldValue | null>;

const color = z.string().regex(OKLCH_RE);

export const brandingFormSchema = z.object({
    name: z.string().max(120),
    tagline: z.string().max(240),
    font: z.enum(["vazirmatn", "inter"]),
    logo: mediaValue,
    favicon: mediaValue,
    palette: z.object({
        background: color,
        foreground: color,
        muted: color,
        muted_foreground: color,
        border: color,
        accent: color,
        accent_foreground: color,
    }),
});

export type BrandingForm = z.infer<typeof brandingFormSchema>;

/** Map the API response into the form shape. */
export function toForm(data: AdminBrandingSettings): BrandingForm {
    return {
        name: data.name,
        tagline: data.tagline,
        font: data.font === "inter" ? "inter" : "vazirmatn",
        logo: data.logo,
        favicon: data.favicon,
        palette: {
            background: data.palette.background,
            foreground: data.palette.foreground,
            muted: data.palette.muted,
            muted_foreground: data.palette.muted_foreground,
            border: data.palette.border,
            accent: data.palette.accent,
            accent_foreground: data.palette.accent_foreground,
        },
    };
}

/** Map the form back to the PATCH payload (server no-ops unchanged keys). */
export function toUpdate(values: BrandingForm): AdminBrandingSettingsUpdate {
    return {
        name: values.name,
        tagline: values.tagline,
        font: values.font,
        logo_media_id: values.logo?.id ?? null,
        favicon_media_id: values.favicon?.id ?? null,
        palette: { ...values.palette },
    };
}
