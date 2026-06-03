import cache from "@adonisjs/cache/services/main";
import type { HttpContext } from "@adonisjs/core/http";

import Media from "#models/media";
import type { SettingValueType } from "#models/setting";
import { recordAudit } from "#services/admin_audit_log_service";
import { CacheTags } from "#services/cache_keys";
import SettingsService from "#services/settings_service";
import { BRANDING_GROUP } from "#services/storefront_branding_service";
import { currentTenantId } from "#services/tenant_context";
import { type BrandingMediaRef, toBrandingSettings } from "#transformers/branding_settings_transformer";
import { adminBrandingSettingsUpdateValidator } from "#validators/admin/branding_settings_validator";

interface PlannedWrite {
    key: string;
    value: unknown;
    type: SettingValueType;
}

type BrandingSettingsPayload = Awaited<ReturnType<typeof adminBrandingSettingsUpdateValidator.validate>>;

/** Map a palette payload key (`muted_foreground`) to its flat settings row key (`palette_muted_foreground`). */
const PALETTE_KEYS = ["background", "foreground", "muted", "muted_foreground", "border", "accent", "accent_foreground"] as const;

export default class AdminSettingsBrandingController {
    private settings = new SettingsService();

    /**
     * GET /api/v1/admin/settings/branding — the storefront-facing branding config (name, tagline,
     * font, logo/favicon, OKLCH palette) the shop's staff self-serve. The logo/favicon media ids are
     * resolved to `{ id, url }` so the screen can both preview the current asset and round-trip the
     * id on save.
     */
    async show() {
        return { data: await this.load() };
    }

    /**
     * PATCH /api/v1/admin/settings/branding — partial update. Writes only the keys whose value
     * changed (a flip-back-to-original writes nothing, no audit row). Because the storefront's public
     * `GET /api/v1/storefront/tenant` caches the resolved branding under its own tag, a real change
     * must bust `CacheTags.storefrontTenant` — otherwise the shop keeps rendering the old palette
     * until the 30-minute TTL lapses.
     */
    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminBrandingSettingsUpdateValidator);
        const current = await this.settings.all(BRANDING_GROUP);

        let changed = false;
        for (const w of this.planWrites(payload)) {
            if (current[w.key] === w.value) continue;
            await this.settings.set(BRANDING_GROUP, w.key, w.value, w.type);
            changed = true;
        }

        if (changed) {
            await cache.deleteByTag({ tags: [CacheTags.storefrontTenant(currentTenantId())] });
            await recordAudit({
                ctx,
                action: "settings.branding.patch",
                entityKind: "settings",
                entityId: null,
                payload: payload as Record<string, unknown>,
            });
        }

        return { data: await this.load() };
    }

    private planWrites(payload: BrandingSettingsPayload): PlannedWrite[] {
        const writes: PlannedWrite[] = [];
        if (payload.name !== undefined) writes.push({ key: "name", value: payload.name, type: "string" });
        if (payload.tagline !== undefined) writes.push({ key: "tagline", value: payload.tagline, type: "string" });
        if (payload.font !== undefined) writes.push({ key: "font", value: payload.font, type: "string" });
        if (payload.logo_media_id !== undefined)
            writes.push({ key: "logo_media_id", value: payload.logo_media_id, type: "json" });
        if (payload.favicon_media_id !== undefined)
            writes.push({ key: "favicon_media_id", value: payload.favicon_media_id, type: "json" });

        const palette = payload.palette;
        if (palette) {
            for (const key of PALETTE_KEYS) {
                const value = palette[key];
                if (value !== undefined) writes.push({ key: `palette_${key}`, value, type: "string" });
            }
        }

        return writes;
    }

    /**
     * Resolve a branding media id to `{ id, url }` via the tenant-scoped `media` table (RLS, so a
     * tenant can only resolve its own media). Returns `null` when unset or the row is missing.
     */
    private async resolveMedia(value: unknown): Promise<BrandingMediaRef | null> {
        if (typeof value !== "number" || !Number.isFinite(value)) return null;
        const row = await Media.find(value);
        return row ? { id: value, url: row.url } : null;
    }

    private async load() {
        const group = await this.settings.all(BRANDING_GROUP);
        const [logo, favicon] = await Promise.all([
            this.resolveMedia(group.logo_media_id),
            this.resolveMedia(group.favicon_media_id),
        ]);
        return toBrandingSettings(group, { logo, favicon });
    }
}
