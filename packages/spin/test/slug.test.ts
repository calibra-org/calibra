import { describe, expect, it } from "vitest";

import { assertSlug, composeProjectName, LOCAL_SLUG, validateSlug } from "../src/core/slug";

describe("validateSlug", () => {
    it("accepts well-formed kebab-case slugs", () => {
        for (const slug of ["my-feature", "abc", "fix-123", "a1b2c3", "feature-x-2"]) {
            expect(validateSlug(slug)).toEqual({ ok: true });
        }
    });

    it("rejects bad formats", () => {
        for (const slug of ["A", "ab", "-lead", "trail-", "with_underscore", "UPPER", "x".repeat(41), "has space"]) {
            expect(validateSlug(slug)).toEqual({ ok: false, reason: "invalid-format" });
        }
    });

    it("rejects reserved names including the in-place 'local' slug", () => {
        for (const slug of ["local", "spin", "default", "all", "none", "test"]) {
            expect(validateSlug(slug)).toEqual({ ok: false, reason: "reserved-name" });
        }
        expect(LOCAL_SLUG).toBe("local");
    });

    it("assertSlug throws with a helpful message", () => {
        expect(() => assertSlug("Bad_Slug")).toThrow(/invalid slug/);
        expect(() => assertSlug("local")).toThrow(/reserved slug/);
        expect(() => assertSlug("good-slug")).not.toThrow();
    });
});

describe("composeProjectName", () => {
    it("namespaces under calibra-spin-<slug> (the isolation primitive)", () => {
        expect(composeProjectName("local")).toBe("calibra-spin-local");
        expect(composeProjectName("my-feature")).toBe("calibra-spin-my-feature");
    });
});
