import { defineConfig } from "@adonisjs/shield";

import env from "#start/env";

/**
 * Security headers applied to every HTTP response. The defaults are tuned for an API
 * that ships JSON to the storefront + admin — no Edge templates, no cookie session.
 *
 * - **CSRF disabled.** Authentication is bearer-token only; there is no cookie that a
 *   cross-site form could ride. Re-enable if/when a server-rendered surface lands.
 * - **CSP in report-only.** We don't yet have a controlled inline-script inventory, so
 *   blocking would brick the storefront. Report-only writes violations to the server
 *   log (`report-to` header points at `/csp-report`, wire that up before flipping
 *   `reportOnly: false`).
 * - **HSTS off in dev, on in prod-shaped envs.** Local http:// must keep working;
 *   `includeSubDomains` covers the `*.calibra.com` storefront and any tenant-prefix
 *   admin subdomain once they exist.
 * - **X-Frame DENY.** The admin and storefront never run inside an iframe.
 * - **X-Content-Type-Options nosniff.** Cheapest defense against a misconfigured
 *   `text/plain` upload being re-rendered as HTML.
 */
const shieldConfig = defineConfig({
    csrf: { enabled: false } as never,
    xFrame: {
        enabled: true,
        action: "DENY",
    },
    contentTypeSniffing: {
        enabled: true,
    },
    hsts: {
        enabled: env.get("NODE_ENV") === "production",
        maxAge: "180 days",
        includeSubDomains: true,
    },
    csp: {
        enabled: true,
        reportOnly: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            objectSrc: ["'none'"],
        },
    },
});

export default shieldConfig;
