import { createHash } from "node:crypto";
import { connect } from "node:net";

/**
 * Deterministic per-slug port allocation. Ported verbatim from the legacy
 * `scripts/spin/ports.mjs` so existing `.claude/spin/<slug>.json` metas keep parsing and
 * keep pointing at the same containers — the offset table below is a **frozen, append-only
 * contract**. Reordering or inserting a role shifts every existing spin's ports and orphans
 * their containers, so new roles are only ever appended at the end (see `ports.test.ts`,
 * which pins the offsets).
 */

/** Base of the per-spin port range. Deliberately outside the user-visible 3xxx family. */
export const PORT_BASE = 13000;

/**
 * Ports reserved per slug. Offsets 0–9 are the original app + dev-ui surfaces (unchanged
 * from the first layout), 10–19 the prod-parity stack (caddy/meili/observability), 20 the
 * spin agent (web panel), and 21 the platform control plane — appended last so offsets
 * 0–20 stay fixed for older metas.
 */
export const PORTS_PER_SLOT = 22;

/** Total slots before wrap-around. 45 × 22 = 990 < 1000, so 13xxx still fits cleanly. */
export const TOTAL_SLOTS = 45;

/** Highest legal TCP port — guards against a slot layout running off the end of the range. */
const MAX_PORT = 65535;

/**
 * The ordered role table. **Append-only** — index = offset from the slot base. Never reorder
 * or insert; only append.
 */
export const ROLES = [
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
    "platform",
] as const;

export type PortRole = (typeof ROLES)[number];

/**
 * Per-spin port assignments. The first five roles are always allocated (a sandbox cannot run
 * without them); the rest are optional so metas that pre-date a later role still type-check
 * and resolve through {@link effectivePort}.
 */
export type SpinPorts = {
    db: number;
    pgadmin: number;
    api: number;
    admin: number;
    web: number;
} & Partial<Record<PortRole, number>>;

/**
 * Shared dev-ui ports from before the per-spin layout. Metas that pre-date per-spin dev-ui
 * containers lack these in `meta.ports`; {@link effectivePort} falls back to them so those
 * spins keep talking to the legacy shared `calibra-dev-ui` containers until they restart.
 */
export const LEGACY_SHARED_DEV_UI_PORTS = {
    mailpitSmtp: 11025,
    mailpitWeb: 18025,
    redis: 16379,
    redisinsight: 15540,
    adminer: 18080,
} as const satisfies Partial<Record<PortRole, number>>;

/** Compute the full 22-role layout from a slot base. Used by forward-migration backfill. */
export function layoutFromBase(base: number): SpinPorts {
    const ports = {} as Record<PortRole, number>;
    ROLES.forEach((role, offset) => {
        ports[role] = base + offset;
    });
    return ports as SpinPorts;
}

/**
 * Resolve a per-spin port, falling back to the legacy shared dev-ui constants for spins that
 * pre-date {@link LEGACY_SHARED_DEV_UI_PORTS}. Returns `null` for prod-parity roles absent
 * from a legacy meta — call sites use that to skip provisioning. Use {@link requirePort}
 * when the caller cannot proceed without one.
 */
export function effectivePort(meta: { ports: SpinPorts }, role: PortRole): number | null {
    const fromMeta = meta.ports[role];
    if (typeof fromMeta === "number") return fromMeta;
    if (role in LEGACY_SHARED_DEV_UI_PORTS) {
        return LEGACY_SHARED_DEV_UI_PORTS[role as keyof typeof LEGACY_SHARED_DEV_UI_PORTS];
    }
    return null;
}

/** Like {@link effectivePort} but throws when the role isn't allocated. */
export function requirePort(meta: { slug: string; ports: SpinPorts }, role: PortRole): number {
    const port = effectivePort(meta, role);
    if (port === null) {
        throw new Error(`spin "${meta.slug}" meta is missing a required port "${role}"`);
    }
    return port;
}

/** `true` when the spin pre-dates the per-spin dev-ui layout (its meta has no `redis` port). */
export function isLegacyDevUi(meta: { ports: SpinPorts }): boolean {
    return typeof meta.ports.redis !== "number";
}

/** sha256(key) → slot index in `[0, TOTAL_SLOTS)`. Stable across runs for a given key. */
export function hashToSlot(key: string): number {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 8);
    return Number.parseInt(digest, 16) % TOTAL_SLOTS;
}

/**
 * Pick a slot deterministically from the slug, then nudge (`<slug>#1`, `<slug>#2`, …) until
 * every port in the block is free. The nudge keeps slugs that hash to the same base from
 * clobbering each other; the TCP probe avoids handing out a port another process already holds.
 */
export async function allocatePorts(slug: string): Promise<SpinPorts> {
    for (let nudge = 0; nudge < TOTAL_SLOTS; nudge += 1) {
        const slotKey = nudge === 0 ? slug : `${slug}#${nudge}`;
        const slot = hashToSlot(slotKey);
        const base = PORT_BASE + slot * PORTS_PER_SLOT;
        if (base + PORTS_PER_SLOT - 1 > MAX_PORT) continue;
        const ports = layoutFromBase(base);
        if (await allPortsFree(ports)) return ports;
    }
    throw new Error(`could not find a free port slot for slug "${slug}"`);
}

async function allPortsFree(ports: SpinPorts): Promise<boolean> {
    for (const role of ROLES) {
        const port = ports[role];
        if (typeof port === "number" && (await probePort(port))) return false;
    }
    return true;
}

/**
 * Local TCP liveness probe used only by {@link allocatePorts} (kept here to avoid a circular
 * import with `probes.ts`). Resolves `true` when something is already listening.
 */
function probePort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = connect({ port, host: "127.0.0.1" });
        const finish = (listening: boolean) => {
            socket.destroy();
            resolve(listening);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(500, () => finish(false));
    });
}
