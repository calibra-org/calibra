import { c } from "../colors";
import { DEMO_TENANTS, DEMO_TENANT_PASSWORD } from "./catalog";
import type { SpinMeta } from "./meta";
import { requirePort } from "./ports";

/**
 * The handoff card printed after a successful bring-up. Goes to stdout (it's the command result).
 * Per-tenant URLs use the canonical Caddy-TLS scheme — the bare `admin.<spin>` / `web.<spin>` apex
 * renders the platform "unknown shop" page, so the card points at each seeded shop's own subdomain.
 */

function print(line = ""): void {
    process.stdout.write(`${line}\n`);
}

export function printHandoffCard(meta: SpinMeta, opts: { withWeb: boolean }): void {
    const { slug } = meta;
    const caddyHttps = requirePort(meta, "caddyHttps");
    const apex = `https://${slug}.spin.localhost:${caddyHttps}`;
    const base = (host: string) => `https://${host}.${slug}.spin.localhost:${caddyHttps}`;

    print();
    print(c.bold(c.green("ready")));
    print(`  ${c.bold("dashboard")}`);
    print(`    home    ${c.cyan(apex)} ${c.dim("(live URLs + health + actions)")}`);
    print(`  ${c.bold("app")} ${c.dim("(per-tenant — the bare admin./web. apex is the platform “unknown shop” page)")}`);
    print(`    admin   ${c.cyan(base("admin"))} ${c.dim("(platform · open a shop ↓)")}`);
    for (const tenant of DEMO_TENANTS) {
        print(`       ${tenant.slug.padEnd(7)} ${c.cyan(`https://${tenant.slug}.admin.${slug}.spin.localhost:${caddyHttps}`)} ${c.dim(`(${tenant.ownerEmail})`)}`);
    }
    print(`    api     ${c.cyan(base("api"))} ${c.dim(`(host :${meta.ports.api})`)}`);
    if (opts.withWeb) {
        print(`    web     ${c.cyan(base("web"))} ${c.dim("(platform · open a shop ↓)")}`);
        for (const tenant of DEMO_TENANTS) {
            print(`       ${tenant.slug.padEnd(7)} ${c.cyan(`https://${tenant.slug}.web.${slug}.spin.localhost:${caddyHttps}`)}`);
        }
    }
    print(`  ${c.bold("observability")}`);
    const dsnNote = meta.glitchtipDsn ? "DSN wired" : "DSN pending";
    print(`    grafana ${c.cyan(base("grafana"))}`);
    print(`    errors  ${c.cyan(base("errors"))} ${c.dim(`(${dsnNote})`)}`);
    print(`    uptime  ${c.cyan(base("uptime"))}`);
    print(`    prom    ${c.cyan(base("prom"))}`);
    print(`    alerts  ${c.cyan(base("alerts"))}`);
    print(`  ${c.bold("search")}`);
    print(`    meili   ${c.cyan(base("search"))} ${c.dim(`(key in ${slug}.json)`)}`);
    print(`  ${c.bold("data + dev")}`);
    print(`    mail    ${c.cyan(base("mail"))} ${c.dim(`(smtp localhost:${requirePort(meta, "mailpitSmtp")})`)}`);
    print(`    redis   ${c.cyan(base("redis"))} ${c.dim(`(redis-cli on :${requirePort(meta, "redis")})`)}`);
    print(`    db      ${c.cyan(base("db"))} ${c.dim(`(psql on :${meta.ports.db})`)}`);
    print(`    pgadmin ${c.cyan(`http://localhost:${meta.ports.pgadmin}`)}`);
    print(`  pr      ${meta.prUrl ?? c.dim(`(skipped — run pnpm spin pr ${slug})`)}`);
    print(`  login   each shop's admin email above / ${c.cyan(DEMO_TENANT_PASSWORD)}`);
    print(`  stop    ${c.cyan(`pnpm spin stop ${slug}`)}`);
    print();
    print(c.dim(`caddy: *.${slug}.spin.localhost → 127.0.0.1; local-CA certs. Run \`pnpm spin trust\` once if you see TLS warnings.`));
}
