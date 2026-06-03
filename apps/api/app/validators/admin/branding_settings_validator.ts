import vine from "@vinejs/vine";

/**
 * OKLCH color string, e.g. `oklch(60% 0.18 250)` or `oklch(99% 0 0 / 0.5)`. The storefront consumes
 * these verbatim as CSS custom properties (RULE B), so we accept exactly what CSS does: a lightness
 * (number or percentage), chroma, hue, and an optional `/ alpha`. Rejecting anything else here stops
 * a malformed value from reaching the storefront's `<html>` style attribute.
 */
const OKLCH_RE = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)$/i;

const oklch = () => vine.string().trim().regex(OKLCH_RE).optional();

/**
 * PATCH body for `PATCH /api/v1/admin/settings/branding`. Every field is optional — the controller
 * writes only what changed (same-value writes are no-ops, no audit row). `logo_media_id` /
 * `favicon_media_id` reference a row in the tenant's `media` table (or `null` to clear). Palette
 * tokens are validated as OKLCH so the storefront never renders a broken custom property. `font` is
 * a key the storefront maps to a loaded family — constrained to the families we actually ship.
 */
export const adminBrandingSettingsUpdateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().maxLength(120).optional(),
        tagline: vine.string().trim().maxLength(240).optional(),
        font: vine.enum(["vazirmatn", "inter"]).optional(),
        logo_media_id: vine.number().withoutDecimals().positive().nullable().optional(),
        favicon_media_id: vine.number().withoutDecimals().positive().nullable().optional(),
        palette: vine
            .object({
                background: oklch(),
                foreground: oklch(),
                muted: oklch(),
                muted_foreground: oklch(),
                border: oklch(),
                accent: oklch(),
                accent_foreground: oklch(),
            })
            .optional(),
    }),
);
