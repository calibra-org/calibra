import { test } from "@japa/runner";

import { createTableView } from "#lib/table_view/create_table_view";
import { applyTableView, buildFieldIndex } from "#lib/table_view/runtime";
import Customer from "#models/customer";
import User from "#models/user";

/**
 * Runtime coverage for the TableView clause builders. We construct a view against the real
 * `Customer` Lucid model so the SQL is genuinely shaped by the Lucid query builder + Postgres
 * dialect — but we never call `.paginate()`. Instead we lean on `applyTableView()` to layer the
 * predicates and inspect the generated SQL via `.toSQL()`. Faster than a full integration spec
 * (no row inserts, no transactions) and asserts the exact contract: each op maps to the right
 * Knex WHERE call with the right column.
 */

const view = createTableView({
    model: Customer,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        first_name: { type: "string", filterable: true, orderable: true },
        is_paying_customer: { type: "boolean", filterable: true, orderable: false },
        country_default: { type: "string", filterable: true, orderable: true },
        status: { type: "enum", values: ["active", "inactive"], filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
        deleted_at: { type: "datetime", filterable: true, orderable: false },
    },
    relations: {
        user: {
            columns: {
                email: { type: "string", filterable: true, orderable: true },
            },
        },
    },
    defaultSort: [["created_at", "desc"]],
});

const fieldIndex = buildFieldIndex(view.config);

function buildSql(parsed: Parameters<typeof applyTableView>[3], options?: Parameters<typeof applyTableView>[4]) {
    const builder = Customer.query();
    const ready = applyTableView(view.config, fieldIndex, builder, parsed, options);
    return ready.toQuery();
}

function emptyQuery(overrides: Partial<Parameters<typeof applyTableView>[3]> = {}) {
    return {
        page: 1,
        limit: 20,
        filter: {},
        filterOr: {},
        sort: {},
        ...overrides,
    } as Parameters<typeof applyTableView>[3];
}

test.group("table_view runtime / single-op SQL shape", () => {
    test("eq → `=`", ({ assert }) => {
        const sql = buildSql(emptyQuery({ filter: { status: { field: "status", op: "eq", value: "active" } } }));
        assert.include(sql, `"customers"."status" = 'active'`);
    });

    test("neq → `!=`", ({ assert }) => {
        const sql = buildSql(emptyQuery({ filter: { status: { field: "status", op: "neq", value: "active" } } }));
        assert.include(sql, `"customers"."status" != 'active'`);
    });

    test("gt / gte / lt / lte", ({ assert }) => {
        assert.include(buildSql(emptyQuery({ filter: { id: { field: "id", op: "gt", value: 10 } } })), `"customers"."id" > 10`);
        assert.include(buildSql(emptyQuery({ filter: { id: { field: "id", op: "gte", value: 10 } } })), `"customers"."id" >= 10`);
        assert.include(buildSql(emptyQuery({ filter: { id: { field: "id", op: "lt", value: 10 } } })), `"customers"."id" < 10`);
        assert.include(buildSql(emptyQuery({ filter: { id: { field: "id", op: "lte", value: 10 } } })), `"customers"."id" <= 10`);
    });

    test("like / ilike pass the operand through verbatim", ({ assert }) => {
        const likeSql = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "like", value: "A%" } } }));
        assert.match(likeSql, /"customers"\."first_name" like 'A%'/i);
        const ilikeSql = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "ilike", value: "a%" } } }));
        assert.match(ilikeSql, /"customers"\."first_name" ilike 'a%'/i);
    });

    test("nlike / nilike negate via whereNot — Knex emits `not col like 'v'`", ({ assert }) => {
        const nlike = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "nlike", value: "A%" } } }));
        assert.match(nlike, /not\s+"customers"\."first_name" like 'A%'/i);
        const nilike = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "nilike", value: "a%" } } }));
        assert.match(nilike, /not\s+"customers"\."first_name" ilike 'a%'/i);
    });

    test("inc / iinc wrap the value with %…%", ({ assert }) => {
        const inc = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "inc", value: "li" } } }));
        assert.match(inc, /"customers"\."first_name" like '%li%'/i);
        const iinc = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "iinc", value: "li" } } }));
        assert.match(iinc, /"customers"\."first_name" ilike '%li%'/i);
    });

    test("ninc / niinc negate via whereNot — `not col like '%v%'`", ({ assert }) => {
        const ninc = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "ninc", value: "li" } } }));
        assert.match(ninc, /not\s+"customers"\."first_name" like '%li%'/i);
        const niinc = buildSql(emptyQuery({ filter: { first_name: { field: "first_name", op: "niinc", value: "li" } } }));
        assert.match(niinc, /not\s+"customers"\."first_name" ilike '%li%'/i);
    });

    test("in / nin → `IN (...)` / `NOT IN (...)`", ({ assert }) => {
        const inSql = buildSql(emptyQuery({ filter: { status: { field: "status", op: "in", value: ["active", "inactive"] } } }));
        assert.include(inSql, `"customers"."status" in ('active', 'inactive')`);
        const ninSql = buildSql(emptyQuery({ filter: { status: { field: "status", op: "nin", value: ["active", "inactive"] } } }));
        assert.include(ninSql, `"customers"."status" not in ('active', 'inactive')`);
    });

    test("between → `BETWEEN low AND high`", ({ assert }) => {
        const sql = buildSql(emptyQuery({ filter: { id: { field: "id", op: "between", value: [10, 100] } } }));
        assert.include(sql, `"customers"."id" between 10 and 100`);
    });

    test("isnull / notnull", ({ assert }) => {
        const isnull = buildSql(emptyQuery({ filter: { deleted_at: { field: "deleted_at", op: "isnull", value: null } } }));
        assert.include(isnull, `"customers"."deleted_at" is null`);
        const notnull = buildSql(emptyQuery({ filter: { deleted_at: { field: "deleted_at", op: "notnull", value: null } } }));
        assert.include(notnull, `"customers"."deleted_at" is not null`);
    });
});

