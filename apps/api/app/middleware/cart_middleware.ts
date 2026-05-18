import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";
import { DateTime } from "luxon";

import Cart from "#models/cart";
import Customer from "#models/customer";

/**
 * Lifespan of the anonymous `cart_token` cookie. 30 days matches the default cart-abandonment
 * window (see `settings.inventory.cart_abandonment_days`) so the cookie expires roughly when the
 * row is purged — keeping the two timelines aligned avoids the "cookie points at a deleted cart"
 * dead-pointer state.
 */
const CART_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CART_COOKIE_NAME = "cart_token";

/**
 * Resolve (or lazily create) the cart for this request and attach it to the HTTP context. Mounted
 * on `/api/v1/cart/*` only — the rest of the API doesn't need a cart row materialized per request.
 *
 * Priority order (ADR D8, phase-04 doc §"Cart resolution"):
 * 1. Authenticated request → load by `customer_id`, creating the row if missing.
 *    a. If an anonymous `cart_token` cookie is also present, the anon cart is merged into the
 *       customer cart via {@link Cart.assignCustomer} and the loser is deleted.
 * 2. Anonymous request with a `cart_token` cookie → load by token.
 * 3. Anonymous request with no cookie → create a fresh anon cart and set the cookie.
 *
 * Every cart-affecting request also bumps `last_activity_at`, `ip_address`, and `user_agent` so
 * the abandonment job (`cart:purge`) has accurate freshness data.
 */
export default class CartMiddleware {
    async handle(ctx: HttpContext, next: NextFn) {
        await ctx.auth.check();
        const user = ctx.auth.user ?? null;
        const cookieToken = ctx.request.cookie(CART_COOKIE_NAME) ?? null;

        let cart: Cart;
        if (user) {
            cart = await this.resolveForUser(user.id, cookieToken);
            /**
             * On every authenticated cart request we know the user; clear any stale anon cookie so
             * the next anonymous visit (after logout) gets a fresh row rather than reattaching to
             * the now-customer-owned cart it once pointed at.
             */
            if (cookieToken && cart.customerId !== null) {
                ctx.response.clearCookie(CART_COOKIE_NAME);
            }
        } else if (cookieToken) {
            cart = await this.resolveForCookie(ctx, cookieToken);
        } else {
            cart = await this.createAnonymous();
            this.writeCookie(ctx, cart.token);
        }

        cart.lastActivityAt = DateTime.utc();
        const ip = ctx.request.ip();
        const userAgent = ctx.request.header("user-agent");
        if (ip) cart.ipAddress = ip;
        if (userAgent !== undefined) cart.userAgent = userAgent;
        await cart.save();

        ctx.cart = cart;
        return next();
    }

    private async resolveForUser(userId: bigint | number, cookieToken: string | null): Promise<Cart> {
        const customer = await Customer.query().where("user_id", Number(userId)).first();
        if (!customer) {
            /**
             * Phase 03 guarantees every user has a 1:1 customer row after registration. Defensive
             * `createCustomer` is intentionally avoided here — surface the bug rather than mask it.
             */
            throw new Error("Authenticated user has no linked customer; create a customer row before adding to cart.");
        }
        const customerId = Number(customer.id);

        let anonCart: Cart | null = null;
        if (cookieToken) {
            anonCart = await Cart.query().where("token", cookieToken).whereNull("customer_id").first();
        }

        if (anonCart) {
            return anonCart.assignCustomer(customerId);
        }

        const existing = await Cart.query().where("customer_id", customerId).first();
        if (existing) return existing;

        return Cart.create({
            customerId,
            currency: "IRR",
        });
    }

    private async resolveForCookie(ctx: HttpContext, cookieToken: string): Promise<Cart> {
        const found = await Cart.query().where("token", cookieToken).first();
        if (found) return found;
        /**
         * The cookie pointed at a cart that no longer exists (e.g. purged by `cart:purge`). Issue
         * a fresh row and reset the cookie so the client never asks for the stale id again.
         */
        const fresh = await this.createAnonymous();
        this.writeCookie(ctx, fresh.token);
        return fresh;
    }

    private async createAnonymous(): Promise<Cart> {
        return Cart.create({
            customerId: null,
            currency: "IRR",
        });
    }

    private writeCookie(ctx: HttpContext, token: string): void {
        /**
         * `httpOnly` so XSS cannot read the token; `sameSite: 'lax'` so the cart survives top-level
         * navigation from email/SMS links while still rejecting cross-site POSTs. `secure` follows
         * the request scheme — dev runs http://localhost, prod runs https://.
         */
        ctx.response.cookie(CART_COOKIE_NAME, token, {
            httpOnly: true,
            sameSite: "lax",
            secure: ctx.request.secure(),
            maxAge: CART_COOKIE_MAX_AGE_SECONDS,
            path: "/",
        });
    }
}

declare module "@adonisjs/core/http" {
    interface HttpContext {
        cart: Cart;
    }
}
