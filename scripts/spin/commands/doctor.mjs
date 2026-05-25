// @ts-check

import { existsSync } from "node:fs";
import { join } from "node:path";

import { parseFlags, requireSlug } from "../flags.mjs";
import { cyan, green, log, red, yellow } from "../log.mjs";
import { readMetaOrFail } from "../meta.mjs";
import { isLegacyDevUi, requirePort } from "../ports.mjs";
import { isPortListening, probeViaCaddy } from "../probes.mjs";
import { readPidIfAlive } from "../processes.mjs";

/**
 * Print one spin's full status: ports, processes, containers, PR. Useful when something looks
 * broken and you want to see which step failed.
 *
 * @param {string[]} args
 */
export async function doctor(args) {
    const slug = requireSlug(args[0]);
    const flags = parseFlags(args.slice(1));
    const meta = await readMetaOrFail(slug);
    const report = await collectDoctorReport(meta);
    if (flags.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }
    renderDoctorReport(report);
}

/**
 * Probe every service the spin provisioned and return a flat JSON-friendly report. The text
 * renderer above formats this for humans; agents read the JSON form via `--json`. Each entry
 * has a stable `id` agents can grep for + a `status` of `"up" | "down" | "unknown"`.
 *
 * @param {import("../meta.mjs").SpinMeta} meta
 */
