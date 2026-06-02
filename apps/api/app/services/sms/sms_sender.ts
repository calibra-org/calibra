import logger from "@adonisjs/core/services/logger";

import env from "#start/env";

/**
 * SMS delivery abstraction for phone-OTP. Phase 1 ships only the `log` driver (writes the code to
 * Pino — dev/test, no external dependency). The `provider` slot is where an Iranian gateway
 * (Kavenegar / SMS.ir / Ghasedak) gets wired over `fetch` once approved — implementing it requires
 * no new package. Per-tenant sender identity will read from the tenant's `sms` settings group in
 * Phase 2; until then `SMS_FROM` is the config-level fallback.
 */
export interface SmsSender {
    send(to: string, message: string): Promise<void>;
}

class LogSmsSender implements SmsSender {
    async send(to: string, message: string): Promise<void> {
        logger.info({ channel: "sms", driver: "log", to, message, from: env.get("SMS_FROM") ?? null }, "SMS (log driver)");
    }
}

class ProviderSmsSender implements SmsSender {
    async send(_to: string, _message: string): Promise<void> {
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
