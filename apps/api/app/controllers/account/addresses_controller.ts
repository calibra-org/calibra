import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import type Customer from "#models/customer";
import CustomerAddress from "#models/customer_address";
import CustomerIranProfile from "#models/customer_iran_profile";
import { throwIfErrors, validateAddressForCountry } from "#services/address_country_validator";
import { rulesFor } from "#services/country_address_rules/index";
import phoneService from "#services/phone_service";
import CustomerAddressTransformer from "#transformers/customer_address_transformer";
import { addressCreateValidator, addressUpdateValidator } from "#validators/account/address_validator";

export default class AddressesController {
    async index(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const addresses = await CustomerAddress.query().where("customer_id", Number(customer.id)).orderBy("id", "asc");
        return {
            data: addresses.map((a) => new CustomerAddressTransformer(a).toObject()),
            meta: { field_metadata: this.fieldMetadataFor(customer.countryDefault) },
        };
    }

    async show(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const address = await this.findOwned(customer, ctx.params.id);
        return {
            data: new CustomerAddressTransformer(address).toObject(),
            meta: { field_metadata: this.fieldMetadataFor(address.country) },
        };
    }

    async store(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const payload = await ctx.request.validateUsing(addressCreateValidator);

        const country = payload.country.toUpperCase();
        const normalizedPhone = payload.phone ? phoneService.normalize(payload.phone, country) : null;

        const errors = await validateAddressForCountry({
            ...payload,
            country,
            phone: normalizedPhone,
        });
        throwIfErrors(errors);

        const customerIdNum = Number(customer.id);
        const address = await db.transaction(async (trx) => {
            if (payload.is_default === true) {
                await this.clearSiblingDefaults(trx, customerIdNum, payload.kind);
            }

            const row = await CustomerAddress.create(
                {
                    customerId: customerIdNum,
                    kind: payload.kind,
                    label: payload.label ?? null,
                    firstName: payload.first_name,
                    lastName: payload.last_name,
                    company: payload.company ?? null,
                    addressLine1: payload.address_line_1,
                    addressLine2: payload.address_line_2 ?? null,
                    city: payload.city,
                    regionId: payload.region_id ?? null,
                    regionText: payload.region_text ?? null,
                    postcode: payload.postcode ?? null,
                    country,
                    phone: normalizedPhone,
                    isDefault: payload.is_default ?? false,
                },
                { client: trx },
            );

            if (country === "IR" && payload.iran_extension) {
                await CustomerIranProfile.updateOrCreate(
                    { customerId: customerIdNum },
                    {
                        customerId: customerIdNum,
                        nationalId: payload.iran_extension.national_id ?? null,
                        corporateNationalId: payload.iran_extension.corporate_national_id ?? null,
                        economicCode: payload.iran_extension.economic_code ?? null,
                        legalCompanyNameFa: payload.iran_extension.legal_company_name_fa ?? null,
                        vatTaxpayerStatus: payload.iran_extension.vat_taxpayer_status ?? null,
                    },
                    { client: trx },
                );
            }

            return row;
        });

        ctx.response.status(201);
        return {
            data: new CustomerAddressTransformer(address).toObject(),
            meta: { field_metadata: this.fieldMetadataFor(country) },
        };
    }

