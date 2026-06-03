import type { ResolvedBranding } from "#services/storefront_branding_service";
import type { ResolvedTenant } from "#services/tenant_resolver";

/**
 * Shapes the public `GET /api/v1/storefront/tenant` response. The storefront resolves the active
 * tenant from the request `Host`, then renders its name/logo/palette from this payload (RULE B —
 * branding is runtime, injected as CSS custom properties before first paint). `template_key` lets
 * the app fail loudly when a host is misrouted to the wrong template codebase (RULE C).
 */
export function toStorefrontTenant(tenant: ResolvedTenant, branding: ResolvedBranding) {
    return {
        slug: tenant.slug,
        name: tenant.name,
        template_key: tenant.templateKey,
        status: tenant.status,
        currency: tenant.currencyCode,
        branding: {
            name: branding.name,
            tagline: branding.tagline,
            font: branding.font,
            logoUrl: branding.logoUrl,
            faviconUrl: branding.faviconUrl,
            palette: {
                background: branding.palette.background,
                foreground: branding.palette.foreground,
                muted: branding.palette.muted,
                mutedForeground: branding.palette.mutedForeground,
                border: branding.palette.border,
                accent: branding.palette.accent,
                accentForeground: branding.palette.accentForeground,
            },
        },
    };
}
