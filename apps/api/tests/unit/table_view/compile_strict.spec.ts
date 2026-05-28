import { test } from "@japa/runner";
import vine, { errors } from "@vinejs/vine";

import { createTableView } from "#lib/table_view/create_table_view";
import { STRICT_KEYS_RULE_NAME } from "#lib/table_view/validators";
import Customer from "#models/customer";

/**
 * Coverage for {@link TableView.compileStrict}. Each migrated endpoint adopts this entry point
 * because the contract is: any query key not in {`page`, `limit`, `filter`, `filterOr`, `sort`}
 * ∪ declared extras returns 422 with the `table_view.unknown_query_key` rule code.
 */

const view = createTableView({
    model: Customer,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        status: { type: "enum", values: ["active", "inactive"], filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["created_at", "desc"]],
});

test.group("table_view compileStrict / accepts the base wire keys", () => {
    test("empty query is accepted and yields the defaults", async ({ assert }) => {
        const v = view.compileStrict();
        const result = await v.validate({});
        assert.equal(result.page, 1);
        assert.equal(result.limit, 20);
        assert.deepEqual(result.filter, {});
        assert.deepEqual(result.filterOr, {});
    });

    test("accepts page, limit, filter, filterOr, sort", async ({ assert }) => {
        const v = view.compileStrict();
        const result = await v.validate({
            page: 2,
            limit: 10,
            filter: "status:eq:active",
            filterOr: "id:eq:1",
            sort: "id:asc",
        });
        assert.equal(result.page, 2);
        assert.equal(result.limit, 10);
        assert.deepEqual(result.filter.status, { field: "status", op: "eq", value: "active" });
    });
});

test.group("table_view compileStrict / extras", () => {
    test("accepts declared extras and types them via inference", async ({ assert }) => {
        const v = view.compileStrict({
            extras: {
                q: vine.string().trim().maxLength(120).optional(),
                trashed: vine.boolean().optional(),
            },
        });
        const result = await v.validate({ q: "alice", trashed: true });
        assert.equal(result.q, "alice");
        assert.equal(result.trashed, true);
    });

    test("rejects an extras-shape violation as a normal vine 422", async () => {
        const v = view.compileStrict({
            extras: {
                q: vine.string().trim().maxLength(3).optional(),
            },
        });
        try {
            await v.validate({ q: "way-too-long" });
            throw new Error("expected validation error");
        } catch (err) {
            if (!(err instanceof errors.E_VALIDATION_ERROR)) throw err;
            const messages = err.messages.map((m: { message: string }) => m.message).join(" | ");
            if (!/(maximum length|not be greater than|must be at most)/i.test(messages)) {
                throw new Error(`Unexpected messages: ${messages}`);
            }
        }
    });
});

test.group("table_view compileStrict / unknown-key rejection", () => {
    test("rejects an undeclared top-level key with the strict rule code", async () => {
        const v = view.compileStrict({ extras: { q: vine.string().optional() } });
        try {
            await v.validate({ q: "ok", evilParam: "1" });
            throw new Error("expected unknown-key rejection");
        } catch (err) {
            if (!(err instanceof errors.E_VALIDATION_ERROR)) throw err;
            const first = (err.messages as Array<{ message: string; rule: string; field: string }>)[0];
            if (first.rule !== STRICT_KEYS_RULE_NAME) {
                throw new Error(`Expected rule ${STRICT_KEYS_RULE_NAME}, got ${first.rule}`);
            }
            if (first.field !== "evilParam") {
                throw new Error(`Expected field "evilParam", got "${first.field}"`);
            }
        }
    });

    test("rejects legacy per-endpoint query keys (perPage, search, status) once the endpoint cuts over", async () => {
        const v = view.compileStrict();
        for (const legacyKey of ["perPage", "search", "status"]) {
            try {
                await v.validate({ [legacyKey]: "anything" });
                throw new Error(`Expected ${legacyKey} to be rejected by strict mode`);
            } catch (err) {
                if (!(err instanceof errors.E_VALIDATION_ERROR)) {
                    throw new Error(`Expected validation error for "${legacyKey}", got ${(err as Error).message}`);
                }
            }
        }
    });

    test("reports one violation per unknown key in a single 422", async ({ assert }) => {
        const v = view.compileStrict();
        try {
            await v.validate({ foo: 1, bar: 2, baz: 3 });
            throw new Error("expected validation error");
        } catch (err) {
            if (!(err instanceof errors.E_VALIDATION_ERROR)) throw err;
            const messages = err.messages as Array<{ field: string }>;
            assert.deepEqual(messages.map((m) => m.field).sort(), ["bar", "baz", "foo"]);
        }
    });
});

test.group("table_view compileStrict / defaultLimit override", () => {
    test("uses the endpoint's defaultLimit when limit is absent", async ({ assert }) => {
        const v = view.compileStrict({ defaultLimit: 100 });
        const result = await v.validate({});
        assert.equal(result.limit, 100);
    });

    test("the wire `limit` still wins over the endpoint's default", async ({ assert }) => {
        const v = view.compileStrict({ defaultLimit: 100 });
        const result = await v.validate({ limit: 5 });
        assert.equal(result.limit, 5);
    });
});

test.group("table_view compileStrict / maxLimit override", () => {
    test("default cap rejects limit=101 and accepts the 100 boundary", async ({ assert }) => {
        const v = view.compileStrict();
        const ok = await v.validate({ limit: 100 });
        assert.equal(ok.limit, 100);
        try {
            await v.validate({ limit: 101 });
            throw new Error("expected limit=101 to be rejected by the default cap");
        } catch (err) {
            if (!(err instanceof errors.E_VALIDATION_ERROR)) throw err;
            const messages = err.messages as Array<{ field: string }>;
            assert.include(
                messages.map((m) => m.field),
                "limit",
            );
        }
    });

    test("maxLimit:500 accepts limit=500 and rejects limit=501", async ({ assert }) => {
        const v = view.compileStrict({ maxLimit: 500 });
        const ok = await v.validate({ limit: 500 });
        assert.equal(ok.limit, 500);
        try {
            await v.validate({ limit: 501 });
            throw new Error("expected limit=501 to be rejected by maxLimit:500");
        } catch (err) {
            if (!(err instanceof errors.E_VALIDATION_ERROR)) throw err;
            const messages = err.messages as Array<{ field: string }>;
            assert.include(
                messages.map((m) => m.field),
                "limit",
            );
        }
    });

    test("maxLimit composes with defaultLimit independently", async ({ assert }) => {
        const v = view.compileStrict({ defaultLimit: 100, maxLimit: 500 });
        const absent = await v.validate({});
        assert.equal(absent.limit, 100);
        const explicit = await v.validate({ limit: 300 });
        assert.equal(explicit.limit, 300);
    });
});
