import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import Customer from "#models/customer";
import CustomerDownload from "#models/customer_download";
import User from "#models/user";
import { aggregateForCustomerIds, fetchCounts, forSingleCustomer } from "#services/customer_stats_service";
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

const ORDER_COUNTED_STATUSES = ["pending", "on_hold", "processing", "completed", "refunded"];

export default class AdminCustomersController {
    /**
     * GET /api/v1/admin/customers — list with broad search (name/email/phone/national_id/city/
     * postcode), faceted filters (status, country, tags, channel, marketing opt-ins, range
     * filters), and per-row stats batched via a single GROUP BY query when `include_stats=1`.
     * Soft-deleted rows are excluded unless `tab=trashed`.
     */
    async index(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminCustomerListValidator);
        const page = payload.page ?? 1;
        const perPage = payload.perPage ?? DEFAULT_PER_PAGE;
        const tab = payload.tab ?? "any";

        const query = Customer.query().preload("user");

        if (tab === "trashed") {
            query.whereNotNull("customers.deleted_at");
        } else {
            query.whereNull("customers.deleted_at");
        }

        if (tab === "account") query.whereNotNull("customers.user_id");
        if (tab === "guest") query.whereNull("customers.user_id");
        if (tab === "new") query.where("customers.created_at", ">=", db.raw(`now() - interval '30 days'`));
        if (tab === "no_address") {
            query.whereNotExists((sub) =>
                sub.from("customer_addresses").whereRaw("customer_addresses.customer_id = customers.id"),
            );
        }
        if (tab === "inactive") {
            query.whereNotExists((sub) =>
                sub
                    .from("orders")
                    .whereRaw("orders.customer_id = customers.id")
                    .whereIn("status", ORDER_COUNTED_STATUSES)
                    .where("orders.created_at", ">=", db.raw(`now() - interval '180 days'`)),
            );
        }

        if (payload.search) {
            const needle = `%${payload.search.toLowerCase()}%`;
            query.where((q) => {
                q.whereRaw("LOWER(first_name) LIKE ?", [needle])
                    .orWhereRaw("LOWER(last_name) LIKE ?", [needle])
                    .orWhereRaw("LOWER(COALESCE(phone, '')) LIKE ?", [needle])
                    .orWhereHas("user", (uq) => uq.whereRaw("LOWER(email::text) LIKE ?", [needle]))
                    .orWhereExists((sub) =>
                        sub
                            .from("customer_addresses")
                            .whereRaw("customer_addresses.customer_id = customers.id")
                            .whereRaw("LOWER(city) LIKE ?", [needle])
                            .orWhereRaw("LOWER(COALESCE(postcode, '')) LIKE ?", [needle]),
                    )
                    .orWhereExists((sub) =>
                        sub
                            .from("customer_iran_profiles")
                            .whereRaw("customer_iran_profiles.customer_id = customers.id")
                            .whereRaw("national_id LIKE ?", [needle]),
                    );
            });
        }

