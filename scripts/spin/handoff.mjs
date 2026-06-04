// @ts-check

import { bold, cyan, dim, green, log } from "./log.mjs";
import { requirePort } from "./ports.mjs";

/**
 * The demo shops `MainSeeder` provisions on every seed (kept in sync with `DEMO_TENANTS` in
 * `apps/api/database/seeders/main_seeder.ts`). The admin + storefront are per-tenant (Phase 4 / 3):
 * the bare `admin.<spin>` / `web.<spin>` apex hosts render the platform "unknown shop" page, so the
 * card points at each shop's own subdomain instead — prod parity for `<slug>.admin.calibra.app`.
 */
const DEMO_SHOPS = [
    { slug: "aurora", adminEmail: "admin@bulk.calibra.dev" },
    { slug: "mehr", adminEmail: "admin@mehr.calibra.dev" },
    { slug: "kasra", adminEmail: "admin@kasra.calibra.dev" },
];

/**
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {{ withWeb: boolean }} opts
 */
export function printHandoffCard(meta, opts) {
    log("");
    log(bold(green("ready")));
    const slug = meta.slug;
    const caddyHttps = requirePort(meta, "caddyHttps");
    log(`  ${bold("dashboard")}`);
    log(`    home    ${cyan(`https://${slug}.spin.localhost:${caddyHttps}`)} ${dim("(live URLs + health + actions)")}`);
    log(`  ${bold("app")} ${dim("(per-tenant — the bare admin./web. apex is the platform “unknown shop” page)")}`);
    log(`    admin   ${cyan(`https://admin.${slug}.spin.localhost:${caddyHttps}`)} ${dim("(platform · open a shop ↓)")}`);
    for (const shop of DEMO_SHOPS) {
        log(
            `       ${shop.slug.padEnd(7)} ${cyan(`https://${shop.slug}.admin.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(${shop.adminEmail})`)}`,
        );
    }
    log(`    api     ${cyan(`https://api.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(host :${meta.ports.api})`)}`);
    if (opts.withWeb) {
        log(`    web     ${cyan(`https://web.${slug}.spin.localhost:${caddyHttps}`)} ${dim("(platform · open a shop ↓)")}`);
        for (const shop of DEMO_SHOPS) {
            log(`       ${shop.slug.padEnd(7)} ${cyan(`https://${shop.slug}.web.${slug}.spin.localhost:${caddyHttps}`)}`);
        }
    }
    log(`  ${bold("observability")}`);
    const dsnNote = meta.glitchtipDsn ? "DSN wired" : "DSN pending — see GlitchTip setup below";
    log(`    grafana ${cyan(`https://grafana.${slug}.spin.localhost:${caddyHttps}`)} ${dim("(anonymous editor)")}`);
    log(`    errors  ${cyan(`https://errors.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(${dsnNote})`)}`);
    log(`    uptime  ${cyan(`https://uptime.${slug}.spin.localhost:${caddyHttps}`)}`);
    log(`    prom    ${cyan(`https://prom.${slug}.spin.localhost:${caddyHttps}`)}`);
    log(`    alerts  ${cyan(`https://alerts.${slug}.spin.localhost:${caddyHttps}`)}`);
    log(`  ${bold("search")}`);
    log(`    meili   ${cyan(`https://search.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(key in ${meta.slug}.json)`)}`);
    log(`  ${bold("data + dev")}`);
    log(
        `    mail    ${cyan(`https://mail.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(smtp localhost:${requirePort(meta, "mailpitSmtp")})`)}`,
    );
    log(
        `    redis   ${cyan(`https://redis.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(redis-cli on :${requirePort(meta, "redis")})`)}`,
    );
    log(`    db      ${cyan(`https://db.${slug}.spin.localhost:${caddyHttps}`)} ${dim(`(psql on :${meta.ports.db})`)}`);
    log(`    pgadmin ${cyan(`http://localhost:${meta.ports.pgadmin}`)}`);
    log(`  pr      ${meta.prUrl ?? `(skipped — run pnpm spin pr ${meta.slug})`}`);
    log(
        `  login   each shop's admin email above (or ${cyan("platform@calibra.dev")} for the control plane) / ${cyan("Passw0rd1!")}`,
    );
    log(`  stop    ${cyan(`pnpm spin stop ${meta.slug}`)}`);
    if (!meta.glitchtipDsn) {
        log("");
        log(dim("GlitchTip setup (one-time): open errors.<slug>.spin.localhost, register"));
        log(dim("`spin@calibra.dev`, create org `spin` + project `api`, copy the DSN into"));
        log(dim(`\`apps/api/.env\` as \`GLITCHTIP_DSN=…\`, then restart the api. We'll auto-`));
        log(dim("provision once the GlitchTip register API stabilises."));
    }
    log("");
    log(
        dim(
            `caddy: \`*.${slug}.spin.localhost\` resolves to 127.0.0.1; certs use Caddy's local CA. Run \`caddy trust\` once on this host if you haven't.`,
        ),
    );
}
