import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import Customer from "#models/customer";
import CustomerIranProfile from "#models/customer_iran_profile";
import nationalIdService from "#services/national_id_service";
import phoneService from "#services/phone_service";
import CustomerTransformer from "#transformers/customer_transformer";
import UserTransformer from "#transformers/user_transformer";
import { meUpdateValidator } from "#validators/account/me_validator";

export default class MeController {
    /**
     * GET /api/v1/account/me — returns the user, the commerce customer, and Pattern 3 profile
     * extensions for the customer. Foreign customers omit the iran key entirely (absence == "this
     * customer has no Iran-specific identifiers").
     */
    async show(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await user.load("customer", (q) => q.preload("iranProfile"));
        const customer = user.customer;

        if (!customer) {
            throw new Exception("Customer profile missing", { status: 404, code: "E_CUSTOMER_MISSING" });
        }

        return {
            user: new UserTransformer(user).toObject(),
            customer: new CustomerTransformer(customer).withProfileExtensions(),
        };
    }

    /**
     * PUT /api/v1/account/me — updates allowed customer fields, optionally upserts the Iran
     * extension. `email` is never updatable here (re-verification flow is phase 09).
     */
    async update(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const payload = await ctx.request.validateUsing(meUpdateValidator);

        await user.load("customer");
        const customer = user.customer;
        if (!customer) {
            throw new Exception("Customer profile missing", { status: 404, code: "E_CUSTOMER_MISSING" });
        }

        await this.applyIranExtensionChecks(payload.iran_extension);

        const country = (payload.country_default ?? customer.countryDefault).toUpperCase();
        const normalizedPhone = payload.phone === undefined
            ? undefined
            : payload.phone === null
                ? null
                : phoneService.normalize(payload.phone, country);

        await db.transaction(async (trx) => {
            if (payload.locale) {
                user.locale = payload.locale;
                user.useTransaction(trx);
                await user.save();
            }

            customer.useTransaction(trx);
            if (payload.first_name !== undefined) customer.firstName = payload.first_name;
            if (payload.last_name !== undefined) customer.lastName = payload.last_name;
            if (payload.country_default !== undefined) customer.countryDefault = country;
            if (normalizedPhone !== undefined) customer.phone = normalizedPhone;
            await customer.save();

            await this.persistIranExtension(trx, customer, payload.iran_extension);
        });

        await user.load("customer", (q) => q.preload("iranProfile"));
        const fresh = user.customer as Customer;

        return {
            user: new UserTransformer(user).toObject(),
            customer: new CustomerTransformer(fresh).withProfileExtensions(),
        };
    }

    private async applyIranExtensionChecks(extension: NonNullable<unknown> | null | undefined) {
        if (!extension || typeof extension !== "object") return;
        const ext = extension as { national_id?: string | null };
        if (typeof ext.national_id === "string" && !nationalIdService.validate(ext.national_id)) {
            const error = new Exception("Invalid Iranian national_id checksum", {
                status: 422,
                code: "E_VALIDATION_ERROR",
            });
            Object.defineProperty(error, "messages", {
                value: [{ field: "iran_extension.national_id", rule: "checksum", message: "Invalid checksum" }],
            });
            throw error;
        }
    }

    private async persistIranExtension(
        trx: TransactionClientContract,
        customer: Customer,
        extension: ({
            national_id?: string | null;
            corporate_national_id?: string | null;
            economic_code?: string | null;
            legal_company_name_fa?: string | null;
            vat_taxpayer_status?: string | null;
        } | null | undefined),
    ) {
        if (extension === undefined) return;
        const customerIdNum = Number(customer.id);
        if (extension === null) {
            await CustomerIranProfile.query({ client: trx }).where("customer_id", customerIdNum).delete();
            return;
        }
        await CustomerIranProfile.updateOrCreate(
            { customerId: customerIdNum },
            {
                customerId: customerIdNum,
                nationalId: extension.national_id ?? null,
                corporateNationalId: extension.corporate_national_id ?? null,
                economicCode: extension.economic_code ?? null,
                legalCompanyNameFa: extension.legal_company_name_fa ?? null,
                vatTaxpayerStatus: extension.vat_taxpayer_status ?? null,
            },
            { client: trx },
        );
    }
}