    async update(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const address = await this.findOwned(customer, ctx.params.id);
        const payload = await ctx.request.validateUsing(addressUpdateValidator);

        const country = payload.country.toUpperCase();
        const normalizedPhone =
            payload.phone === undefined
                ? undefined
                : payload.phone === null
                  ? null
                  : phoneService.normalize(payload.phone, country);

        const errors = await validateAddressForCountry({
            first_name: payload.first_name ?? address.firstName,
            last_name: payload.last_name ?? address.lastName,
            address_line_1: payload.address_line_1 ?? address.addressLine1,
            city: payload.city ?? address.city,
            region_id: payload.region_id ?? address.regionId,
            region_text: payload.region_text ?? address.regionText,
            postcode: payload.postcode ?? address.postcode,
            phone: normalizedPhone ?? address.phone,
            country,
            iran_extension: payload.iran_extension,
        });
        throwIfErrors(errors);

        const customerIdNum = Number(customer.id);
        await db.transaction(async (trx) => {
            if (payload.is_default === true && !address.isDefault) {
                await this.clearSiblingDefaults(trx, customerIdNum, address.kind);
            }

            address.useTransaction(trx);
            if (payload.label !== undefined) address.label = payload.label ?? null;
            if (payload.first_name !== undefined) address.firstName = payload.first_name;
            if (payload.last_name !== undefined) address.lastName = payload.last_name;
            if (payload.company !== undefined) address.company = payload.company ?? null;
            if (payload.address_line_1 !== undefined) address.addressLine1 = payload.address_line_1;
            if (payload.address_line_2 !== undefined) address.addressLine2 = payload.address_line_2 ?? null;
            if (payload.city !== undefined) address.city = payload.city;
            if (payload.region_id !== undefined) address.regionId = payload.region_id ?? null;
            if (payload.region_text !== undefined) address.regionText = payload.region_text ?? null;
            if (payload.postcode !== undefined) address.postcode = payload.postcode ?? null;
            address.country = country;
            if (normalizedPhone !== undefined) address.phone = normalizedPhone;
            if (payload.is_default !== undefined) address.isDefault = payload.is_default;
            await address.save();
        });

        return {
            data: new CustomerAddressTransformer(address).toObject(),
            meta: { field_metadata: this.fieldMetadataFor(country) },
        };
    }

    async destroy(ctx: HttpContext) {
        const customer = await this.requireCustomer(ctx);
        const address = await this.findOwned(customer, ctx.params.id);

        if (address.isDefault) {
            const siblingCount = await CustomerAddress.query()
                .where("customer_id", Number(customer.id))
                .where("kind", address.kind)
                .where("is_default", false)
                .count("id as total")
                .first();
            const others = Number((siblingCount?.$extras as { total: string }).total ?? 0);
            if (others === 0) {
                throw new Exception("Cannot delete the only default address of this kind", {
                    status: 422,
                    code: "E_DEFAULT_ADDRESS_REQUIRED",
                });
            }
        }

        await address.delete();
        return ctx.response.noContent();
    }

    private async requireCustomer(ctx: HttpContext): Promise<Customer> {
        const user = ctx.auth.getUserOrFail();
        await user.load("customer");
        const customer = user.customer;
        if (!customer) {
            throw new Exception("Customer profile missing", { status: 404, code: "E_CUSTOMER_MISSING" });
        }
        return customer;
    }

    private async findOwned(customer: Customer, id: unknown): Promise<CustomerAddress> {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Address not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const address = await CustomerAddress.query().where("id", numericId).where("customer_id", Number(customer.id)).first();
        if (!address) {
            throw new Exception("Address not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return address;
    }

    private async clearSiblingDefaults(trx: TransactionClientContract, customerId: number, kind: string): Promise<void> {
        await trx
            .from("customer_addresses")
            .where("customer_id", customerId)
            .where("kind", kind)
            .where("is_default", true)
            .update({ is_default: false });
    }

    /**
     * Pattern 4: convert the rules-layer camelCase keys (`labelKey`, `valuesEndpoint`, `inputMode`)
     * to the snake_case shape the public API contract advertises. The internal type stays
     * idiomatic TypeScript; the boundary translates.
     */
    private fieldMetadataFor(country: string) {
        const source = rulesFor(country).fieldMetadata;
        const out: Record<string, Record<string, unknown>> = {};
        for (const [field, meta] of Object.entries(source)) {
            const entry: Record<string, unknown> = { label_key: meta.labelKey };
            if (meta.pattern !== undefined) entry.pattern = meta.pattern;
            if (meta.inputMode !== undefined) entry.input_mode = meta.inputMode;
            if (meta.valuesEndpoint !== undefined) entry.values_endpoint = meta.valuesEndpoint;
            if (meta.optional !== undefined) entry.optional = meta.optional;
            out[field] = entry;
        }
        return out;
    }
}
