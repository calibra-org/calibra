import { describe, expect, it } from "vitest";
import { backfillSchema, MetaSchema } from "../src/core/meta";

/**
 * Forward-migration must let an older meta parse cleanly: fill newly-added port roles + missing
 * secrets from the slot base, while preserving every existing value (so ports/cookies stay
 * stable). These are pure tests over the migration function — no filesystem.
 */
describe("meta forward-migration", () => {
    const base = 13044;

    function legacyMeta(extra: Record<string, unknown> = {}) {
        return {
            slug: "legacy",
            branch: "spin/legacy",
            composeProject: "calibra-spin-legacy",
            worktreePath: "/repo/.claude/worktrees/legacy",
            ports: {
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
            },
            appKey: "preexisting-app-key-value-kept-stable-aaaa",
            createdAt: "2026-01-01T00:00:00.000Z",
            ...extra,
        };
    }

    it("backfills a newer port role (platform) from the slot base", () => {
        const migrated = MetaSchema.parse(backfillSchema(legacyMeta()));
        expect(migrated.ports.platform).toBe(base + 21);
        expect(migrated.ports.caddyHttp).toBe(base + 10);
        expect(migrated.ports.meilisearch).toBe(base + 12);
    });

    it("preserves existing port values verbatim", () => {
        const migrated = MetaSchema.parse(backfillSchema(legacyMeta()));
        expect(migrated.ports.db).toBe(base);
        expect(migrated.ports.api).toBe(base + 2);
        expect(migrated.ports.redis).toBe(base + 7);
    });

    it("keeps an existing appKey and generates missing secrets", () => {
        const migrated = MetaSchema.parse(backfillSchema(legacyMeta()));
        expect(migrated.appKey).toBe("preexisting-app-key-value-kept-stable-aaaa");
        expect(migrated.glitchtipSecretKey).toMatch(/^[0-9a-f]{96}$/);
        expect(migrated.meiliMasterKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it("does NOT backfill ports for a legacy dev-ui meta (no redis port)", () => {
        const raw = legacyMeta();
        delete (raw.ports as Record<string, unknown>).redis;
        delete (raw.ports as Record<string, unknown>).redisinsight;
        delete (raw.ports as Record<string, unknown>).adminer;
        const migrated = MetaSchema.parse(backfillSchema(raw));
        /** Left to effectivePort's shared-container fallback rather than pointing at empty ports. */
        expect(migrated.ports.redis).toBeUndefined();
        expect(migrated.ports.platform).toBeUndefined();
    });

    it("applies schema defaults for newer flags", () => {
        const migrated = MetaSchema.parse(backfillSchema(legacyMeta()));
        expect(migrated.observability).toBe(true);
        expect(migrated.tls).toBe(true);
        expect(migrated.seeded).toBe(false);
        expect(migrated.prNumber).toBeNull();
    });
});
