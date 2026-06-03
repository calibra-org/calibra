import Media from "#models/media";
import SettingsService from "#services/settings_service";

/**
 * Per-tenant brand palette in OKLCH. Keys mirror the storefront's `@theme` tokens in
 * `apps/web/src/styles/globals.css` — the storefront injects these as `--color-*` custom properties
 * so the existing Tailwind classes (`bg-background`, `text-accent`, …) resolve to the shop's colors.
 */
export interface BrandingPalette {
    background: string;
    foreground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    accent: string;
    accentForeground: string;
}

/** Fully-resolved branding for one tenant — media ids already turned into absolute URLs. */
export interface ResolvedBranding {
    name: string;
    tagline: string;
    font: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    palette: BrandingPalette;
}

/**
 * Settings group that stores branding. The storefront consumes it through
 * `GET /api/v1/storefront/tenant`; the admin branding editor (Phase 5 control plane) writes it.
 */
export const BRANDING_GROUP = "branding";

/**
 * Fallback brand. Matches the OKLCH defaults baked into the storefront's `globals.css`, so a tenant
 * that never customized branding renders byte-identically to the un-themed baseline. Every new
 * themeable token MUST exist both here and in `@theme` (globals.css) or it cannot be overridden.
 */
export const DEFAULT_PALETTE: BrandingPalette = {
    background: "oklch(99% 0 0)",
    foreground: "oklch(15% 0 0)",
    muted: "oklch(96% 0 0)",
    mutedForeground: "oklch(45% 0 0)",
    border: "oklch(90% 0 0)",
    accent: "oklch(60% 0.18 250)",
    accentForeground: "oklch(99% 0 0)",
};

/** Default font key; the storefront maps this to a loaded font family (`vazirmatn` / `inter`). */
export const DEFAULT_FONT = "vazirmatn";

/**
 * Flat key → (value, type) shape the seeder and provisioning service write into the `settings`
 * table for the branding group. Exported so both stay in lockstep with {@link loadTenantBranding}.
 */
export interface BrandingSettingsInput {
    name?: string;
    tagline?: string;
    font?: string;
    logoMediaId?: number | null;
    faviconMediaId?: number | null;
    palette?: Partial<BrandingPalette>;
}

/**
 * The per-key rows for the branding settings group. `name` falls back to the tenant's display name
 * (passed in) when the operator hasn't set a distinct brand name.
 */
export function brandingSettingRows(
    input: BrandingSettingsInput,
    tenantName: string,
): Array<{ key: string; value: unknown; type: "string" | "number" | "json" }> {
    const palette = { ...DEFAULT_PALETTE, ...input.palette };
    return [
        { key: "name", value: input.name ?? tenantName, type: "string" },
        { key: "tagline", value: input.tagline ?? "", type: "string" },
        { key: "font", value: input.font ?? DEFAULT_FONT, type: "string" },
        { key: "logo_media_id", value: input.logoMediaId ?? null, type: "json" },
        { key: "favicon_media_id", value: input.faviconMediaId ?? null, type: "json" },
        { key: "palette_background", value: palette.background, type: "string" },
        { key: "palette_foreground", value: palette.foreground, type: "string" },
        { key: "palette_muted", value: palette.muted, type: "string" },
        { key: "palette_muted_foreground", value: palette.mutedForeground, type: "string" },
        { key: "palette_border", value: palette.border, type: "string" },
        { key: "palette_accent", value: palette.accent, type: "string" },
        { key: "palette_accent_foreground", value: palette.accentForeground, type: "string" },
    ];
}

function str(value: unknown, fallback: string): string {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}

function mediaId(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Resolve a media id to its absolute public URL via the tenant-scoped `media` table. Runs on the
 * request transaction (RLS), so a tenant can only ever resolve its own media. Returns `null` when
 * the id is unset or the row is missing.
 */
async function resolveMediaUrl(id: number | null): Promise<string | null> {
    if (id === null) return null;
    const row = await Media.find(id);
    return row?.url ?? null;
}

/**
 * Load the current tenant's branding, applying {@link DEFAULT_PALETTE} for any unset token and
 * resolving the logo/favicon media ids to URLs. Reads ride the request transaction through
 * {@link SettingsService} (group cached per tenant), so the call is cheap on a warm cache.
 */
export async function loadTenantBranding(tenantName: string): Promise<ResolvedBranding> {
    const settings = new SettingsService();
    const group = await settings.all(BRANDING_GROUP);
    const [logoUrl, faviconUrl] = await Promise.all([
        resolveMediaUrl(mediaId(group.logo_media_id)),
        resolveMediaUrl(mediaId(group.favicon_media_id)),
    ]);
    return {
        name: str(group.name, tenantName),
        tagline: str(group.tagline, ""),
        font: str(group.font, DEFAULT_FONT),
        logoUrl,
        faviconUrl,
        palette: {
            background: str(group.palette_background, DEFAULT_PALETTE.background),
            foreground: str(group.palette_foreground, DEFAULT_PALETTE.foreground),
            muted: str(group.palette_muted, DEFAULT_PALETTE.muted),
            mutedForeground: str(group.palette_muted_foreground, DEFAULT_PALETTE.mutedForeground),
            border: str(group.palette_border, DEFAULT_PALETTE.border),
            accent: str(group.palette_accent, DEFAULT_PALETTE.accent),
            accentForeground: str(group.palette_accent_foreground, DEFAULT_PALETTE.accentForeground),
        },
    };
}