test.group("table_view runtime / composition", () => {
    test("multiple `filter[]` entries AND together at top level", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                filter: {
                    status: { field: "status", op: "eq", value: "active" },
                    is_paying_customer: { field: "is_paying_customer", op: "eq", value: true },
                },
            }),
        );
        assert.include(sql, `"customers"."status" = 'active'`);
        assert.include(sql, `"customers"."is_paying_customer" = true`);
        assert.notInclude(sql, " or ");
    });

    test("`filterOr[]` entries OR together inside a grouped `where`", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                filterOr: {
                    status: { field: "status", op: "eq", value: "active" },
                    is_paying_customer: { field: "is_paying_customer", op: "eq", value: true },
                },
            }),
        );
        /** Knex wraps the OR group in parens; the first member of an `or where` group is still `where`. */
        assert.match(sql, /\(.*"customers"."status" = 'active'.*or.*"customers"."is_paying_customer" = true.*\)/i);
    });

    test("`filter` AND `filterOr` compose as `(AND clauses) AND (OR clauses)`", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                filter: { country_default: { field: "country_default", op: "eq", value: "IR" } },
                filterOr: {
                    status: { field: "status", op: "eq", value: "active" },
                    is_paying_customer: { field: "is_paying_customer", op: "eq", value: true },
                },
            }),
        );
        assert.include(sql, `"customers"."country_default" = 'IR'`);
        assert.match(sql, /\(.*"customers"."status" = 'active'.*or.*"customers"."is_paying_customer" = true.*\)/i);
    });

    test("default sort applies when no wire sort supplied", ({ assert }) => {
        const sql = buildSql(emptyQuery());
        assert.include(sql, `order by "customers"."created_at" desc`);
    });

    test("wire sort wins over default", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                sort: { id: { field: "id", dir: "asc" } },
            }),
        );
        assert.include(sql, `order by "customers"."id" asc`);
        assert.notInclude(sql, `order by "customers"."created_at"`);
    });

    test("multiple sort entries chain in the supplied order", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                sort: {
                    status: { field: "status", dir: "asc" },
                    id: { field: "id", dir: "desc" },
                },
            }),
        );
        assert.match(sql, /order by "customers"."status" asc,\s*"customers"."id" desc/);
    });
});

test.group("table_view runtime / overrides", () => {
    test("override.filter is applied even when the field is not in the column index", ({ assert }) => {
        const sql = buildSql(emptyQuery(), { filter: { tenant_id: { op: "eq", value: 42 } } });
        assert.include(sql, `"tenant_id" = 42`);
    });

    test("override.filter wins on conflict with a wire filter on the same field", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                filter: { status: { field: "status", op: "eq", value: "active" } },
            }),
            { filter: { status: { op: "eq", value: "FROZEN" } } },
        );
        assert.include(sql, `"customers"."status" = 'FROZEN'`);
        assert.notInclude(sql, `'active'`);
    });

    test("override.sort wins over wire sort on the same field", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                sort: { id: { field: "id", dir: "asc" } },
            }),
            { sort: { id: { dir: "desc" } } },
        );
        assert.include(sql, `order by "customers"."id" desc`);
    });
});

test.group("table_view runtime / relation joins", () => {
    test("filtering on a relation column adds the JOIN exactly once", ({ assert }) => {
        const sql = buildSql(
            emptyQuery({
                filter: {
                    "user.email": { field: "user.email", op: "ilike", value: "%@calibra.dev" },
                    /** Also adding a sort to confirm the same join is reused, not added twice. */
                },
                sort: { "user.email": { field: "user.email", dir: "asc" } },
            }),
        );
        assert.include(sql, `inner join "users"`);
        assert.match(sql, /"users"\."email" ilike '%@calibra\.dev'/i);
        assert.match(sql, /order by "users"\."email" asc/i);
        /** Exactly one join keyword in the SQL — second filter on the same relation must not double-add. */
        const matches = sql.match(/inner join "users"/g) ?? [];
        assert.equal(matches.length, 1);
    });
});

test.group("table_view runtime / module wiring", () => {
    test("View exposes allowedFields including relation paths, sorted", ({ assert }) => {
        assert.includeMembers([...view.allowedFields.filterable], ["id", "first_name", "status", "user.email"]);
        assert.includeMembers([...view.allowedFields.orderable], ["id", "first_name", "user.email"]);
        /** Sorted for stable consumer output. */
        const sorted = [...view.allowedFields.filterable].sort();
        assert.deepEqual([...view.allowedFields.filterable], sorted);
    });

    test("buildFieldIndex throws synchronously on an unknown relation key", ({ assert }) => {
        assert.throws(
            () =>
                createTableView({
                    model: User,
                    columns: { id: { type: "bigint" } },
                    relations: {
                        nope: { columns: { id: { type: "bigint" } } },
                    },
                }),
            /not found on model/,
        );
    });
});
