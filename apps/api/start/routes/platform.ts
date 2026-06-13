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
const PlatformLogoutController = () => import("#controllers/platform/platform_logout_controller");
const OverviewController = () => import("#controllers/platform/overview_controller");
const TenantsController = () => import("#controllers/platform/tenants_controller");
const MetricsController = () => import("#controllers/platform/metrics_controller");
const DomainsController = () => import("#controllers/platform/domains_controller");
const PlansController = () => import("#controllers/platform/plans_controller");
const ImpersonationController = () => import("#controllers/platform/impersonation_controller");
const OperatorsController = () => import("#controllers/platform/operators_controller");
const PlatformAuditController = () => import("#controllers/platform/audit_controller");

router
    .group(() => {
        router.post("/auth/login", [PlatformLoginController, "handle"]).as("platform.auth.login").use(authLimiter);

        router
            .group(() => {
                router.post("/auth/logout", [PlatformLogoutController, "handle"]).as("platform.auth.logout");

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

                router.get("/tenants/:id/operators", [OperatorsController, "index"]).as("platform.operators.index");
                router.post("/tenants/:id/operators", [OperatorsController, "store"]).as("platform.operators.store");
                router
                    .patch("/tenants/:id/operators/:userId/disable", [OperatorsController, "disable"])
                    .as("platform.operators.disable");
                router
                    .patch("/tenants/:id/operators/:userId/enable", [OperatorsController, "enable"])
                    .as("platform.operators.enable");
                router
                    .delete("/tenants/:id/operators/:userId", [OperatorsController, "destroy"])
                    .as("platform.operators.destroy");
                router
                    .post("/tenants/:id/operators/:userId/reset-password", [OperatorsController, "resetPassword"])
                    .as("platform.operators.reset");
                router
                    .post("/tenants/:id/operators/:userId/handoff-link", [OperatorsController, "handoffLink"])
                    .as("platform.operators.handoff");
                router
                    .post("/tenants/:id/operators/:userId/make-owner", [OperatorsController, "makeOwner"])
                    .as("platform.operators.makeOwner");

                router.get("/audit", [PlatformAuditController, "index"]).as("platform.audit.index");
            })
            .use(middleware.platformAuth());
    })
    .prefix("/api/v1/platform");
