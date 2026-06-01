import { compose } from "@adonisjs/core/helpers";

import { OtpCodeSchema } from "#database/schema";
import { TenantScoped } from "#models/concerns/tenant_scoped";

/**
 * One-time code for phone/email OTP (per-tenant, RLS-guarded — the {@link TenantScoped} mixin stamps
 * `tenant_id` and rides the request transaction). Only `codeHash` is persisted; the plaintext code
 * exists only in the dispatched SMS/email.
 */
export default class OtpCode extends compose(OtpCodeSchema, TenantScoped) {
    static table = "otp_codes";
}
