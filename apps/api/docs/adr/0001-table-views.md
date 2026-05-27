# ADR 0001 — Unified TableView query language

- **Status:** Proposed (awaiting sign-off on §6 decisions before implementation begins)
- **Date:** 2026-05-27
- **Spin / PR:** `spin/table-views` → PR #49 (draft, ADR-only at this point)
- **Owners:** API + admin
- **Reference:** [`technance-backend/packages/typeorm/src/table-view/`](../../../../inf1nite-lo0p/technance-backend/packages/typeorm/src/table-view/)

---

## 1. Context

Every paginated list endpoint in `apps/api` today hand-rolls its own filter / sort / pagination plumbing. The shape is consistent within a single endpoint but differs across endpoints: the admin orders list reads `?status=&customer_id=&source=a,b&payment=a,b&country=a,b&search=&created=before:2025-Q4&sort=-date`, the customers list reads a different set of ad-hoc keys (`role=&tab=&statuses=a,b&opt_in_email=true&order_count_min=…`), the products list reads yet another (`status=&category=&stock_level=…&search=…`). Each one ships its own VineJS validator under `app/validators/admin/`, its own `parseSort` helper in the controller, and its own `query.where(...)` chain driven by query-param keys.

The frontend mirrors the asymmetry. `useDataTable` in `apps/admin/src/components/ui/data-grid/use-data-table.ts` owns a generic facet/toggle/dateFacet model URL-synced via `nuqs`, but each list page maps that model to the endpoint's bespoke param names by hand. The date-picker primitive that just shipped goes one level further: its `legacyParamKeys` config explicitly mirrors a unified `?created=before:Q4` chip back to a per-endpoint `created_after=&created_before=` pair so unmigrated endpoints keep working.

The technance-backend `table-view` package (TypeORM-based) solved the same problem in a sister project. It exposes a single grammar (`filter[]=field:op:value`, `filterOr[]=…`, `sort[]=field:dir`), enforces a per-column operator-validity matrix at validation time, returns 422 with precise per-field errors, gives the consumer back a typed `{ data, meta }`, and supports controller-supplied scope overrides (`{ filter: { ownerUserId: { op: 'eq', value: userId } } }`) so a tenant-scope rule can't be bypassed from the URL. It is the closest thing to a known-good answer for this shape in our wider codebase.

This ADR translates that grammar onto **Lucid 22 / AdonisJS 7**, and commits the rollout that retires every per-list validator and controller filter chain in the repo.

## 2. Goals

1. **One grammar for every list endpoint.** Operators move between admin pages without re-learning a URL syntax. Authors of new list endpoints learn one pattern, not N.
2. **Type-safe end to end.** The set of filterable / orderable / sortable fields per view is a TypeScript-checked const array; the parsed query is inferred from the view; the controller pulls the right shape into the right call.
3. **Validation, not silent drop.** Disallowed operators on a column type return `422` with a precise per-field error message. No "we ignored your filter because the column type didn't support it" surprises.
4. **Same wire format on both ends.** The admin client serializes a `TableViewQuery` to the URL; the server's VineJS rule parses it back. Round-trip identity is testable.
5. **Spec-driven.** Every migrated endpoint references the same shared OpenAPI `filter[]` / `filterOr[]` / `sort[]` parameter components. `node ace check:api-docs` + `response.assertAgainstApiSpec()` enforce the contract.
6. **No legacy bridges.** Old per-list query params (`?source=&payment=&country=&created=before:…`) stop being accepted at the same commit they're replaced. Old URLs return 422. There is no parallel-write window — the user has explicitly stated "no legacy".

## 3. Non-goals (v1)

