import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import CustomerDownload from "#models/customer_download";
import User from "#models/user";
import phoneService from "#services/phone_service";
import CustomerDownloadTransformer from "#transformers/customer_download_transformer";
import CustomerTransformer from "#transformers/customer_transformer";
import UserTransformer from "#transformers/user_transformer";
import {
    adminCustomerBatchValidator,
    adminCustomerCreateValidator,
    adminCustomerListValidator,
    adminCustomerUpdateValidator,
} from "#validators/admin/customer_validator";

const DEFAULT_PER_PAGE = 20;

export default class AdminCustomersController {
    /**
     * GET /api/v1/admin/customers — list with search (matches first/last name + email),
     * `role` (joins users), `is_paying_customer`, and `country`. Soft-deleted rows are excluded.
     */
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerListValidator);
        const page = payload.page ?? 1;
        const perPage = payload.perPage ?? DEFAULT_PER_PAGE;

        const query = Customer.query().whereNull("customers.deleted_at").preload("user");

        if (payload.search) {
            const needle = `%${payload.search.toLowerCase()}%`;
            query.where((q) => {
                q.whereRaw("LOWER(first_name) LIKE ?", [needle])
                    .orWhereRaw("LOWER(last_name) LIKE ?", [needle])
                    .orWhereHas("user", (uq) => uq.whereRaw("LOWER(email::text) LIKE ?", [needle]));
            });
        }
        if (payload.role) {
            const roleFilter = payload.role;
            query.whereHas("user", (uq) => uq.where("role", roleFilter));
        }
        if (payload.is_paying_customer !== undefined) {
            query.where("is_paying_customer", payload.is_paying_customer);
        }
        if (payload.country) {
            query.where("country_default", payload.country.toUpperCase());
        }

        const paginator = await query.orderBy("customers.id", "desc").paginate(page, perPage);
        const meta = paginator.getMeta();

        return {
            data: paginator.all().map((c) => ({
                ...new CustomerTransformer(c).toObject(),
                user: c.user ? new UserTransformer(c.user).forAdmin() : null,
            })),
            meta: {
                page: meta.currentPage,
                perPage: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
        };
    }

    async show(ctx: HttpContext) {
        const customer = await this.findOrFail(ctx.params.id);
        return {
            data: {
                ...new CustomerTransformer(customer).withProfileExtensions(),
                user: customer.user ? new UserTransformer(customer.user).forAdmin() : null,
            },
        };
    }

    /**
     * POST /api/v1/admin/customers — creates a guest customer (no email/password) or a full
     * account customer (email + password). The two paths share a transaction so a half-created
     * customer (user without customer or vice versa) is never possible.
     */
    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerCreateValidator);

        const wantsUser = Boolean(payload.email || payload.password);
        if (wantsUser && (!payload.email || !payload.password)) {
            throw new Exception("email and password must be provided together", {
                status: 422,
                code: "E_VALIDATION_ERROR",
            });
        }

        const country = (payload.country_default ?? "IR").toUpperCase();
        const normalizedPhone = payload.phone ? phoneService.normalize(payload.phone, country) : null;

        const customer = await db.transaction(async (trx) => {
            let userId: bigint | number | null = null;
            if (wantsUser && payload.email && payload.password) {
                const existing = await User.findBy("email", payload.email, { client: trx });
                if (existing) {
                    throw new Exception("Email already in use", { status: 422, code: "E_VALIDATION_ERROR" });
                }
                const created = await User.create(
                    {
                        email: payload.email,
                        passwordHash: payload.password,
                        locale: ctx.i18n.locale,
                        role: payload.role ?? "customer",
                    },
                    { client: trx },
                );
                userId = created.id;
            }

            return await Customer.create(
                {
                    userId,
                    firstName: payload.first_name,
                    lastName: payload.last_name,
                    phone: normalizedPhone,
                    countryDefault: country,
                    isPayingCustomer: false,
                },
                { client: trx },
            );
        });

        ctx.response.status(201);
        await customer.load("user");
        return {
            data: {
                ...new CustomerTransformer(customer).toObject(),
                user: customer.user ? new UserTransformer(customer.user).forAdmin() : null,
            },
        };
    }

    async update(ctx: HttpContext) {
        const customer = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminCustomerUpdateValidator);

        const country = (payload.country_default ?? customer.countryDefault).toUpperCase();
        const normalizedPhone =
            payload.phone === undefined
                ? undefined
                : payload.phone === null
                  ? null
                  : phoneService.normalize(payload.phone, country);

        await db.transaction(async (trx) => {
            customer.useTransaction(trx);
            if (payload.first_name !== undefined) customer.firstName = payload.first_name;
            if (payload.last_name !== undefined) customer.lastName = payload.last_name;
            if (payload.country_default !== undefined) customer.countryDefault = country;
            if (normalizedPhone !== undefined) customer.phone = normalizedPhone;
            await customer.save();

            if (customer.user && (payload.role || payload.locale)) {
                customer.user.useTransaction(trx);
                if (payload.role) customer.user.role = payload.role;
                if (payload.locale) customer.user.locale = payload.locale;
                await customer.user.save();
            }
        });

        return {
            data: {
                ...new CustomerTransformer(customer).toObject(),
                user: customer.user ? new UserTransformer(customer.user).forAdmin() : null,
            },
        };
    }

    /**
     * Soft-deletes both the customer and the linked user (if any). Phase 05 and later filter the
     * `deleted_at IS NULL` rows at query time, so a soft-deleted customer disappears from listings
     * without losing historical order references.
     */
    async destroy(ctx: HttpContext) {
        const customer = await this.findOrFail(ctx.params.id);
        const now = DateTime.utc();
        await db.transaction(async (trx) => {
            customer.useTransaction(trx);
            customer.deletedAt = now;
            await customer.save();

            if (customer.user) {
                customer.user.useTransaction(trx);
                customer.user.deletedAt = now;
                await customer.user.save();
                await trx.from("auth_access_tokens").where("tokenable_id", Number(customer.user.id)).delete();
            }
        });
        return ctx.response.noContent();
    }

    async downloads(ctx: HttpContext) {
        const customer = await this.findOrFail(ctx.params.id);
        const rows = await CustomerDownload.query().where("customer_id", Number(customer.id)).orderBy("granted_at", "desc");
        return { data: rows.map((r) => new CustomerDownloadTransformer(r).toObject()) };
    }

    /**
     * POST /api/v1/admin/customers/batch — atomic create/update/delete grouped under one trx so
     * any failure rolls every change back.
     */
    async batch(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerBatchValidator);

        const result = await db.transaction(async (trx) => {
            const created: Customer[] = [];
            const updated: Customer[] = [];
            const deletedIds: Array<bigint | number> = [];

            for (const item of payload.create ?? []) {
                const wantsUser = Boolean(item.email || item.password);
                if (wantsUser && (!item.email || !item.password)) {
                    throw new Exception("email and password must be provided together", {
                        status: 422,
                        code: "E_VALIDATION_ERROR",
                    });
                }
                const country = (item.country_default ?? "IR").toUpperCase();
                const normalizedPhone = item.phone ? phoneService.normalize(item.phone, country) : null;
                let userId: bigint | number | null = null;
                if (wantsUser && item.email && item.password) {
                    const existing = await User.findBy("email", item.email, { client: trx });
                    if (existing) {
                        throw new Exception(`email ${item.email} already in use`, {
                            status: 422,
                            code: "E_VALIDATION_ERROR",
                        });
                    }
                    const user = await User.create(
                        {
                            email: item.email,
                            passwordHash: item.password,
                            locale: ctx.i18n.locale,
                            role: item.role ?? "customer",
                        },
                        { client: trx },
                    );
                    userId = user.id;
                }
                const customer = await Customer.create(
                    {
                        userId,
                        firstName: item.first_name,
                        lastName: item.last_name,
                        phone: normalizedPhone,
                        countryDefault: country,
                        isPayingCustomer: false,
                    },
                    { client: trx },
                );
                created.push(customer);
            }

            for (const patch of payload.update ?? []) {
                const customer = await Customer.find(patch.id, { client: trx });
                if (!customer) {
                    throw new Exception(`Customer ${patch.id} not found`, {
                        status: 404,
                        code: "E_NOT_FOUND",
                    });
                }
                const country = (patch.country_default ?? customer.countryDefault).toUpperCase();
                if (patch.first_name !== undefined) customer.firstName = patch.first_name;
                if (patch.last_name !== undefined) customer.lastName = patch.last_name;
                if (patch.country_default !== undefined) customer.countryDefault = country;
                if (patch.phone !== undefined) {
                    customer.phone = patch.phone === null ? null : phoneService.normalize(patch.phone, country);
                }
                await customer.save();
                updated.push(customer);
            }

            const now = DateTime.utc();
            for (const id of payload.delete ?? []) {
                const customer = await Customer.query({ client: trx }).where("id", id).preload("user").first();
                if (!customer) {
                    throw new Exception(`Customer ${id} not found`, { status: 404, code: "E_NOT_FOUND" });
                }
                customer.deletedAt = now;
                await customer.save();
                if (customer.user) {
                    customer.user.deletedAt = now;
                    await customer.user.save();
                    await trx.from("auth_access_tokens").where("tokenable_id", Number(customer.user.id)).delete();
                }
                deletedIds.push(id);
            }

            return { created, updated, deletedIds };
        });

        return {
            data: {
                created: result.created.map((c) => new CustomerTransformer(c).toObject()),
                updated: result.updated.map((c) => new CustomerTransformer(c).toObject()),
                deleted: result.deletedIds,
            },
        };
    }

    private async findOrFail(id: unknown): Promise<Customer> {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const customer = await Customer.query()
            .where("id", numericId)
            .whereNull("customers.deleted_at")
            .preload("user")
            .preload("iranProfile")
            .first();
        if (!customer) {
            throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return customer;
    }
}
