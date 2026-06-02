import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

import Customer from "#models/customer";
import User from "#models/user";
import phoneService from "#services/phone_service";
import CustomerTransformer from "#transformers/customer_transformer";
import UserTransformer from "#transformers/user_transformer";
import { registerValidator } from "#validators/auth/register_validator";

export default class RegisterController {
    /**
     * Creates `users` + `customers` atomically. The user row is the auth identity (just an email +
     * hashed password); the customer row holds the commerce profile fields. Returns the newly-minted
     * access token so the client can move straight into the storefront.
     *
     * Both rows are written on the committed `postgres_admin` connection (not the per-request
     * transaction): the access-token provider runs on its own connection and its FK to `users(id)`
     * cannot see a user still pending in the uncommitted request transaction. The model `beforeSave`
     * still hashes the password, and the tenant-stamp hook fills `tenant_id` from the request context.
     */
    async handle(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(registerValidator);

        const country = (payload.country_default ?? "IR").toUpperCase();
        const normalizedPhone = payload.phone ? phoneService.normalize(payload.phone, country) : null;

        const { user, customer } = await db.connection("postgres_admin").transaction(async (trx) => {
            const createdUser = await User.create(
                {
                    email: payload.email,
                    passwordHash: payload.password,
                    locale: ctx.i18n.locale,
                    role: "customer",
                },
                { client: trx },
            );

            const createdCustomer = await Customer.create(
                {
                    userId: createdUser.id,
                    firstName: payload.first_name,
                    lastName: payload.last_name,
                    phone: normalizedPhone,
                    countryDefault: country,
                    isPayingCustomer: false,
                    status: "active",
                    acquisitionChannel: "web",
                },
                { client: trx },
            );

            return { user: createdUser, customer: createdCustomer };
        });

        const token = await User.accessTokens.create(user);

        ctx.response.status(201);
        return {
            user: new UserTransformer(user).toObject(),
            customer: new CustomerTransformer(customer).toObject(),
            token: {
                type: "bearer",
                value: token.value!.release(),
                expires_at: token.expiresAt?.toISOString() ?? null,
            },
        };
    }
}
