import { describe, expect, it } from "vitest";
import {
    hashToSlot,
    layoutFromBase,
    PORT_BASE,
    PORTS_PER_SLOT,
    ROLES,
    TOTAL_SLOTS,
} from "../src/core/ports";

/**
 * The port layout is a frozen, append-only contract: existing `.claude/spin/<slug>.json` metas
 * must keep resolving to the same containers. These tests pin the offsets so an accidental
 * reorder during a refactor fails loudly instead of silently shifting every spin's ports.
 */
describe("ports layout", () => {
    it("keeps the whole block inside the 13xxx range", () => {
        expect(TOTAL_SLOTS * PORTS_PER_SLOT).toBeLessThan(1000);
        const lastBase = PORT_BASE + (TOTAL_SLOTS - 1) * PORTS_PER_SLOT;
        expect(lastBase + PORTS_PER_SLOT - 1).toBeLessThan(14000);
    });

    it("freezes the role → offset table (append-only)", () => {
        /** If this fails, a role was reordered/inserted — that breaks existing spins. */
        expect([...ROLES]).toEqual([
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
        ]);
        expect(ROLES).toHaveLength(PORTS_PER_SLOT);
    });

    it("layoutFromBase assigns each role its frozen offset", () => {
        const base = 13044;
        const layout = layoutFromBase(base);
        ROLES.forEach((role, offset) => {
            expect(layout[role]).toBe(base + offset);
        });
        expect(layout.db).toBe(base);
        expect(layout.platform).toBe(base + 21);
    });
});

describe("hashToSlot", () => {
    it("is deterministic for a given key", () => {
        expect(hashToSlot("local")).toBe(hashToSlot("local"));
        expect(hashToSlot("my-feature")).toBe(hashToSlot("my-feature"));
    });

    it("stays within the slot range", () => {
        for (const key of ["local", "a-b", "feature-x", "zzz", "long-slug-name-here"]) {
            const slot = hashToSlot(key);
            expect(slot).toBeGreaterThanOrEqual(0);
            expect(slot).toBeLessThan(TOTAL_SLOTS);
        }
    });

    it("derives different bases for the nudge keys", () => {
        /** The allocator nudges with `<slug>#N`; those should generally land on other slots. */
        expect(hashToSlot("local")).not.toBe(hashToSlot("local#1"));
    });
});
