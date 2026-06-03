import router from "@adonisjs/core/services/router";

const StorefrontTenantController = () => import("#controllers/storefront/tenant_controller");

router
    .group(() => {
        router.get("/tenant", [StorefrontTenantController, "show"]).as("storefront.tenant.show");
    })
    .prefix("/api/v1/storefront");
