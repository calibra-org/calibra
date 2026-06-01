/**
 * HTTP kernel. Registers server-level middleware (runs for every request, even unmatched routes)
 * and router-level middleware (runs only for matched routes), plus the named middleware map other
 * phases mount onto their routes.
 */

import router from "@adonisjs/core/services/router";
import server from "@adonisjs/core/services/server";

server.errorHandler(() => import("#exceptions/handler"));

server.use([
    () => import("#middleware/request_id_middleware"),
    () => import("#middleware/container_bindings_middleware"),
    () => import("#middleware/force_json_response_middleware"),
    () => import("#middleware/detect_user_locale_middleware"),
    /**
     * Tenant context resolves the request's tenant (X-Calibra-Tenant header → Host) and opens a
     * transaction with the `app.current_tenant` GUC set, so RLS isolates every downstream query.
     * Mounted before metrics so Phase 2 can label metrics by tenant.
     */
    () => import("#middleware/tenant_context_middleware"),
    /**
     * Metrics middleware sits at the server level (before the router) so it observes
     * every request, including unmatched 404s and authentication 401s. The `/metrics`
     * scrape endpoint reads from the same in-memory store the middleware writes to.
     */
    () => import("#middleware/metrics_middleware"),
    () => import("@adonisjs/cors/cors_middleware"),
]);

router.use([
    () => import("@adonisjs/core/bodyparser_middleware"),
    () => import("@adonisjs/auth/initialize_auth_middleware"),
    () => import("#middleware/initialize_bouncer_middleware"),
    () => import("@adonisjs/shield/shield_middleware"),
]);

export const middleware = router.named({
    auth: () => import("#middleware/auth_middleware"),
    platformAuth: () => import("#middleware/platform_auth_middleware"),
    admin: () => import("#middleware/admin_middleware"),
    cart: () => import("#middleware/cart_middleware"),
    idempotency: () => import("#middleware/idempotency_middleware"),
    webhookSignature: () => import("#middleware/webhook_signature_middleware"),
});
