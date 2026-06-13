import { randomBytes } from "node:crypto";

/**
 * Per-spin secrets, generated once on first start and persisted in the meta file (chmod 0600).
 * Same slug ⇒ same secrets across stop/start so signed cookies, the Meilisearch key, and the
 * GlitchTip instance key stay valid for the developer. `stop --purge` regenerates them by
 * clearing the meta.
 *
 * The Postgres role passwords are NOT here — they are fixed, well-known dev constants
 * ({@link DB_ROLES}), because the two-role RLS split is part of the local dev contract, not a
 * secret.
 */
export interface SpinSecrets {
    /** Adonis APP_KEY — signs cookies/sessions. Per-spin so one spin's cookies are rejected by another. */
    appKey: string;
    /** Django SECRET_KEY for the per-spin GlitchTip instance. */
    glitchtipSecretKey: string;
    /** Meilisearch master key — the api authenticates against the per-spin instance with it. */
    meiliMasterKey: string;
    /** Edge shared secret — the spin agent sends it as `X-Edge-Secret` to the api `/api/caddy/ask`. */
    edgeSecret: string;
}

/** Fixed local Postgres roles for the two-role RLS split (see apps/api/config/database.ts). */
export const DB_ROLES = {
    /** Runtime app role — NOBYPASSRLS, RLS always enforced. */
    app: { user: "calibra_app", password: "calibra_app" },
    /** Migration/seed role — BYPASSRLS. */
    admin: { user: "calibra_admin", password: "calibra_admin" },
    /** Container superuser — only `db:bootstrap-roles` uses it. */
    superuser: { user: "calibra", password: "calibra" },
    /** The database name. */
    database: "calibra",
} as const;

/** Generate a fresh set of per-spin secrets. */
export function generateSecrets(): SpinSecrets {
    return {
        appKey: randomBytes(32).toString("hex"),
        glitchtipSecretKey: randomBytes(48).toString("hex"),
        meiliMasterKey: randomBytes(32).toString("hex"),
        edgeSecret: randomBytes(32).toString("hex"),
    };
}

/**
 * Fill any missing secret fields on a partially-populated object (e.g. a meta that pre-dates a
 * new secret). Existing values are preserved; only holes get fresh randoms.
 */
export function backfillSecrets(existing: Partial<SpinSecrets>): SpinSecrets {
    const fresh = generateSecrets();
    return {
        appKey: existing.appKey ?? fresh.appKey,
        glitchtipSecretKey: existing.glitchtipSecretKey ?? fresh.glitchtipSecretKey,
        meiliMasterKey: existing.meiliMasterKey ?? fresh.meiliMasterKey,
        edgeSecret: existing.edgeSecret ?? fresh.edgeSecret,
    };
}
