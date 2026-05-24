"use client";

import { Transmit } from "@adonisjs/transmit-client";

/**
 * Lazy, browser-only singleton for the SSE client. One EventSource per browser tab; channel
 * subscriptions (import/export progress) multiplex over it. We initialize on first
 * `getTransmit()` call so the module is safe to import from any client component without
 * touching `window` at SSR time.
 *
 * `baseUrl` is `window.location.origin` because the SSE connection goes through our same-origin
 * proxy at `/__transmit/*` — that proxy reads the `admin_session` cookie server-side and
 * forwards the bearer token to the AdonisJS origin, so the token never reaches client JS. The
 * `beforeSubscribe` / `beforeUnsubscribe` hooks inject the double-submit CSRF header on the
 * subscribe/unsubscribe POSTs (events GET is a SSE handshake and isn't a state-changing call,
 * so it doesn't need CSRF).
 */

let instance: Transmit | null = null;

export function getTransmit(): Transmit {
    if (instance !== null) return instance;
    instance = new Transmit({
        baseUrl: window.location.origin,
        beforeSubscribe: attachCsrf,
        beforeUnsubscribe: attachCsrf,
    });
    return instance;
}

function attachCsrf(request: Request): void {
    const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/);
    if (match !== null) {
        request.headers.set("x-csrf-token", decodeURIComponent(match[1]!));
    }
}