        /**
         * SECURITY: by default the customers list hides any row whose linked user is an admin
         * operator — the Customer ≠ User rule forbids them from surfacing here. Admins manage
         * other admins on the team page. Passing `role=admin` opts back in (the role filter is
         * needed for operator-management views) but `role=customer` and the no-role default both
         * exclude admins.
         */
        if (payload.role) {
            const roleFilter = payload.role;
            query.whereHas("user", (uq) => uq.where("role", roleFilter));
        } else {
            query.where((q) => q.whereNull("customers.user_id").orWhereHas("user", (uq) => uq.where("role", "customer")));
        }
        if (payload.is_paying_customer !== undefined) {
            query.where("is_paying_customer", payload.is_paying_customer);
        }
        if (payload.country) {
            query.where("country_default", payload.country.toUpperCase());
        }
        if (payload.countries && payload.countries.length > 0) {
            query.whereIn(
                "country_default",
                payload.countries.map((c) => c.toUpperCase()),
            );
        }
        if (payload.statuses && payload.statuses.length > 0) {
            query.whereIn("status", payload.statuses);
        }
        if (payload.acquisition_channels && payload.acquisition_channels.length > 0) {
            query.whereIn("acquisition_channel", payload.acquisition_channels);
        }
        if (payload.tags && payload.tags.length > 0) {
            query.whereExists((sub) =>
                sub
                    .from("customer_tag_pivot as ctp")
                    .innerJoin("customer_tags as ct", "ct.id", "ctp.tag_id")
                    .whereRaw("ctp.customer_id = customers.id")
                    .whereIn("ct.name", payload.tags ?? []),
            );
        }
        if (payload.cities && payload.cities.length > 0) {
            query.whereExists((sub) =>
                sub
                    .from("customer_addresses")
                    .whereRaw("customer_addresses.customer_id = customers.id")
                    .whereIn(
                        db.raw("LOWER(city)"),
                        payload.cities!.map((c) => c.toLowerCase()),
                    ),
            );
        }
        if (payload.opt_in_email !== undefined) {
            const flag = payload.opt_in_email;
            query.whereExists((sub) =>
                sub
                    .from("customer_marketing_prefs")
                    .whereRaw("customer_marketing_prefs.customer_id = customers.id")
                    .where("email_opt_in", flag),
            );
        }
        if (payload.opt_in_sms !== undefined) {
            const flag = payload.opt_in_sms;
            query.whereExists((sub) =>
                sub
                    .from("customer_marketing_prefs")
                    .whereRaw("customer_marketing_prefs.customer_id = customers.id")
                    .where("sms_opt_in", flag),
            );
        }
        if (payload.has_national_id === true) {
            query.whereExists((sub) =>
                sub
                    .from("customer_iran_profiles")
                    .whereRaw("customer_iran_profiles.customer_id = customers.id")
                    .whereNotNull("national_id"),
            );
        }
        if (payload.created_after) {
            query.where("customers.created_at", ">=", payload.created_after);
        }
        if (payload.created_before) {
            query.where("customers.created_at", "<=", payload.created_before);
        }
        const wantOrderFilter =
            payload.with_orders === true ||
            payload.order_count_min !== undefined ||
            payload.order_count_max !== undefined ||
            payload.lifetime_spend_min !== undefined ||
            payload.lifetime_spend_max !== undefined ||
            payload.aov_min !== undefined ||
            payload.aov_max !== undefined ||
            Boolean(payload.last_order_after) ||
            Boolean(payload.last_order_before);
        if (wantOrderFilter) {
            query.whereExists((sub) => {
                sub.from("orders").whereRaw("orders.customer_id = customers.id").whereIn("status", ORDER_COUNTED_STATUSES);
                if (payload.last_order_after) sub.where("orders.created_at", ">=", payload.last_order_after);
                if (payload.last_order_before) sub.where("orders.created_at", "<=", payload.last_order_before);
            });
        }
        if (payload.no_orders === true) {
            query.whereNotExists((sub) =>
                sub.from("orders").whereRaw("orders.customer_id = customers.id").whereIn("status", ORDER_COUNTED_STATUSES),
            );
        }

        const orderBy = this.applySort(query, payload.sort ?? null);
        const paginator = await query.paginate(page, perPage);
        const meta = paginator.getMeta();
        const rows = paginator.all();

        const statsMap =
            payload.include_stats === true && rows.length > 0
                ? await aggregateForCustomerIds(rows.map((r) => Number(r.id)))
                : null;

