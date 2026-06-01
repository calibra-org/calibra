import { randomInt } from "node:crypto";
import hash from "@adonisjs/core/services/hash";
import logger from "@adonisjs/core/services/logger";
import { DateTime } from "luxon";

import OtpCode from "#models/otp_code";
import { smsSender } from "#services/sms/sms_sender";

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export type OtpChannel = "sms" | "email";
export type OtpPurpose = "login" | "verify";

/** 6-digit numeric code, cryptographically random, zero-padded. */
function generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Phone/email OTP. All operations are tenant-scoped — `OtpCode` carries `tenant_id` (stamped by the
 * TenantScoped mixin) and rides the request transaction, so codes from tenant A are invisible to
 * tenant B. Only the hash of the code is stored; the plaintext exists only in the dispatched message.
 */
export const otpService = {
    /**
     * Issue an OTP for `identifier` on `channel`. Always succeeds from the caller's perspective (the
     * controller returns 200 regardless of whether the identifier maps to a user, to avoid
     * enumeration). Returns the TTL so the client can show a countdown.
     */
    async request(identifier: string, channel: OtpChannel, purpose: OtpPurpose = "login"): Promise<{ expiresIn: number }> {
        const code = generateCode();
        const codeHash = await hash.make(code);

        const otp = new OtpCode();
        otp.identifier = identifier;
        otp.channel = channel;
        otp.purpose = purpose;
        otp.codeHash = codeHash;
        otp.expiresAt = DateTime.utc().plus({ minutes: OTP_TTL_MINUTES });
        otp.attempts = 0;
        await otp.save();

        const message = `Calibra code: ${code}`;
        if (channel === "sms") {
            await smsSender().send(identifier, message);
        } else {
            logger.info({ channel: "email", identifier, message }, "OTP (email log driver)");
        }

        return { expiresIn: OTP_TTL_MINUTES * 60 };
    },

    /**
     * Verify `code` against the most recent unconsumed, unexpired OTP for `identifier`. Consumes it
     * on success. Returns `false` (without throwing) on any failure so the controller can return a
     * uniform invalid-code response.
     */
    async verify(identifier: string, code: string, purpose: OtpPurpose = "login"): Promise<boolean> {
        const otp = await OtpCode.query()
            .where("identifier", identifier)
            .where("purpose", purpose)
            .whereNull("consumed_at")
            .where("expires_at", ">", DateTime.utc().toSQL()!)
            .orderBy("id", "desc")
            .first();

        if (!otp) {
            return false;
        }

        otp.attempts += 1;
        if (otp.attempts > MAX_ATTEMPTS) {
            await otp.save();
            return false;
        }

        const valid = await hash.verify(otp.codeHash, code);
        if (!valid) {
            await otp.save();
            return false;
        }

        otp.consumedAt = DateTime.utc();
        await otp.save();
        return true;
    },
};