- Multi-level relation filtering (e.g. `customer.country.code`). The technance generic gymnastics around `FlattenRelationFilterables<T>` cost more than they pay for here today; revisit when a real second-level need appears.
- Aggregate / having-clause filters (e.g. customers' "big spenders" 90th-percentile tab). These remain endpoint-specific scopes applied via the controller's pre-built builder, not user-supplied URL filters.
- Tab-based discrete branches (orders' `status` tab strip, customers' `tab=any|account|guest|big|new|inactive|no_address|trashed`). These are pre-set facets the operator picks from a tab UI, not free-form filters. They continue to map to controller-side scopes. The grammar handles the simple cases (`status:eq:processing`) — bespoke tabs stay bespoke.
- Sub-resource scoping (`/orders/:order_id/notes` filtering against the `notes` table). The parent id stays in the route path, enforced at the route binding. TableView only sees the post-scope builder.
- Removing the date-picker primitive's grammar. The picker stays; only the URL representation changes. See §8.
- A full-text search operator. `search:foo` is not a TableView field — when an endpoint exposes free-text search, it stays an endpoint-level param outside the TableView envelope. Operators don't expect `:ilike:` semantics on a search box.

## 4. The wire surface (frozen)

Adopt the technance surface verbatim — DX consistency across our wider codebase outranks any minor cleverness:

```
GET /resource
    ?page=2
    &limit=50
    &sort[]=created_at:desc
    &sort[]=id:asc
    &filter[]=status:eq:processing
    &filter[]=created_at:between:2026-01-01,2026-05-26
    &filter[]=customer.email:ilike:%@calibra.dev
    &filterOr[]=tags:in:vip,whale
    &filterOr[]=lifetime_spend:gte:10000000
```

- `filter[]` joins with AND. `filterOr[]` joins with OR. Combined: `(AND clauses) AND (OR clauses)`.
- `field:value` is shorthand for `field:eq:value`.
- Void ops without a value: `created_at:isnull`, `description:notnull`.
- Relation fields use dot notation: `customer.email:ilike:foo%` — single level only in v1.
- Sort direction case-insensitive.
- All values URL-decoded server-side before parsing.
- Pagination keys: `page` (default `1`, min `1`) + `limit` (default `20`, min `1`, max `100`). The names `page` + `limit` come from technance; this is a small departure from the current `perPage` key — addressed in §8 (no legacy).

### 4.1 Operator catalogue + type-validity matrix

Same 19 ops as technance, same type matrix:

| Category   | Operators                                              |
|------------|--------------------------------------------------------|
| equality   | `eq`, `neq`                                            |
| ordering   | `gt`, `gte`, `lt`, `lte`                               |
| substring  | `like`, `ilike`, `nlike`, `nilike`                     |
| contains   | `inc`, `iinc`, `ninc`, `niinc`                         |
| set        | `in`, `nin`                                            |
| range      | `between`                                              |
| null       | `isnull`, `notnull` (void — no value)                  |

Type validity:

| Column type              | Allowed ops                                                                  |
|--------------------------|------------------------------------------------------------------------------|
| `boolean`                | `eq`, `neq`, `isnull`, `notnull`                                             |
| `number` / `bigint` / `decimal` | `eq`, `neq`, `isnull`, `notnull`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `between` |
| `datetime` / `date`      | `eq`, `neq`, `isnull`, `notnull`, `gt`, `gte`, `lt`, `lte`, `between`        |
| `string` / `text` / `uuid` | universal + `like`, `ilike`, `nlike`, `nilike`, `inc`, `iinc`, `ninc`, `niinc`, `in`, `nin`, `between` |
| `enum`                   | `eq`, `neq`, `isnull`, `notnull`, `in`, `nin`                                |
| (unknown)                | universal only (`eq`, `neq`, `isnull`, `notnull`)                            |

The matrix is enforced at validation time (not silently dropped at runtime) and returns 422 with a precise per-field error message.

### 4.2 Response envelope (no change)

```ts
{ data: T[], meta: { page: number; perPage: number; total: number; lastPage: number } }
```

Identical to today's `Transformer.paginate(paginator)` output and the SDK's `Paginated<T>`. Don't introduce a parallel shape.

## 5. Lucid-shaped design

Where TypeORM and Lucid diverge, the design has to diverge with them.

### 5.1 Module layout (server side)

```
apps/api/app/lib/table_view/
├── create_table_view.ts   # createTableView({...}) — primary entry point
├── runtime.ts             # run() implementation + clause builders
├── validators.ts          # filterRule / sortRule (VineJS) + parsers
├── constants.ts           # operator catalogue + type→op matrix
├── types.ts               # TableViewConfig, ParsedTableViewQuery, InferTableViewQuery, ...
└── index.ts               # public surface re-exports
```

Imports via the existing `#table_view/*` namespace; add to `package.json#imports`.

### 5.2 Public surface

```ts
import { createTableView } from "#table_view/create_table_view";
import type { InferTableViewQuery } from "#table_view/types";

export const adminOrdersView = createTableView({
    model: Order,
    columns: {
        id:                        { type: "bigint",   filterable: true, orderable: true },
        order_number:              { type: "bigint",   filterable: true, orderable: true },
        status:                    { type: "enum",     filterable: true, orderable: true, values: ORDER_STATUS_VALUES },
        customer_id:               { type: "bigint",   filterable: true, orderable: false },
        created_via:               { type: "string",   filterable: true, orderable: false },
        payment_method_code_snapshot: { type: "string", filterable: true, orderable: false },
        billing_email:             { type: "string",   filterable: true, orderable: false },
        created_at:                { type: "datetime", filterable: true, orderable: true },
        updated_at:                { type: "datetime", filterable: false, orderable: true },
        grand_total:               { type: "bigint",   filterable: true, orderable: true },
        date_paid_at:              { type: "datetime", filterable: true, orderable: true },
        date_completed_at:         { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["created_at", "desc"], ["id", "desc"]],
});

export type AdminOrdersViewQuery = InferTableViewQuery<typeof adminOrdersView>;
```

- `model` is the Lucid model class (`Order`, not a repository).
- `columns` is a const-typed object map: keys are `keyof Model & string`, values declare type + capabilities. `type: "enum"` accepts an extra `values: readonly string[]` for the enum range (used to surface useful error messages, not enforced as a value validator — that's a column constraint at the DB).
- `defaultSort` and the rest match technance's API exactly.

The validator wraps the view's schema:

```ts
// apps/api/app/validators/admin/order_validator.ts
import { adminOrdersView } from "#table_views/admin/orders";

export const adminOrderListValidator = vine.compile(adminOrdersView.schema);
```

The controller:

```ts
async index(ctx: HttpContext) {
    const query = await ctx.request.validateUsing(adminOrderListValidator);
    const builder = Order.query()
        .whereNull("orders.deleted_at")           // tenant scope / soft-delete — controller's choice
        .preload("lineItems")
        .preload("couponLines");
    const { data, meta } = await adminOrdersView.run(builder, query);
    return {
        data: data.map((o) => new OrderTransformer(o).forList()),
        meta,
    };
}
```

### 5.3 Column-type metadata — DECISION POINT

(See §6.1 below for the explicit ask.) **Recommended: hand-declared per view (option 1).**

Why: Lucid 22's `@column()` decorator doesn't carry the DB type at runtime. `model.$columnsDefinitions` carries `serializeAs`, `columnName`, and a `meta` object — for `@column.dateTime()` columns the `meta.type === 'datetime'` is recoverable, but everything else collapses into "generic column" with no string/number/boolean distinction. The TS type annotation on the class field (`declare grandTotal: bigint | number`) is erased at runtime.

The alternatives are: (a) parse the generated `database/schema.ts` at module load to recover the TS annotations (a build-time hack, brittle against the generator's format); (b) reflect off the Postgres information schema at startup (an extra round-trip per process, awkward in tests). Both cost more than they save. Hand-declared is one extra const per view; the model already has the type information in source, the duplication is a const → const map. Type-checked against the model's property keys so columns can't drift silently.

### 5.4 `view.run` signature

```ts
type TableViewRun<View> = <TPayload>(
    builder: ModelQueryBuilderContract<typeof View.model>,
    parsedQuery: InferTableViewQuery<View>,
    options?: TableViewRunOptions,
) => Promise<{ data: TPayload[]; meta: PaginationMeta }>;
```

- The **builder is supplied by the caller**, pre-attached with whatever scopes belong to the controller (soft-delete, tenant id, role-gated visibility, preloads). The view never owns authorisation — that's the controller's job. The view applies the operator-supplied predicates *on top of* the pre-scoped builder.
- `options.filter` / `options.filterOr` / `options.sort` override entries are layered on the same way technance does — they bypass the filterable/orderable whitelist for trusted controller-supplied scopes (e.g. `{ filter: { ownerUserId: { op: 'eq', value: userId } } }` on the account-orders endpoint). The Vine schema cannot validate these because they aren't in the URL; they exist for `run()` only.

### 5.5 Pagination

Use Lucid's `.paginate(page, perPage)` directly. The paginator returns `currentPage`, `lastPage`, `total`, `perPage`. Wrap to our `PaginationMeta` shape inside the view so the controller doesn't double-handle it.

Per-page is `limit` on the URL (technance grammar) but `perPage` in the response envelope (existing API contract). The mismatch is intentional and small — the URL key matches the wider table-view ecosystem; the response envelope key stays back-compat with everything that already consumes `Paginated<T>`.

### 5.6 Relations (v1 = one level)

For each declared filterable / orderable relation field, `run()`:

- Calls `query.preload(relationKey)` for the response shape.
- For filtering on a relation column, **joins** rather than `whereHas` — `.join('customers', 'customers.id', 'orders.customer_id').where('customers.email', 'ILIKE', '%@calibra.dev')`. Single SQL statement, no N+1. The join is added at most once per relation regardless of how many filters reference it.

Multi-level relations (`customer.country.code`) are deferred to v2 — call out in the README, throw with a clear "not supported in v1" error if a config tries to declare one.

### 5.7 i18n

VineJS error messages live in `resources/lang/{en,fa}/messages.json` under a new `table_view.*` namespace (e.g. `table_view.invalid_operator`, `table_view.operator_not_allowed`, `table_view.between_requires_two`, `table_view.field_not_filterable`, `table_view.unknown_field`). No hard-coded English strings inside the rule body.

## 6. Decisions for user sign-off

The task's §9 enumerates five questions that need explicit sign-off before implementation. Each is restated here with the recommendation embedded.

### 6.1 Column-type metadata source

> Option (1) hand-declared per view, (2) `$columnsDefinitions` introspection + supplemental annotation, or (3) parse generated `database/schema.ts`?

**Recommended: (1) hand-declared.** See §5.3 for the reasoning. The duplication is one const per view and is type-checked against the model's property keys. We are not buying enough back from (2) or (3) to justify the extra moving parts.

### 6.2 Relation depth in v1

> One level only, or eat the multi-level type acrobatics now?

**Recommended: one level.** A single `customer.email` style join covers every list endpoint currently in `apps/api`. Multi-level (`customer.country.code`) would need the FlattenRelation generic gymnastics from technance and a real join-graph builder for the Lucid runtime — both for zero current consumers. Defer to v2; throw with a clear message if a config tries.

### 6.3 `useDataTable` migration shape

> Keep the current outward API (consumers call `setFacetValues`, `setSort`, `dateFacetValues`) and let the hook internalise a TableView model under the hood? Or break to a new `useTableView` hook that list pages absorb in the migration commit?

**Recommended: clean break to `useTableView`.** The current hook is built around a "list of facets + list of toggles + list of dateFacets" mental model that doesn't map cleanly onto a unified `filter[]` array. Forcing the existing surface to internally serialise to the new grammar would mean every page still configures three separate prop arrays for what is now one concept. Cleaner to introduce `useTableView<TConfig>({ id, fields })` whose state is one `TableViewQuery` object, and migrate consumers one page at a time. The migration commit per resource family touches the page anyway; absorbing a renamed hook is a small additional churn cost for a much simpler hook API afterwards.

### 6.4 Allowed-field doc strategy on OpenAPI

> Per-endpoint allowed fields listed in the param `description` (operator-readable) or via `x-table-view-fields` (machine-readable)?

**Recommended: both, generated from the view config.** A small Ace command (`node ace tableview:dump`) emits the field list per view at build time, used by the docs bundler to fill both the human-readable `description` and a `x-calibra-table-view-fields` extension on the param. Operators see "Filterable: id, order_number, status, customer_id, …" in the rendered docs; tooling can also read the machine field. Single source of truth (the view config) drives both.

### 6.5 `limit` cap

> Keep at 100, or raise for exports?

**Recommended: keep at 100.** Exports do not use the list endpoint with `?limit=10000`. They use the dedicated `product_exports` / `customer_exports` flow which already streams from a different code path. A higher cap on the list endpoint encourages accidentally-expensive admin requests. If a future use case needs >100, raise it for that endpoint only via an override on its view config.

## 7. The migration — what ships under this design

Every list endpoint in `apps/api` migrates, and every admin list page that calls one migrates with it. The audit identified 25–28 controllers and ~15 admin pages. The full inventory and per-endpoint contract details live in the PR's task tracker, not this ADR.

The execution shape:

1. Build the primitive + unit tests. Green before any endpoint moves.
2. Build the FE primitive + unit tests. Green before any page moves.
3. Migrate **orders top-to-bottom** as the vertical-slice proof — server view + validator, OpenAPI YAML, SDK regen, admin page (which exercises the date-picker integration from §8), Japa + Vitest + Playwright. Ship that as one commit the user can sanity-check end-to-end.
4. Then migrate the rest in resource-family-sized commits (customers, products + taxonomies, media + reviews, refunds + payments, account-side).
5. Spec drift assertions + cleaned `known-drift` file.
6. Docs.

**Hard rule, restated:** every migrated endpoint stops accepting its old per-list query params at the same commit that adds `filter[]` support. No parallel-write window.

## 8. Date-picker integration

The picker primitive at `apps/admin/src/components/ui/date-picker/` already emits values like `before:2026-05-26`, `in:2026-Q4`, `within:2026-05-01..2026-05-07`. Today it serialises those to a single URL param the server's `parseDateFilter` consumes.

Under TableView, the picker stays as the UI; only the URL representation changes. A small `dateFilterValueToTableViewFilters(value, fieldName)` adapter on the client maps:

```
before:2025-05-26  →  [{ field: 'created_at', op: 'lt',  value: '2025-05-26' }]
after:2025-05-26   →  [{ field: 'created_at', op: 'gt',  value: '2025-05-26' }]
in:2025-Q4         →  [{ field: 'created_at', op: 'between', value: ['2025-10-01','2025-12-31'] }]
within:a..b        →  [{ field: 'created_at', op: 'between', value: [a, b] }]
```

Period values (`Q4`, `H1`, `2025`) get expanded to Gregorian boundaries client-side. Jalali years (< 1700) convert client-side using `@mohammadxali/jalaali-js` (already in the catalog). The server-side parser is removed; the server only ever sees `filter[]=created_at:between:YYYY-MM-DD,YYYY-MM-DD` and stays calendar-agnostic.

The `legacyParamKeys` config on `DateFacetDef` is removed at the same commit that drops the per-endpoint `created_after` / `created_before` params from each migrated endpoint.

## 9. Scope-boundary clarifications

A few things the design **explicitly does** to head off confusion mid-migration:

- **Free-text search stays out of the filter array.** Endpoints that take a `search` box keep it as an endpoint-level top-level param (`?q=foo`), validated alongside the TableView schema, not as `search:ilike:%foo%` in `filter[]`. Search semantics across multiple columns aren't a single-field predicate.
- **Bouncer authorisation stays in the controller.** TableView never enforces row-level permissions. The controller's pre-built builder is the authorisation surface; the view applies operator filters on top.
- **Soft-delete is the controller's responsibility.** The view does not auto-add `whereNull('deleted_at')`. Controllers chain `query.whereNull('orders.deleted_at')` before passing to `view.run()`, exactly the way they do today. A `trashed` tab still resolves to a controller-side `whereNotNull('deleted_at')` scope, not a TableView filter.
- **The primitive lives in `apps/api/app/lib/table_view/` and `apps/admin/src/lib/table-view/`.** Not in `packages/sdk`. The SDK only knows the wire shape via OpenAPI codegen.

## 10. Risks + open questions

- **OpenAPI bundler will need to teach itself the shared TableView parameter components.** The bundler today inlines each path file; we'll add a `common/components/parameters/table-view/` group mirroring technance's layout. Risk: bundler chokes on a deeply-nested `$ref` pattern. Mitigation: validated against one path first (`admin/orders.get.yaml`) before mass-applying.
- **Locale forwarding in error messages must round-trip.** The Vine rule pulls translations through Adonis's i18n provider; tests will assert both `en` and `fa` error strings. Risk: the `field.report` API doesn't directly hook the i18n provider — we may need to look up `ctx.i18n.t(...)` at validation time. Will spike on this in step 1.
- **`page` vs `perPage` URL key inconsistency.** The wire grammar says `limit`; the response envelope says `perPage`. The admin client must translate one direction; the SDK type for the param is `limit`, the response type for the meta is `perPage`. Cosmetic, but a place where a contributor could conflate the two. Will call out in the README.
- **`vine.any().use(filterRule(...))` does not give us pre-validated parsed types in TS inference automatically.** The technance schema returns `ParsedTableViewQuery<Filterables, Orderables>` via a heavy cast at the schema construction site. We will inherit that cast. The runtime is correct; the TS surface for consumers of `view.schema` is what the cast enforces.
- **Existing `useDataTable` callsites without a clean break would be a slower roll than a per-page migration commit.** §6.3 recommends the clean break to absorb that churn in the per-resource migration commits, not separately.

## 11. References

- [`technance-backend/packages/typeorm/src/table-view/`](../../../../inf1nite-lo0p/technance-backend/packages/typeorm/src/table-view/) — runtime + types + validators + constants.
- [`technance-backend/apps/core/app/table-views/affiliate-codes.ts`](../../../../inf1nite-lo0p/technance-backend/apps/core/app/table-views/affiliate-codes.ts) — minimal consumer.
- [`technance-backend/apps/core/app/services/affiliate-codes.ts#userAffiliateCodesList`](../../../../inf1nite-lo0p/technance-backend/apps/core/app/services/affiliate-codes.ts) — tenant-scope override pattern.
- [`technance-backend/apps/core/app/table-views/referrals.ts`](../../../../inf1nite-lo0p/technance-backend/apps/core/app/table-views/referrals.ts) — relations example.
- [`technance-backend/docs/api/reference/openapi/common/components/parameters/table-view/`](../../../../inf1nite-lo0p/technance-backend/docs/api/reference/openapi/common/components/parameters/table-view/) — OpenAPI param shapes.
- [`apps/admin/src/components/ui/date-picker/README.md`](../../../admin/src/components/ui/date-picker/README.md) — the picker primitive this design integrates with.
- [`apps/api/AGENTS.md`](../../AGENTS.md) — Lucid 22, VineJS 4, Japa, `assertAgainstApiSpec`, `check:api-docs`, response envelope.
