import { test } from "@japa/runner";
import vine, { errors } from "@vinejs/vine";

import { filterRule, sortRule } from "#lib/table_view/validators";
import type { TableViewColumn } from "#lib/table_view/types";

/**
 * Pure grammar coverage for the TableView VineJS rules — no model, no DB. We construct a small
 * Map of `TableViewColumn` declarations spanning every column-type bucket the runtime supports
 * and assert every accept/reject path.
 *
 * Use the bare `filterRule({ fields }).optional()` shape to bypass `createTableView` entirely
 * here — the schema-builder bridge is exercised separately in `runtime.spec.ts`.
 */

const fields = new Map<string, TableViewColumn>([
    ["id", { type: "bigint" }],
    ["status", { type: "enum", values: ["pending", "paid", "completed"] }],
    ["total", { type: "bigint" }],
    ["title", { type: "string" }],
    ["created_at", { type: "datetime" }],
    ["is_active", { type: "boolean" }],
    /** Filter-only — orderable is irrelevant for the filter rule. */
    ["customer_id", { type: "bigint" }],
]);

const orderable = new Set(["id", "status", "total", "created_at"]);

function compileFilter() {
    return vine.compile(
        vine.object({
            filter: vine.any().optional().use(filterRule({ fields })),
        }),
    );
}

function compileFilterOr() {
    return vine.compile(
        vine.object({
            filterOr: vine.any().optional().use(filterRule({ fields })),
        }),
    );
}

function compileSort() {
    return vine.compile(
        vine.object({
            sort: vine
                .any()
                .optional()
                .use(
                    sortRule({
                        fields: orderable,
                        defaultSort: [
                            ["created_at", "desc"],
                            ["id", "desc"],
                        ],
                    }),
                ),
        }),
    );
}

async function assertValidationError(promise: Promise<unknown>, includes: string) {
    try {
        await promise;
        throw new Error(`Expected validation error containing "${includes}" but resolved`);
    } catch (err) {
        if (err instanceof errors.E_VALIDATION_ERROR) {
            const messages = err.messages
                .map((m: { message: string }) => m.message)
                .join(" | ");
            if (!messages.includes(includes)) {
                throw new Error(`Expected error to include "${includes}", got: ${messages}`);
            }
            return;
        }
        throw err;
    }
}

test.group("table_view validators / filter — happy path", () => {
    test("mutates absent filter to empty object", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({});
        assert.deepEqual(result.filter, {});
    });

    test("accepts shorthand `field:value` as eq", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "status:paid" });
        assert.deepEqual(result.filter, {
            status: { field: "status", op: "eq", value: "paid" },
        });
    });

    test("accepts explicit `field:op:value`", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "status:neq:paid" });
        assert.deepEqual(result.filter, {
            status: { field: "status", op: "neq", value: "paid" },
        });
    });

    test("accepts void ops without a value", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: ["created_at:isnull", "title:notnull"] });
        assert.deepEqual(result.filter, {
            created_at: { field: "created_at", op: "isnull", value: null },
            title: { field: "title", op: "notnull", value: null },
        });
    });

    test("accepts `field:isnull` via the two-part shorthand", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "created_at:isnull" });
        assert.deepEqual(result.filter.created_at, { field: "created_at", op: "isnull", value: null });
    });

    test("coerces numeric strings to numbers", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "total:gte:1000" });
        assert.deepEqual(result.filter.total, { field: "total", op: "gte", value: 1000 });
    });

    test("coerces booleans to booleans", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "is_active:eq:true" });
        assert.deepEqual(result.filter.is_active, { field: "is_active", op: "eq", value: true });
    });

    test("coerces `null` literal", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "customer_id:eq:null" });
        assert.deepEqual(result.filter.customer_id, { field: "customer_id", op: "eq", value: null });
    });

    test("parses `between` as a length-2 array", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "total:between:1000,5000" });
        assert.deepEqual(result.filter.total, { field: "total", op: "between", value: [1000, 5000] });
    });

    test("parses `in` as an array preserving each token's coerced type", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "status:in:pending,paid,completed" });
        assert.deepEqual(result.filter.status, {
            field: "status",
            op: "in",
            value: ["pending", "paid", "completed"],
        });
    });

    test("parses substring operators with %wildcard% intact", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "title:ilike:%draft%" });
        assert.deepEqual(result.filter.title, { field: "title", op: "ilike", value: "%draft%" });
    });

    test("uppercase operator tokens parse same as lowercase", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "total:GTE:1000" });
        assert.equal(result.filter.total?.op, "gte");
    });

    test("accepts an array of constraints across multiple fields", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({
            filter: ["status:eq:paid", "total:gte:1000", "created_at:between:2026-01-01,2026-05-26"],
        });
        assert.lengthOf(Object.keys(result.filter), 3);
        assert.equal(result.filter.status?.value, "paid");
        assert.equal(result.filter.total?.value, 1000);
        assert.deepEqual(result.filter.created_at?.value, ["2026-01-01", "2026-05-26"]);
    });

    test("URL-decodes the value slot before coercing", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: "title:ilike:%25hello%20world%25" });
        assert.equal(result.filter.title?.value, "%hello world%");
    });

    test("strips surrounding double-quotes from a token", async ({ assert }) => {
        const v = compileFilter();
        const result = await v.validate({ filter: '"status:eq:paid"' });
        assert.equal(result.filter.status?.value, "paid");
    });
});

