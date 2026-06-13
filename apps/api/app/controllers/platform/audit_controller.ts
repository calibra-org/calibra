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

/** Normalize a merged DB row into the `AuditEvent` wire shape. */
function toAuditEvent(row: Record<string, unknown>) {
    return {
        source: String(row.source),
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        platform_user_id: row.platform_user_id === null ? null : Number(row.platform_user_id),
        target_user_id: row.target_user_id === null ? null : Number(row.target_user_id),
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

/**
 * Control-plane audit viewer. Merges `platform_audit_events` (operator actions) and
 * `tenant_impersonation_events` (log-in-as sessions) into one newest-first, paginated feed —
 * optionally filtered to one tenant. Runs on the `postgres_admin` connection with NO tenant context
 * (a cross-tenant read; routing it through `tenant_context_middleware`/`calibra_app` would
 * fail-closed to zero rows). Guarded by `platformAuth`.
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

        const rows = await conn.rawQuery(`${merged} ORDER BY created_at DESC LIMIT :limit OFFSET :offset`, {
            ...bind,
            limit,
            offset,
        });
        const totalRow = await conn.rawQuery(`SELECT count(*)::int AS total FROM (${merged}) counted`, bind);
        const total = Number(totalRow.rows[0]?.total ?? 0);

        return {
            data: rows.rows.map(toAuditEvent),
            meta: { page, perPage: limit, total, lastPage: Math.max(1, Math.ceil(total / limit)) },
        };
    }
}
