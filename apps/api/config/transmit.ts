import { defineConfig } from "@adonisjs/transmit";

/**
 * Single-process AdonisJS deployment, so no cross-instance transport. When/if we go multi-process,
 * add a Redis transport here (see `@adonisjs/transmit/transports/redis`) so a broadcast on one
 * instance reaches subscribers on every instance.
 *
 * `pingInterval: "30s"` keeps long-lived SSE connections alive past intermediate-proxy idle
 * timeouts (Nginx defaults to 60s) without flooding the wire.
 */
export default defineConfig({
    pingInterval: "30s",
    transport: null,
});
