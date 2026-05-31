import type { HttpContext } from "@adonisjs/core/http";

import type { SettingValueType } from "#models/setting";
import { recordAudit } from "#services/admin_audit_log_service";
import SettingsService from "#services/settings_service";
import { toDateTimeSettings } from "#transformers/datetime_settings_transformer";
import { adminDateTimeSettingsUpdateValidator } from "#validators/admin/datetime_settings_validator";

interface PlannedWrite {
    key: string;
    value: unknown;
    type: SettingValueType;
}

export default class AdminSettingsDatetimeController {
    private settings = new SettingsService();

    /** GET /api/v1/admin/settings/datetime — current date/time format + preset lists. */
    async show() {
        return { data: await this.load() };
    }

    /**
     * PATCH /api/v1/admin/settings/datetime — partial update. Writes only the keys whose value
     * changed (same-value PATCH is a no-op — no write, no audit row). The stored patterns drive
     * every date the admin renders, so a save re-renders the panel via the settings query.
     */
    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminDateTimeSettingsUpdateValidator);
        const current = await this.settings.all("datetime");

        const writes: PlannedWrite[] = [];
        /** `typeof === "string"` (not `!== undefined`): AdonisJS converts an empty string to `null`,
         * and a partial PATCH should treat a null/absent field as "no change" rather than storing it. */
        if (typeof payload.date_format === "string")
            writes.push({ key: "date_format", value: payload.date_format, type: "string" });
        if (typeof payload.time_format === "string")
            writes.push({ key: "time_format", value: payload.time_format, type: "string" });

        let changed = false;
        for (const w of writes) {
            if (current[w.key] === w.value) continue;
            await this.settings.set("datetime", w.key, w.value, w.type);
            changed = true;
        }

        if (changed) {
            await recordAudit({
                ctx,
                action: "settings.datetime.patch",
                entityKind: "settings",
                entityId: null,
                payload: payload as Record<string, unknown>,
            });
        }

        return { data: await this.load() };
    }

    private async load() {
        return toDateTimeSettings(await this.settings.all("datetime"));
    }
}