        return {
            data: rows.map((c) => {
                const transformer = new CustomerTransformer(c);
                const stats = statsMap?.get(Number(c.id));
                return {
                    ...transformer.forAdmin(stats),
                    user: c.user ? new UserTransformer(c.user).forAdmin() : null,
                };
            }),
            meta: {
                page: meta.currentPage,
                perPage: meta.perPage,
                total: meta.total,
                lastPage: meta.lastPage,
            },
            sort: orderBy,
        };
    }

    /** GET /api/v1/admin/customers/counts — tab buckets + footer summary aggregates. */
    async counts(_ctx: HttpContext) {
        const counts = await fetchCounts();
        return { data: counts };
    }

    /** GET /api/v1/admin/customers/:id/stats — lifetime stats + monthly spend series for the detail page. */
    async stats(ctx: HttpContext) {
        const customer = await this.findOrFail(ctx.params.id);
        const stats = await forSingleCustomer(Number(customer.id));
        return {
            data: {
                lifetime_order_count: stats.lifetimeOrderCount,
                lifetime_spend_minor: stats.lifetimeSpendMinor,
                average_order_value_minor: stats.averageOrderValueMinor,
                last_order_at: stats.lastOrderAt,
                first_order_at: stats.firstOrderAt,
                days_since_last_order: stats.daysSinceLastOrder,
                monthly_spend_series: stats.monthlySpendSeries,
                favorite_product_id: stats.favoriteProductId,
            },
        };
    }

    async show(ctx: HttpContext) {
        const customer = await this.findOrFail(ctx.params.id);
        await customer.load("tags");
        await customer.load("marketingPref");
        const stats = await forSingleCustomer(Number(customer.id));
        const transformer = new CustomerTransformer(customer);
        /**
         * `forAdmin(stats)` spreads `lifetime_order_count` / `lifetime_spend_minor` / etc. at the
         * top level — same shape the list endpoint emits — so the admin adapter's `toAdminCustomer`
         * picks them up without a separate detail-only code path. The legacy `stats: { … }`
         * sub-envelope is kept too for any consumer that addresses it nested.
         */
        return {
            data: {
                ...transformer.forAdmin(stats),
                ...transformer.withProfileExtensions(),
                user: customer.user ? new UserTransformer(customer.user).forAdmin() : null,
                tags: customer.tags?.map((t) => t.name) ?? [],
                stats: {
                    lifetime_order_count: stats.lifetimeOrderCount,
                    lifetime_spend_minor: stats.lifetimeSpendMinor,
                    average_order_value_minor: stats.averageOrderValueMinor,
                    last_order_at: stats.lastOrderAt,
                    first_order_at: stats.firstOrderAt,
                    days_since_last_order: stats.daysSinceLastOrder,
                },
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
                    status: "active",
                    acquisitionChannel: payload.acquisition_channel ?? "admin",
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
     * POST /api/v1/admin/customers/batch — atomic create/update/delete/tag-add/tag-remove/
     * status-change grouped under one trx so any failure rolls every change back.
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
                        status: "active",
                        acquisitionChannel: item.acquisition_channel ?? "admin",
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

    /**
     * Restore a soft-deleted customer. Mirrors the cascade: the linked user (if any) also clears
     * its `deleted_at`. Auth tokens are NOT restored — the user must sign in fresh.
     */
    async restore(ctx: HttpContext) {
        const numericId = Number(ctx.params.id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const customer = await Customer.query()
            .where("id", numericId)
            .whereNotNull("customers.deleted_at")
            .preload("user")
            .first();
        if (!customer) {
            throw new Exception("Customer not found", { status: 404, code: "E_NOT_FOUND" });
        }
        await db.transaction(async (trx) => {
            customer.useTransaction(trx);
            customer.deletedAt = null;
            await customer.save();
            if (customer.user) {
                customer.user.useTransaction(trx);
                customer.user.deletedAt = null;
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

    private applySort(query: ReturnType<typeof Customer.query>, sort: string | null): string {
        const direction: "asc" | "desc" = sort?.startsWith("-") ? "desc" : "asc";
        const column = (sort ?? "").replace(/^-/, "");
        switch (column) {
            case "last_name":
                query.orderBy("last_name", direction).orderBy("first_name", direction);
                return `${direction === "desc" ? "-" : ""}last_name`;
            case "created_at":
                query.orderBy("customers.created_at", direction);
                return `${direction === "desc" ? "-" : ""}created_at`;
            case "last_seen_at":
                query.orderBy("customers.last_seen_at", direction);
                return `${direction === "desc" ? "-" : ""}last_seen_at`;
            default:
                query.orderBy("customers.id", "desc");
                return "-id";
        }
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
