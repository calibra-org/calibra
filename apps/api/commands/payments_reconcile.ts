import { BaseCommand, flags } from "@adonisjs/core/ace";
import type { CommandOptions } from "@adonisjs/core/types/ace";

/**
 * Detect stranded orders: orders stuck in `pending` whose `AwaitingCallback` payment attempt
 * is older than the reconcile window (default 15 minutes). The expected case is "PSP callback
 * lands within seconds" — anything past the window is a webhook delivery failure that needs
 * either auto-remediation (verify the attempt directly against the PSP) or manual ops.
 *
 * This first iteration is detect-only: it lists stranded orders, refreshes the
 * `calibra_payment_stranded_orders` Prometheus gauge so the on-call dashboard can graph it,
 * and emits a Sentry warning per stranded attempt. A follow-up will call adapter.verify on
 * each attempt to auto-finalise verified ones (the SAFE remediation — wherever the PSP says
 * "yes that authority was paid", we'd run the same code path verifyCallback runs).
 *
 * Schedule via the host cron every 5 minutes (the per-spin compose ships @adonisjs/queue but
 * not a queued scheduler yet — falling back to ace + cron is simpler and survives queue
 * outages, which is what reconcile exists to recover from).
 */
export default class PaymentsReconcile extends BaseCommand {
    static commandName = "payments:reconcile";
    static description = "Detect stranded pending orders past the PSP callback window";

    static options: CommandOptions = {
        startApp: true,
    };

    @flags.string({
        description: "Limit to a single gateway code (zarinpal, idpay, ...). Defaults to all enabled gateways.",
    })
    declare gateway: string;

    @flags.number({
        description: "Minutes past `attempts.initiated_at` before an attempt counts as stranded (default 15).",
    })
    declare window: number;

    @flags.boolean({ description: "List stranded orders without updating metrics or capturing to Sentry." })
    declare dryRun: boolean;

    async run() {
        const windowMinutes = Number.isFinite(this.window) && this.window > 0 ? this.window : 15;

        const db = (await import("@adonisjs/lucid/services/db")).default;
        const Sentry = await import("@sentry/node");
        const { recordStrandedOrders } = await import("#services/metrics/domain_metrics");

        const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

        const builder = db
            .from("payment_attempts as pa")
            .innerJoin("orders as o", "o.id", "pa.order_id")
            .innerJoin("payment_gateways as g", "g.id", "pa.gateway_id")
            .where("pa.status", "awaiting_callback")
            .where("o.status", "pending")
            .whereNull("o.deleted_at")
            .where("pa.initiated_at", "<", cutoff)
            .select(
                "pa.id as attempt_id",
                "pa.gateway_authority",
                "pa.initiated_at",
                "o.id as order_id",
                "o.order_key",
                "g.code as gateway_code",
            );

        if (this.gateway) builder.where("g.code", this.gateway);

        const rows = (await builder) as Array<{
            attempt_id: string | number;
            gateway_authority: string | null;
            initiated_at: Date | string;
            order_id: string | number;
            order_key: string | null;
            gateway_code: string;
        }>;

        if (rows.length === 0) {
            this.logger.info(`No stranded orders past ${windowMinutes}min window.`);
            if (!this.dryRun) {
                /**
                 * Best-effort: zero the gauge across every gateway we know about. Without this,
                 * an alerting rule that fires on `gauge > 0` can stay sticky after the last
                 * stranded order recovers.
                 */
                const gateways = (await db.from("payment_gateways").select("code")) as Array<{ code: string }>;
                for (const g of gateways) recordStrandedOrders(g.code, 0);
            }
            return;
        }

        const byGateway = new Map<string, number>();
        for (const row of rows) {
            byGateway.set(row.gateway_code, (byGateway.get(row.gateway_code) ?? 0) + 1);
            this.logger.warning(
                `stranded order=${row.order_id} order_key=${row.order_key ?? "-"} attempt=${row.attempt_id} ` +
                    `gateway=${row.gateway_code} authority=${row.gateway_authority ?? "-"} initiated_at=${String(row.initiated_at)}`,
            );
        }

        if (this.dryRun) {
            this.logger.info(`dry-run: ${rows.length} stranded order(s) detected. Metrics + Sentry skipped.`);
            return;
        }

        for (const [code, count] of byGateway.entries()) {
            recordStrandedOrders(code, count);
        }

        Sentry.captureMessage("payments_stranded_orders_detected", {
            level: "warning",
            tags: { window_minutes: String(windowMinutes), total: String(rows.length) },
            extra: { by_gateway: Object.fromEntries(byGateway) },
        });

        this.logger.info(`reconcile complete: ${rows.length} stranded order(s) across ${byGateway.size} gateway(s).`);
    }
}
