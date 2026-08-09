import type { FactorType } from "./lifecycle.js";
import SettingsService from "#services/settings_service";
import { nextNumber } from "#services/tenant_numbering_service";

const TYPE_CODE: Record<FactorType, string> = {
    invoice: "INV",
    proforma: "PF",
    credit_note: "CN",
};

/** Allocates a tenant-scoped number and formats the human reference with the configured prefix. */
export async function allocateFactorReference(type: FactorType): Promise<{ number: number; reference: string }> {
    const settings = new SettingsService();
    const configured = await settings.get<string>("factor", "reference_prefix", "K20");
    const prefix =
        configured
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9-]/g, "")
            .slice(0, 16) || "K20";
    const number = await nextNumber(type);
    return { number, reference: `${prefix}-${TYPE_CODE[type]}-${number}` };
}
