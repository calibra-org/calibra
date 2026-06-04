import vine from "@vinejs/vine";

/** A DNS hostname: dot-separated labels, each 1–63 chars, alphanumerics + internal dashes. */
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Attach a custom domain to a tenant (RULE C). The control plane only records the intent
 * (`tenant_domains` row, `tls_status=pending`) and returns CNAME instructions; the edge issues TLS
 * out of band (Phase 6).
 */
export const attachDomainValidator = vine.compile(
    vine.object({
        domain: vine.string().trim().toLowerCase().maxLength(253).regex(HOSTNAME_RE),
    }),
);
