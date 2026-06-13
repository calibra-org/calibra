import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import vine from "@vinejs/vine";

const auditQueryValidator = vine.compile(
    vine.object({
        tenant_id: vine.number().positive().optional(),
        page: vine.number().min(1).optional(),
        limit: vine.number().min(1).max(100).optional(),
    }),
);

interface OperatorIdentity {
    name: string | null;
    email: string | null;
}

interface TenantIdentity {
    slug: string | null;
    name: string | null;
}

/** Normalize a merged DB row into the `AuditEvent` wire shape, resolving the actor + target ids to
 * readable names/emails (so the feed shows "removed staff@shop.com", not "#770") and the tenant id
 * to its slug/name (so the fleet-wide feed shows which shop each event belongs to). */
function toAuditEvent(
    row: Record<string, unknown>,
    operators: Map<number, OperatorIdentity>,
    targets: Map<number, string | null>,
    tenants: Map<number, TenantIdentity>,
) {
    const platformUserId = row.platform_user_id === null ? null : Number(row.platform_user_id);
    const targetUserId = row.target_user_id === null ? null : Number(row.target_user_id);
    const tenantId = Number(row.tenant_id);
    const operator = platformUserId === null ? undefined : operators.get(platformUserId);
    const tenant = tenants.get(tenantId);
    return {
        source: String(row.source),
        id: Number(row.id),
        tenant_id: tenantId,
        tenant_slug: tenant?.slug ?? null,
        tenant_name: tenant?.name ?? null,
        platform_user_id: platformUserId,
        platform_user_name: operator?.name ?? null,
        platform_user_email: operator?.email ?? null,
        target_user_id: targetUserId,
        target_email: targetUserId === null ? null : (targets.get(targetUserId) ?? null),
        action: String(row.action),
        reason: row.reason === null || row.reason === undefined ? null : String(row.reason),
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
        ip_address: row.ip_address === null || row.ip_address === undefined ? null : String(row.ip_address),
        user_agent: row.user_agent === null || row.user_agent === undefined ? null : String(row.user_agent),
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        ended_at: row.ended_at ? (row.ended_at instanceof Date ? row.ended_at.toISOString() : String(row.ended_at)) : null,
        end_cause: row.end_cause === null || row.end_cause === undefined ? null : String(row.end_cause),
    };
}

/** Distinct, non-null numeric ids for a column across the page's rows. */
function distinctIds(rows: Array<Record<string, unknown>>, column: string): number[] {
    const set = new Set<number>();
    for (const row of rows) {
        const value = row[column];
        if (value !== null && value !== undefined) set.add(Number(value));
    }
    return [...set];
}

/**
 * Control-plane audit viewer. Merges `platform_audit_events` (operator actions) and
 * `tenant_impersonation_events` (log-in-as sessions) into one newest-first, paginated feed —
 * optionally filtered to one tenant. Resolves the acting `platform_users` and affected `users` ids to
 * names/emails (BYPASSRLS read, includes soft-deleted) so every row is human-readable. Runs on the
 * `postgres_admin` connection with NO tenant context (a cross-tenant read; routing it through
 * `tenant_context_middleware`/`calibra_app` would fail-closed to zero rows). Guarded by `platformAuth`.
 */
export default class PlatformAuditController {
    async index(ctx: HttpContext) {
        const { tenant_id: tenantId, page = 1, limit = 30 } = await auditQueryValidator.validate(ctx.request.qs());
        const offset = (page - 1) * limit;
        const conn = db.connection("postgres_admin");
        /** `0` is the "all tenants" sentinel — no tenant row has id 0, so it never matches a real id. */
        const bind = { tenantId: tenantId ?? 0 };

        const merged =
            "SELECT * FROM (" +
            "SELECT 'platform_action' AS source, id, tenant_id, platform_user_id, target_user_id, action, " +
            "NULL::text AS reason, metadata, ip_address, user_agent, created_at, NULL::timestamptz AS ended_at, " +
            "NULL::varchar AS end_cause FROM platform_audit_events " +
            "WHERE (:tenantId::bigint = 0 OR tenant_id = :tenantId) " +
            "UNION ALL " +
            "SELECT 'impersonation' AS source, id, tenant_id, platform_user_id, target_user_id, 'impersonation' AS action, " +
            "reason, '{}'::jsonb AS metadata, ip_address, user_agent, started_at AS created_at, ended_at, end_cause " +
            "FROM tenant_impersonation_events " +
            "WHERE (:tenantId::bigint = 0 OR tenant_id = :tenantId)" +
            ") merged ";

        const result = await conn.rawQuery(`${merged} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`, {
            ...bind,
            limit,
            offset,
        });
        const rows = result.rows as Array<Record<string, unknown>>;
        const totalRow = await conn.rawQuery(`SELECT count(*)::int AS total FROM (${merged}) counted`, bind);
        const total = Number(totalRow.rows[0]?.total ?? 0);

        const operatorIds = distinctIds(rows, "platform_user_id");
        const targetIds = distinctIds(rows, "target_user_id");
        const operators = new Map<number, OperatorIdentity>();
        if (operatorIds.length > 0) {
            const found = await conn.from("platform_users").whereIn("id", operatorIds).select("id", "name", "email");
            for (const row of found) operators.set(Number(row.id), { name: row.name ?? null, email: row.email ?? null });
        }
        const targets = new Map<number, string | null>();
        if (targetIds.length > 0) {
            const found = await conn.from("users").whereIn("id", targetIds).select("id", "email");
            for (const row of found) targets.set(Number(row.id), row.email ?? null);
        }
        const tenants = new Map<number, TenantIdentity>();
        const tenantIds = distinctIds(rows, "tenant_id");
        if (tenantIds.length > 0) {
            const found = await conn.from("tenants").whereIn("id", tenantIds).select("id", "slug", "name");
            for (const row of found) tenants.set(Number(row.id), { slug: row.slug ?? null, name: row.name ?? null });
        }

        return {
            data: rows.map((row) => toAuditEvent(row, operators, targets, tenants)),
            meta: { page, perPage: limit, total, lastPage: Math.max(1, Math.ceil(total / limit)) },
        };
    }
}
