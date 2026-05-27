import { BaseTransformer } from "@adonisjs/core/transformers";

import type PaymentGateway from "#models/payment_gateway";

/** Setting keys treated as secret. Always masked on GET, accepted as-is on PATCH. */
const SENSITIVE_KEYS = new Set([
    "merchant_id",
    "api_key",
    "secret",
    "secret_key",
    "client_secret",
    "private_key",
    "password",
    "token",
]);
const MASK = "***";

/**
 * Owns `/api/v1/admin/payment-gateways/*` response shape. The default `forList` masks every
 * sensitive setting key so a leaked admin GET response never spills credentials; PATCH accepts
 * the unmasked value when admins want to rotate.
 */
export default class PaymentGatewayTransformer extends BaseTransformer<PaymentGateway> {
    toObject() {
        return this.forAdmin();
    }

    forStorefront() {
        const gateway = this.resource;
        return {
            id: Number(gateway.id),
            code: gateway.code,
            enabled: gateway.enabled,
            ordering: gateway.ordering,
            supports: (gateway.supports as Record<string, unknown>) ?? {},
            implementation_status: readImplementationStatus(gateway),
        };
    }

    forAdmin() {
        const gateway = this.resource;
        return {
            ...this.forStorefront(),
            settings: this.maskedSettings(gateway),
            created_at: gateway.createdAt?.toISO() ?? null,
            updated_at: gateway.updatedAt?.toISO() ?? null,
        };
    }

    private maskedSettings(gateway: PaymentGateway): Record<string, unknown> {
        const raw = (gateway.settings as Record<string, unknown>) ?? {};
        const masked: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (SENSITIVE_KEYS.has(key)) {
                masked[key] = typeof value === "string" && value.length > 0 ? MASK : "";
            } else {
                masked[key] = value;
            }
        }
        return masked;
    }
}

export { SENSITIVE_KEYS };

/**
 * Reads the `attributes.implementation_status` flag — `"stub"` means the registry resolves the
 * code but every lifecycle method throws `E_GATEWAY_NOT_IMPLEMENTED`; `"live"` means the
 * adapter is a real integration (cod, bank_transfer today). Unknown values fall back to
 * `"stub"` defensively — a misconfigured attribute should never silently let an unverified PSP
 * pose as live.
 */
export function readImplementationStatus(gateway: PaymentGateway): "stub" | "live" {
    const attrs = (gateway.attributes as Record<string, unknown> | null) ?? {};
    return attrs.implementation_status === "live" ? "live" : "stub";
}
