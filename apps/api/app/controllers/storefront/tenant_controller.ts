import cache from "@adonisjs/cache/services/main";

import { ResourceNotFoundException } from "#exceptions/domain_exceptions";
import { CacheKeys, CacheTags } from "#services/cache_keys";
import { loadTenantBranding } from "#services/storefront_branding_service";
import { currentTenantId } from "#services/tenant_context";
import { resolveTenantByRef } from "#services/tenant_resolver";
import { toStorefrontTenant } from "#transformers/storefront_tenant_transformer";

export default class StorefrontTenantController {
    /**
     * GET /api/v1/storefront/tenant — public profile + branding for the tenant resolved from the
     * request (`X-Calibra-Tenant` header → `Host`). The storefront fetches this once per request
     * and injects the palette as CSS custom properties before first paint (RULE B), reads
     * `template_key` to detect a misrouted host (RULE C), and renders name/tagline/logo from
     * `branding`. Suspended/missing tenants never reach here — `tenant_context_middleware` already
     * answers 503 / 404 before the route runs.
     *
     * Cached per tenant; busted by `CacheTags.tenants` (profile edits) and
     * `CacheTags.storefrontTenant` (branding edits — see `cache_keys.ts`).
     */
    async show() {
        const tenantId = currentTenantId();
        return cache.getOrSet({
            key: CacheKeys.storefront.tenant(tenantId),
            ttl: "30m",
            grace: "24h",
            tags: [CacheTags.storefrontTenant(tenantId), CacheTags.tenants],
            factory: async () => {
                const tenant = await resolveTenantByRef(String(tenantId));
                if (!tenant) {
                    throw new ResourceNotFoundException("Tenant not found");
                }
                const branding = await loadTenantBranding(tenant.name);
                return { data: toStorefrontTenant(tenant, branding) };
            },
        });
    }
}