export async function collectDoctorReport(meta) {
    const slug = meta.slug;
    const caddyHttps = requirePort(meta, "caddyHttps");
    const dashboardUrl = `https://${slug}.spin.localhost:${caddyHttps}/`;
    const mailpitSmtp = requirePort(meta, "mailpitSmtp");
    const mailpitWeb = requirePort(meta, "mailpitWeb");
    const redis = requirePort(meta, "redis");
    const redisinsight = requirePort(meta, "redisinsight");
    const adminer = requirePort(meta, "adminer");
    const meili = requirePort(meta, "meilisearch");
    const tempo = requirePort(meta, "tempo");
    const queuePid = await readPidIfAlive(join(meta.worktreePath, ".spin/queue.pid"));

    const services = [];
    /** Direct-host probes — TCP / HTTP on a bound port. */
    services.push({
        id: "api",
        url: `http://localhost:${meta.ports.api}/health`,
        status: (await isPortListening(meta.ports.api)) ? "up" : "down",
    });
    services.push({
        id: "admin",
        url: `http://localhost:${meta.ports.admin}/`,
        status: (await isPortListening(meta.ports.admin)) ? "up" : "down",
    });
    services.push({
        id: "web",
        url: `http://localhost:${meta.ports.web}/`,
        status: (await isPortListening(meta.ports.web)) ? "up" : "down",
    });
    services.push({
        id: "db",
        url: `postgres://localhost:${meta.ports.db}`,
        status: (await isPortListening(meta.ports.db)) ? "up" : "down",
    });
    services.push({
        id: "pgadmin",
        url: `http://localhost:${meta.ports.pgadmin}/`,
        status: (await isPortListening(meta.ports.pgadmin)) ? "up" : "down",
    });
    services.push({
        id: "mailpit-smtp",
        url: `smtp://localhost:${mailpitSmtp}`,
        status: (await isPortListening(mailpitSmtp)) ? "up" : "down",
    });
    services.push({
        id: "mailpit-web",
        url: `http://localhost:${mailpitWeb}/`,
        status: (await isPortListening(mailpitWeb)) ? "up" : "down",
    });
    services.push({ id: "redis", url: `redis://localhost:${redis}`, status: (await isPortListening(redis)) ? "up" : "down" });
    services.push({
        id: "redisinsight",
        url: `http://localhost:${redisinsight}/`,
        status: (await isPortListening(redisinsight)) ? "up" : "down",
    });
    services.push({
        id: "adminer",
        url: `http://localhost:${adminer}/`,
        status: (await isPortListening(adminer)) ? "up" : "down",
    });
    services.push({ id: "caddy", url: dashboardUrl, status: (await isPortListening(caddyHttps)) ? "up" : "down" });
    services.push({
        id: "meilisearch",
        url: `http://localhost:${meili}/health`,
        status: (await isPortListening(meili)) ? "up" : "down",
    });

    /** Caddy-fronted observability surfaces — probed through the hostname. */
    services.push({
        id: "glitchtip",
        url: `https://errors.${slug}.spin.localhost:${caddyHttps}/api/0/`,
        status: (await probeViaCaddy(meta, "errors", "/api/0/", [200, 401, 403])) ? "up" : "down",
    });
    services.push({
        id: "grafana",
        url: `https://grafana.${slug}.spin.localhost:${caddyHttps}/`,
        status: (await probeViaCaddy(meta, "grafana", "/api/health")) ? "up" : "down",
    });
    services.push({
        id: "prometheus",
        url: `https://prom.${slug}.spin.localhost:${caddyHttps}/`,
        status: (await probeViaCaddy(meta, "prom", "/-/ready")) ? "up" : "down",
    });
    services.push({
        id: "loki",
        url: `https://loki.${slug}.spin.localhost:${caddyHttps}/`,
        status: (await probeViaCaddy(meta, "loki", "/ready")) ? "up" : "down",
    });
    services.push({
        id: "tempo",
        url: `https://tempo.${slug}.spin.localhost:${caddyHttps}/`,
        status: (await probeViaCaddy(meta, "tempo", "/ready")) ? "up" : "down",
        note: `OTLP receiver on :${tempo}`,
    });
    services.push({
        id: "alertmanager",
        url: `https://alerts.${slug}.spin.localhost:${caddyHttps}/`,
        status: (await probeViaCaddy(meta, "alerts", "/-/ready")) ? "up" : "down",
    });
    services.push({
        id: "uptime-kuma",
        url: `https://uptime.${slug}.spin.localhost:${caddyHttps}/`,
        status: (await probeViaCaddy(meta, "uptime", "/", [200, 302])) ? "up" : "down",
    });

    return {
        slug,
        branch: meta.branch,
        composeProject: meta.composeProject,
        worktreePath: meta.worktreePath,
        worktreeExists: existsSync(meta.worktreePath),
        dashboardUrl,
        pr: meta.prNumber ?? null,
        prUrl: meta.prUrl ?? null,
        ports: meta.ports,
        services,
        queueWorker: { pid: queuePid, status: queuePid !== null ? "up" : "down" },
        legacyDevUi: isLegacyDevUi(meta),
        glitchtipDsn: meta.glitchtipDsn ?? null,
    };
}

/** Pretty-print {@link collectDoctorReport} output for terminal consumption. */
export function renderDoctorReport(report) {
    const slug = report.slug;
    log(cyan(`doctor ${slug}`));
    log(`  worktree     ${report.worktreePath} ${report.worktreeExists ? green("✓") : red("✗ missing")}`);
    log(`  branch       ${report.branch}`);
    log(`  dashboard    ${report.dashboardUrl}`);
    for (const svc of report.services) {
        const colored = svc.status === "up" ? green("up") : red("down");
        const note = svc.note ? ` ${svc.note}` : "";
        log(`  ${svc.id.padEnd(13)}${svc.url} ${colored}${note}`);
    }
    log(`  compose      project=${report.composeProject}`);
    log(`  queue worker pid=${report.queueWorker.pid ?? "—"} ${report.queueWorker.status === "up" ? green("up") : red("down")}`);
    log(`  PR           ${report.pr ? `#${report.pr}` : "—"}`);
    if (report.legacyDevUi) log(`  ${yellow("(legacy shared dev-ui ports — pre-spin layout)")}`);
    if (!report.glitchtipDsn) log(`  ${yellow("glitchtip DSN missing — see one-time setup blurb in spin.md")}`);
}
