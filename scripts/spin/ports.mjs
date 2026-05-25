// @ts-check

import { createHash } from "node:crypto";
import net from "node:net";

/** Base of the per-spin port range. Picked deliberately outside the user-visible 3xxx family. */
export const PORT_BASE = 13000;
/**
 * Twenty-one ports per slug. The first ten are app surfaces + dev-ui (db, pgadmin, api, admin,
 * web, mailpit×2, redis, redisinsight, adminer) and are unchanged from the original layout —
 * old `.claude/spin/<slug>.json` files still parse and still point at the right containers.
 * The next ten are the prod-parity stack: caddy (http+https), meilisearch, and reserved
 * offsets for prometheus/grafana/loki/tempo/alertmanager/glitchtip/uptimeKuma. The
 * observability services don't actually publish to those host offsets in the compose file —
 * Caddy fronts them — but reserving the offsets keeps {@link allocatePorts} uniform and
 * leaves room for a direct publish later (handy when debugging from outside Caddy). The
 * single exception is `tempo`: its offset publishes the OTLP/HTTP receiver (4318) so the api
 * on the host can send traces; the HTTP API (3200) still stays container-only and is fronted
 * by Caddy. Offset +20 is the `spinAgent` — the homepage + control plane process started by
 * `startServers` and fronted by Caddy at the bare `<slug>.spin.localhost` host.
 */
export const PORTS_PER_SLOT = 21;
/** Total slots before we wrap around. 47 × 21 = 987 < 1000, so 13xxx still fits cleanly. */
export const TOTAL_SLOTS = 47;

export const ROLES = /** @type {const} */ ([
    "db",
    "pgadmin",
    "api",
    "admin",
    "web",
    "mailpitSmtp",
    "mailpitWeb",
    "redis",
    "redisinsight",
    "adminer",
    "caddyHttp",
    "caddyHttps",
    "meilisearch",
    "prometheus",
    "grafana",
    "loki",
    "tempo",
    "alertmanager",
    "glitchtip",
    "uptimeKuma",
    "spinAgent",
]);

/**
 * Pre-`pnpm spin` shared dev-ui ports. Old spins that pre-date the per-spin layout don't have
 * dev-ui ports in their meta file; {@link effectivePort} falls back to these so they keep
 * pointing at the legacy `calibra-dev-ui` containers (still running on every machine that ran
 * the older bootstrap). New spins ignore these and use their own per-spin ports.
 */
export const LEGACY_SHARED_DEV_UI_PORTS = /** @type {const} */ ({
    mailpitSmtp: 11025,
    mailpitWeb: 18025,
    redis: 16379,
    redisinsight: 15540,
    adminer: 18080,
});

/**
 * Resolve a per-spin port, falling back to the legacy shared dev-ui constants for spins that
 * pre-date {@link LEGACY_SHARED_DEV_UI_PORTS}. New spins always have every port populated in
 * `meta.ports`; old spins continue talking to their shared containers until they stop+restart.
 *
 * For prod-parity roles (caddy, meili, observability stack) absent from a legacy meta, returns
 * `null` instead of throwing — call sites use that to skip provisioning the observability
 * compose files. Use {@link requirePort} instead when the caller cannot proceed without one.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {keyof import("./meta.mjs").SpinPorts} role
 * @returns {number | null}
 */
export function effectivePort(meta, role) {
    const fromMeta = meta.ports[role];
    if (typeof fromMeta === "number") return fromMeta;
    if (role in LEGACY_SHARED_DEV_UI_PORTS) {
        return LEGACY_SHARED_DEV_UI_PORTS[/** @type {keyof typeof LEGACY_SHARED_DEV_UI_PORTS} */ (role)];
    }
    return null;
}

/**
 * Like {@link effectivePort} but throws when the role isn't allocated. Use for roles that
 * the caller depends on existing (api / db / pgadmin); use {@link effectivePort} for roles
 * that legacy spins may legitimately lack.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 * @param {keyof import("./meta.mjs").SpinPorts} role
 * @returns {number}
 */
export function requirePort(meta, role) {
    const port = effectivePort(meta, role);
    if (port === null) {
        throw new Error(`spin "${meta.slug}" meta is missing a required port "${role}"`);
    }
    return port;
}

/**
 * `true` when the spin pre-dates the per-spin dev-ui layout — its meta has no `redis` port
 * (and friends) and {@link effectivePort} falls back to the legacy shared container.
 *
 * @param {import("./meta.mjs").SpinMeta} meta
 */
export function isLegacyDevUi(meta) {
    return typeof meta.ports.redis !== "number";
}

/**
 * Pick a port slot deterministically from the slug, then nudge until every port is free. The
 * nudge keeps slugs that hash to the same base from clobbering each other.
 *
 * @param {string} slug
 * @returns {Promise<import("./meta.mjs").SpinPorts>}
 */
export async function allocatePorts(slug) {
    for (let nudge = 0; nudge < TOTAL_SLOTS; nudge++) {
        const slotKey = nudge === 0 ? slug : `${slug}#${nudge}`;
        const slot = hashToSlot(slotKey);
        const base = PORT_BASE + slot * PORTS_PER_SLOT;
        /** Keep the offsets in lockstep with {@link ROLES}; one entry per role. */
        const ports = {
            db: base,
            pgadmin: base + 1,
            api: base + 2,
            admin: base + 3,
            web: base + 4,
            mailpitSmtp: base + 5,
            mailpitWeb: base + 6,
            redis: base + 7,
            redisinsight: base + 8,
            adminer: base + 9,
            caddyHttp: base + 10,
            caddyHttps: base + 11,
            meilisearch: base + 12,
            prometheus: base + 13,
            grafana: base + 14,
            loki: base + 15,
            tempo: base + 16,
            alertmanager: base + 17,
            glitchtip: base + 18,
            uptimeKuma: base + 19,
            spinAgent: base + 20,
        };
        if (await allPortsFree(ports)) return ports;
    }
    throw new Error(`could not find a free port slot for slug "${slug}"`);
}

/**
 * @param {string} key
 * @returns {number}
 */
export function hashToSlot(key) {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 8);
    return Number.parseInt(digest, 16) % TOTAL_SLOTS;
}

/**
 * @param {import("./meta.mjs").SpinPorts} ports
 */
async function allPortsFree(ports) {
    for (const role of ROLES) {
        const port = ports[role];
        if (typeof port === "number" && (await probePort(port))) return false;
    }
    return true;
}

/**
 * Local TCP probe used solely by {@link allPortsFree} to avoid a circular dependency with
 * `probes.mjs`. Identical behaviour to {@link import("./probes.mjs").isPortListening}.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function probePort(port) {
    return new Promise((res) => {
        const socket = net.createConnection({ port, host: "127.0.0.1" });
        const finish = (/** @type {boolean} */ listening) => {
            socket.destroy();
            res(listening);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(500, () => finish(false));
    });
}
