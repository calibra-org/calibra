import { BaseCommand } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Close impersonation events whose 30-minute token has silently lapsed. The token simply expires
 * (opaque — no callback fires), so without this sweep an abandoned session reads as "still active"
 * forever in the audit viewer. Stamps `ended_at` + `end_cause='expired'` for every open event older
 * than the token TTL.
 *
 * `tenant_impersonation_events` is a global control-plane table, so this runs once on the
 * `postgres_admin` connection — no per-tenant loop. Cron-friendly (suggested: every 5 minutes).
 */
export default class ImpersonationCloseExpired extends BaseCommand {
    static commandName = "impersonation:close-expired";
    static description = "Close impersonation events whose short-lived token has expired (end_cause='expired')";

    static options: CommandOptions = {
        startApp: true,
    };

    async run() {
        const { default: db } = await import("@adonisjs/lucid/services/db");
        const result = await db
            .connection("postgres_admin")
            .rawQuery(
                "UPDATE tenant_impersonation_events SET ended_at = now(), end_cause = 'expired' " +
                    "WHERE ended_at IS NULL AND started_at < now() - interval '30 minutes'",
            );
        const closed = Number((result as { rowCount?: number }).rowCount ?? 0);
        this.logger.info(`Closed ${closed} expired impersonation event(s).`);
    }
}
