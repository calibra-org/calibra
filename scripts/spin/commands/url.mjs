// @ts-check

import { requireSlug } from "../flags.mjs";
import { readMetaOrFail } from "../meta.mjs";

import { collectDoctorReport } from "./doctor.mjs";

/**
 * `pnpm spin url <slug> <service>` — print a URL to stdout, no formatting, no headers, ready to
 * pipe into curl / xdg-open / wget. Useful from `just` recipes and agents that need exactly the
 * URL without grepping a pretty table. Without `<service>`, prints the dashboard URL.
 *
 * Recognised service names match {@link collectDoctorReport} `id`s (api, admin, web, db,
 * pgadmin, mailpit-web, mailpit-smtp, redis, redisinsight, adminer, caddy, meilisearch,
 * glitchtip, grafana, prometheus, loki, tempo, alertmanager, uptime-kuma) plus the aliases
 * `dashboard`, `home`, `mail` (= mailpit-web), `mail-smtp` (= mailpit-smtp), `prom`,
 * `meili`, `errors` (= glitchtip), `uptime` (= uptime-kuma).
 *
 * @param {string[]} args
 */
export async function url(args) {
    const slug = requireSlug(args[0]);
    const requested = (args[1] ?? "dashboard").toLowerCase();
    const meta = await readMetaOrFail(slug);
    const report = await collectDoctorReport(meta);
    if (requested === "dashboard" || requested === "home") {
        process.stdout.write(`${report.dashboardUrl}\n`);
        return;
    }
    const aliases = {
        mail: "mailpit-web",
        "mail-smtp": "mailpit-smtp",
        smtp: "mailpit-smtp",
        prom: "prometheus",
        meili: "meilisearch",
        errors: "glitchtip",
        uptime: "uptime-kuma",
    };
    const wanted = aliases[requested] ?? requested;
    const svc = report.services.find((s) => s.id === wanted);
    if (!svc) {
        const ids = report.services.map((s) => s.id).join(", ");
        throw new Error(`unknown service "${requested}". Recognised: dashboard, ${ids}`);
    }
    process.stdout.write(`${svc.url}\n`);
}
