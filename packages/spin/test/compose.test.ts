import { describe, expect, it } from "vitest";
import { parseComposeJsonLines } from "../src/core/compose";

/**
 * `docker compose ps --format json` emits one object per line on most v2 builds and a single JSON
 * array on others; the parser must handle both and never throw on partial/garbage output.
 */
describe("parseComposeJsonLines", () => {
    it("parses newline-delimited objects (the common v2 shape)", () => {
        const out = `{"Name":"calibra-spin-demo-db-1","Service":"db","State":"running","Status":"Up 2m"}
{"Name":"calibra-spin-demo-redis-1","Service":"redis","State":"running","Status":"Up 2m"}`;
        const rows = parseComposeJsonLines(out);
        expect(rows).toHaveLength(2);
        expect(rows[0]?.Service).toBe("db");
        expect(rows[1]?.State).toBe("running");
    });

    it("parses a wrapped JSON array (alternate v2 shape)", () => {
        const out = `[{"Name":"x","Service":"caddy","State":"running","Status":"Up"}]`;
        expect(parseComposeJsonLines(out)).toHaveLength(1);
    });

    it("returns [] for empty output", () => {
        expect(parseComposeJsonLines("")).toEqual([]);
        expect(parseComposeJsonLines("   \n  ")).toEqual([]);
    });

    it("skips malformed lines rather than throwing", () => {
        const out = `{"Service":"db","State":"running","Name":"a","Status":"Up"}
not json
{"Service":"redis","State":"running","Name":"b","Status":"Up"}`;
        expect(parseComposeJsonLines(out)).toHaveLength(2);
    });
});
