import type { HttpContext } from "@adonisjs/core/http";

import type { SettingValueType } from "#models/setting";
import { recordAudit } from "#services/admin_audit_log_service";
import { factorDocumentService } from "#services/factor/document_service";
import SettingsService from "#services/settings_service";
import {
    adminFactorPaymentAttemptListValidator,
    adminFactorResourceSearchValidator,
    adminFactorSettingsValidator,
} from "#validators/admin/factor_validator";

const DEFAULT_SETTINGS = {
    reference_prefix: "K20",
    default_type: "proforma",
    default_tax_percent: 9,
    default_expiry_days: 7,
    round_to_minor: 10,
    default_delivery_channel: "none",
    bank_account_title: "",
    bank_iban: "",
    bank_card_number: "",
    footer_note: "",
};

export default class AdminFactorDashboardController {
    private settings = new SettingsService();

    async summary() {
        return factorDocumentService.summary();
    }

    async reports() {
        return factorDocumentService.reports();
    }

    async paymentAttempts(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorPaymentAttemptListValidator);
        return factorDocumentService.paymentAttempts(payload);
    }

    async resources(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorResourceSearchValidator);
        return factorDocumentService.searchResources(payload.kind, payload.q ?? "", payload.limit ?? 20);
    }

    async settingsShow() {
        const stored = await this.settings.all("factor");
        return { data: { ...DEFAULT_SETTINGS, ...stored } };
    }

    async settingsUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminFactorSettingsValidator);
        const current = await this.settings.all("factor");
        const types: Record<string, SettingValueType> = {
            reference_prefix: "string",
            default_type: "string",
            default_tax_percent: "number",
            default_expiry_days: "number",
            round_to_minor: "number",
            default_delivery_channel: "string",
            bank_account_title: "string",
            bank_iban: "string",
            bank_card_number: "string",
            footer_note: "string",
        };
        let changed = false;
        for (const [key, value] of Object.entries(payload)) {
            if (current[key] === value) continue;
            await this.settings.set("factor", key, value, types[key] ?? "string");
            changed = true;
        }
        if (changed) {
            await recordAudit({
                ctx,
                action: "factor.settings.patch",
                entityKind: "settings",
                entityId: null,
                payload: payload as Record<string, unknown>,
            });
        }
        const stored = await this.settings.all("factor");
        return { data: { ...DEFAULT_SETTINGS, ...stored } };
    }
}
