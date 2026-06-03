import logger from "@adonisjs/core/services/logger";

import SettingsService from "#services/settings_service";
import { maybeTenantId } from "#services/tenant_context";
import env from "#start/env";

/**
 * SMS delivery abstraction for phone-OTP. Phase 1 ships only the `log` driver (writes the code to
 * Pino — dev/test, no external dependency). The `provider` slot is where an Iranian gateway
 * (Kavenegar / SMS.ir / Ghasedak) gets wired over `fetch` once approved — implementing it requires
 * no new package.
 *
 * **Sender identity is per-tenant.** The `from` is resolved from the tenant's `sms` settings group
 * (`from_number` / `from_name`, seeded empty by provisioning) and falls back to the `SMS_FROM` env.
 * Callers pass the resolved `from` to {@link SmsSender.send}; {@link resolveSmsFrom} does the lookup.
 */
export interface SmsSender {
    send(to: string, message: string, from?: string | null): Promise<void>;
}

/**
 * Resolve the active tenant's SMS sender id: the `sms.from_number` setting if non-empty, else the
 * `SMS_FROM` env, else `null`. Runs in a tenant context (OTP send) so `SettingsService.all("sms")`
 * is tenant-scoped; off-context it falls straight back to the env.
 */
export async function resolveSmsFrom(): Promise<string | null> {
    const envFrom = env.get("SMS_FROM") ?? null;
    if (maybeTenantId() === null) {
        return envFrom;
    }
    const sms = await new SettingsService().all("sms");
    const fromNumber = typeof sms.from_number === "string" ? sms.from_number.trim() : "";
    return fromNumber.length > 0 ? fromNumber : envFrom;
}

class LogSmsSender implements SmsSender {
    async send(to: string, message: string, from?: string | null): Promise<void> {
        logger.info(
            { channel: "sms", driver: "log", to, message, from: from ?? env.get("SMS_FROM") ?? null },
            "SMS (log driver)",
        );
    }
}

class ProviderSmsSender implements SmsSender {
    async send(_to: string, _message: string, _from?: string | null): Promise<void> {
        throw new Error(
            "SMS provider driver is not configured. Set SMS_DRIVER=log, or implement the Iranian gateway over fetch once approved.",
        );
    }
}

let instance: SmsSender | null = null;

/** Returns the process-wide SMS sender selected by `SMS_DRIVER` (defaults to `log`). */
export function smsSender(): SmsSender {
    if (!instance) {
        instance = env.get("SMS_DRIVER") === "provider" ? new ProviderSmsSender() : new LogSmsSender();
    }
    return instance;
}
