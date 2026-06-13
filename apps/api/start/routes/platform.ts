import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { authLimiter } from "#start/limiter";

/**
 * Control-plane (platform) routes. Global — `tenant_context_middleware` skips `/api/v1/platform/*`,
 * so these run without a tenant context and read across the whole fleet on the `postgres_admin`
 * (BYPASSRLS) connection (RULE A). Auth uses the dedicated `platform` guard (separate
 * `platform_access_tokens` table); a shopper/shop token can never authenticate here.
 */
const PlatformLoginController = () => import("#controllers/platform/platform_login_controller");
const OverviewController = () => import("#controllers/platform/overview_controller");
const TenantsController = () => import("#controllers/platform/tenants_controller");
const MetricsController = () => import("#controllers/platform/metrics_controller");
const DomainsController = () => import("#controllers/platform/domains_controller");
const PlansController = () => import("#controllers/platform/plans_controller");
const ImpersonationController = () => import("#controllers/platform/impersonation_controller");
const PlatformTicketsController = () => import("#controllers/platform/tickets_controller");

router
    .group(() => {
        router.post("/auth/login", [PlatformLoginController, "handle"]).as("platform.auth.login").use(authLimiter);

        router
            .group(() => {
                router.get("/overview", [OverviewController, "show"]).as("platform.overview");

                router.get("/tenants", [TenantsController, "index"]).as("platform.tenants.index");
                router.post("/tenants", [TenantsController, "store"]).as("platform.tenants.store");
                router.get("/tenants/:id", [TenantsController, "show"]).as("platform.tenants.show");
                router.patch("/tenants/:id", [TenantsController, "update"]).as("platform.tenants.update");
                router.post("/tenants/:id/impersonate", [ImpersonationController, "start"]).as("platform.tenants.impersonate");
                router.get("/tenants/:id/metrics", [MetricsController, "show"]).as("platform.tenants.metrics");

                router.post("/tenants/:id/domains", [DomainsController, "store"]).as("platform.tenants.domains.store");
                router
                    .delete("/tenants/:id/domains/:domainId", [DomainsController, "destroy"])
                    .as("platform.tenants.domains.destroy");
                router
                    .post("/tenants/:id/domains/:domainId/recheck", [DomainsController, "recheck"])
                    .as("platform.tenants.domains.recheck");

                router.get("/plans", [PlansController, "index"]).as("platform.plans.index");
                router.post("/plans", [PlansController, "store"]).as("platform.plans.store");
                router.patch("/plans/:id", [PlansController, "update"]).as("platform.plans.update");

                router.get("/tickets", [PlatformTicketsController, "index"]).as("platform.tickets.index");
                router.get("/tickets/:id", [PlatformTicketsController, "show"]).as("platform.tickets.show");
                router
                    .post("/tickets/:id/messages", [PlatformTicketsController, "storeMessage"])
                    .as("platform.tickets.messages.store");
                router.patch("/tickets/:id", [PlatformTicketsController, "update"]).as("platform.tickets.update");
            })
            .use(middleware.platformAuth());
    })
    .prefix("/api/v1/platform");