test.group("table_view validators / filter — rejection paths", () => {
    test("rejects an unknown field", async () => {
        await assertValidationError(compileFilter().validate({ filter: "evil:eq:1" }), "is not allowed");
    });

    test("rejects an unknown operator", async () => {
        await assertValidationError(compileFilter().validate({ filter: "status:wat:paid" }), "Invalid operator");
    });

    test("rejects an operator not allowed on the column type", async () => {
        /** datetime doesn't support `like`. */
        await assertValidationError(compileFilter().validate({ filter: "created_at:like:foo" }), 'not allowed on field "created_at"');
    });

    test("rejects a value-bearing op with no value", async () => {
        await assertValidationError(compileFilter().validate({ filter: "status:eq:" }), "requires a value");
    });

    test("rejects between with one value", async () => {
        await assertValidationError(
            compileFilter().validate({ filter: "total:between:1000" }),
            "exactly two comma-separated values",
        );
    });

    test("rejects between with three values", async () => {
        await assertValidationError(
            compileFilter().validate({ filter: "total:between:1,2,3" }),
            "exactly two comma-separated values",
        );
    });

    test("rejects in with empty list", async () => {
        await assertValidationError(compileFilter().validate({ filter: "status:in:" }), "non-empty");
    });

    test("rejects a void op with a value", async () => {
        await assertValidationError(compileFilter().validate({ filter: "status:isnull:foo" }), "does not accept a value");
    });

    test("rejects duplicate constraints on the same field in one group", async () => {
        await assertValidationError(
            compileFilter().validate({ filter: ["status:eq:paid", "status:eq:pending"] }),
            "already has a filter constraint",
        );
    });

    test("rejects a fully malformed expression", async () => {
        await assertValidationError(compileFilter().validate({ filter: "garbage" }), "needs an operator or value");
    });

    test("filterOr enforces the same rules independently of filter", async () => {
        await assertValidationError(compileFilterOr().validate({ filterOr: "evil:eq:1" }), "is not allowed");
    });
});

test.group("table_view validators / sort", () => {
    test("applies the default sort when wire array is absent", async ({ assert }) => {
        const result = await compileSort().validate({});
        assert.deepEqual(result.sort, {
            created_at: { field: "created_at", dir: "desc" },
            id: { field: "id", dir: "desc" },
        });
    });

    test("accepts case-insensitive `asc` and `desc`", async ({ assert }) => {
        const result = await compileSort().validate({ sort: ["status:ASC", "total:Desc"] });
        assert.equal(result.sort.status?.dir, "asc");
        assert.equal(result.sort.total?.dir, "desc");
    });

    test("rejects non-orderable field", async () => {
        await assertValidationError(compileSort().validate({ sort: "customer_id:asc" }), "is not allowed");
    });

    test("rejects unknown direction", async () => {
        await assertValidationError(compileSort().validate({ sort: "status:nope" }), "Invalid sort direction");
    });

    test("rejects duplicate sort entries on the same field", async () => {
        await assertValidationError(
            compileSort().validate({ sort: ["status:asc", "status:desc"] }),
            "already has a sort constraint",
        );
    });

    test("returns empty map when the wire value is explicitly empty", async ({ assert }) => {
        const result = await compileSort().validate({ sort: "" });
        assert.deepEqual(result.sort, {
            created_at: { field: "created_at", dir: "desc" },
            id: { field: "id", dir: "desc" },
        });
    });
});
