import limiter from "@adonisjs/limiter/services/main";

/**
 * Named limiters applied to routes via `.use(throttle)`. Each one returns an `HttpLimiter`
 * the router can mount; the store comes from `LIMITER_STORE` (redis in dev/prod, memory in
 * tests).
 *
 * Counters are bucketed per logical action so a payment retry doesn't burn the login budget;
 * `key()` decides the *subject* (IP, email, customer id, admin id, …). When more than one
 * dimension matters (login should rate-limit per-IP **and** per-email so a botnet sweeping
 * one email gets blocked), compose with `.allowRequests().every().limit().key()` and route
 * the request through both with a single composite call.
 */

/** 5/min per IP. Tight because brute-force enumeration is the canonical attack on these. */
export const authLimiter = limiter.define("auth", (ctx) => {
    return limiter.allowRequests(5).every("1 minute").usingKey(`ip:${ctx.request.ip()}`);
});

/**
 * Login is the only endpoint where per-email **and** per-IP matter: a single attacker
 * trying lots of emails from one IP is the IP rule's job; a slow distributed sweep against
 * one account is the email rule's job. The route composes both — see `auth_login_routes.ts`.
 */
export const loginEmailLimiter = limiter.define("login_email", (ctx) => {
    const email = String(ctx.request.input("email", "")).toLowerCase();
    return limiter.allowRequests(5).every("1 minute").usingKey(`email:${email}`);
});

/** 30/min per customer for payment submission + verification. */
export const paymentLimiter = limiter.define("payments", (ctx) => {
    const userId = ctx.auth.user?.id ?? "anon";
    return limiter.allowRequests(30).every("1 minute").usingKey(`user:${userId}`);
});

/**
 * 60/min per IP on inbound PSP callbacks. We can't pin the limiter to the user (callbacks
 * are unauthenticated), but the IP rule still cuts off a misconfigured retry storm before
 * it amplifies into the queue.
 */
export const webhookLimiter = limiter.define("webhooks", (ctx) => {
    return limiter.allowRequests(60).every("1 minute").usingKey(`ip:${ctx.request.ip()}`);
});

/** 120/min per admin user on admin mutation routes. Lets one operator do bulk updates without rugpulling them, but a runaway script gets capped. */
export const adminWriteLimiter = limiter.define("admin_writes", (ctx) => {
    const userId = ctx.auth.user?.id ?? ctx.request.ip();
    return limiter.allowRequests(120).every("1 minute").usingKey(`admin:${userId}`);
});
