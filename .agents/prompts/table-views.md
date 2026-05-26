# Task — Unified Table-View query language for `apps/api` + `apps/admin`

> Run this in a **fresh session**. Don't carry context from the date-picker work over —
> that PR ships separately. This task is a deeper, repo-wide refactor and deserves its own
> spin.

You're going to design and build a declarative, type-safe **TableView** primitive on top of
**Lucid 22 / AdonisJS 7**, then migrate **every list endpoint in `apps/api`** to use it,
along with **every list page in `apps/admin`** that calls those endpoints. After this lands,
no list endpoint in this repo will hand-roll its own filter / sort / pagination plumbing.

---

## 0. Spin a fresh worktree

```sh
pnpm spin table-views
```

Don't start work on `main` or on the existing `spin/date-picker` branch. The output of
`pnpm spin doctor table-views --json` must report all services up before you code anything.

---

## 1. Required reading (do all of this BEFORE touching code)

### 1.1 Reference implementation — the technance-backend `table-view` package

Path: `~/inf1nite-lo0p/technance-backend/`

Read in this order; take notes:

1. `packages/typeorm/src/table-view/index.ts` — the runtime `run()` + clause builders.
2. `packages/typeorm/src/table-view/types.ts` — `TableViewConfig`, `ParsedTableViewQuery`,
   the relation-flattening generic gymnastics, the `InferTableViewQuery` helper, the
   `TableViewQueryOptions.filter` / `filterOr` / `sort` override surfaces.
3. `packages/typeorm/src/table-view/validators.ts` — the **filter string grammar**
   (`field`, `field:value` shorthand, `field:op:value`, value coercion, `between` /
   `in` arrays, void ops `isnull` / `notnull`), the Vine custom-rule pattern, type-aware
   op whitelisting, the safe-decode and quote-strip helpers.
4. `packages/typeorm/src/table-view/constants.ts` — operator catalogue, the **operator
   ↔ column-type validity matrix**.
5. `apps/core/app/table-views/affiliate-codes.ts` — the smallest real consumer (no
   relations).
6. `apps/core/app/services/affiliate-codes.ts:userAffiliateCodesList` — how a service
   uses `view.run(repo, viewQuery, { filter: { ownerUserId: { op: "eq", value: userId } } })`
   to apply a tenant-scope override that the operator can't bypass.
7. `apps/core/app/table-views/referrals.ts` — a view with relations.
8. `docs/api/reference/openapi/common/components/parameters/table-view/*.yaml` —
   the canonical OpenAPI param shapes (`filter[]`, `filterOr[]`, `sort[]`) and the regex
   `^[^:]+(?::[^:]+){1,2}$`.

After reading, write a short ADR (`apps/api/docs/adr/0001-table-views.md`) summarising
**what we keep verbatim, what we change, and why** before writing any code. The Lucid
side differs enough from TypeORM that a copy-paste port will produce something subtly
broken. The ADR is the place to think it through.

### 1.2 Our codebase

Read each `AGENTS.md` end-to-end:

- repo root `AGENTS.md` (load-bearing — i18n, scopes, dep rules, sub-agent rules).
- `apps/api/AGENTS.md` — Lucid 22 generated-schema, transformers, `#namespace/*`
  imports, `snake_case` filenames, VineJS, **mandatory Japa functional tests with
  `response.assertAgainstApiSpec()`**, the spec-drift toolchain
  (`node ace check:api-docs`).
- `apps/admin/AGENTS.md` — shadcn + Base UI, `apiServer()`, `lib/queries/`,
  `lib/server-repos.ts`, the same-origin admin proxy.
- `packages/sdk/AGENTS.md` — `openapi-fetch` typed client, codegen flow
  (`pnpm --filter @calibra/sdk codegen`).
- `apps/admin/src/components/ui/date-picker/README.md` — the date-filter UI primitive
  that just shipped. **You will integrate with it** — see §5 below.

Also skim:

- `apps/api/app/controllers/admin/orders_controller.ts` (current shape of a list
  endpoint with the now-removed `created` filter).
- `apps/api/app/controllers/admin/customers_controller.ts` (the heaviest list endpoint
  — 8+ filter dimensions, relation-style sub-filter for orders).
- `apps/admin/src/components/data-table/use-data-table.ts` (current URL-driven facet
  state) — this hook is going to become a thin shim over the new TableView client-side
  parser.

---

## 2. What you're building — the contract

### 2.1 The URL surface (frozen — don't bikeshed this)

Use the exact technance surface so anyone moving between projects keeps the same mental
model:

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

- `filter[]` joins with AND. `filterOr[]` joins with OR. When both present:
  `(AND clauses) AND (OR clauses)`.
- Shorthand `field:value` ≡ `field:eq:value`.
- Void ops without a value: `created_at:isnull`, `description:notnull`.
- Relation fields use dot notation: `customer.email:ilike:foo%`.
- Sort direction is case-insensitive (`asc` / `ASC`).
- All values URL-decoded server-side before parsing.

### 2.2 The operator catalogue + validity matrix

Same set as technance (`constants.ts` of the reference). Don't drop or add operators —
DX consistency across projects matters more than minor cleverness.

```
eq neq gt gte lt lte
like ilike nlike nilike inc iinc ninc niinc
in nin between
isnull notnull
```

The type → operator matrix is **enforced at validation time** based on the column type,
not silently dropped at runtime. Returning `422` with a precise per-field error is the
contract.

### 2.3 Server-side response envelope

```ts
{
    data: T[],
    meta: { page, perPage, total, lastPage }
}
```

Already what `Transformer.paginate(paginator)` emits — keep it. The sdk's
`Paginated<T>` matches; don't introduce a parallel shape.

---

## 3. Lucid-shaped design notes (this is where TypeORM doesn't translate 1:1)

### 3.1 Column-type metadata source

TypeORM exposes `EntityMetadata.columns[*].type` via reflection. **Lucid does not**.
You have three options; pick one in the ADR and commit:

1. **Hand-declared per view (recommended for v1).** The config takes an object map:

    ```ts
    createTableView({
        model: Order,
        columns: {
            id: { type: "bigint", filterable: true, orderable: true },
            order_number: { type: "string", filterable: true, orderable: true },
            status: { type: "enum", values: ORDER_STATUS_VALUES, filterable: true },
            created_at: { type: "datetime", filterable: true, orderable: true },
            grand_total: { type: "bigint", filterable: true, orderable: true },
        },
        defaultSort: [["created_at", "desc"], ["id", "desc"]],
    });
    ```

    Pros: explicit, type-checked against the model's TS property keys, no reflection
    magic. Cons: small duplication with the model definition. Acceptable cost.

2. **Introspect Lucid's `$columnsDefinitions`** (a Map keyed by property name, value
    holds `serializeAs`, `columnName`, etc). It does NOT carry the DB type, so this
    alone isn't enough — would need a second source like the generated `schema.ts`.

3. **Read the generated `apps/api/database/schema.ts`** at module load and synthesise
    metadata. Lucid 22 regenerates this on `migration:run`. Pros: zero duplication.
    Cons: extra parse step, brittle against schema.ts format changes.

Default to **(1)** unless you have a strong reason for one of the others. Whatever
you pick, encode the decision in the ADR.

### 3.2 The query builder, not a Repository

Lucid is `Model.query()` returning a `ModelQueryBuilder`, not a TypeORM `Repository`.
Signature:

```ts
view.run<TPayload>(
    builder: ModelQueryBuilder,
    parsedQuery: InferTableViewQuery<typeof view>,
    options?: TableViewRunOptions
): Promise<{ data: TPayload[]; meta: PaginationMeta }>
```

Note that consumers pass a **pre-built builder** so they can attach scopes (tenant id,
soft-delete filter, locale) before `run()` walks it. This mirrors what
`affiliate-codes.ts` does with the `{ filter: { ownerUserId: ... } }` override but is
a more idiomatic AdonisJS shape — the controller controls authorisation via the
builder, the view only applies operator-supplied predicates on top.

### 3.3 Relations

For each declared filterable / orderable relation field, `run()` must compose joins
into the underlying builder. The pattern is:

- `query.preload('customer')` — eager loads the relation for the response.
- For filtering on a relation column, **join** rather than `whereHas` so a single
   SQL statement handles it cleanly: `.join('customers', 'customers.id', 'orders.customer_id')`
   then `.where('customers.email', 'ILIKE', '%@calibra.dev')`.
- Avoid N+1: filters on relations must produce a single SELECT.

Lucid's `withScopes` API is the right place to encapsulate the join logic per relation.
Document this in the ADR.

### 3.4 VineJS rule

Implement `tableViewFilterRule` + `tableViewSortRule` as VineJS 4 custom rules
(`vine.createRule(fn, { implicit: true })`). Use the technance validator as the
template — same grammar, same coercion, same error messages, just retargeted at VineJS
field-context APIs and our column-type → operator map.

### 3.5 Pagination

Use Lucid's `.paginate(page, perPage)` — it returns a `ModelPaginatorContract` that
already has `currentPage`, `lastPage`, `total`, `perPage`. Wrap it into our `PaginationMeta`
shape inside the view. Honour the existing `DEFAULT_PER_PAGE_OPTIONS = [10, 20, 50, 100]`;
the view's `limit` schema is `min: 1, max: 100` with `default: 20`.

### 3.6 i18n

The Vine error messages must come from `resources/lang/{en,fa}/messages.json` under
the `table_view.*` namespace. Don't hard-code English strings inside the rule. See how
existing validators in `apps/api/app/validators/admin/` do it.

---

## 4. The migration — every list endpoint in the repo

### 4.1 API list endpoints to migrate

Audit and migrate. The list as of this writing:

- `apps/api/app/controllers/admin/orders_controller.ts:index`
- `apps/api/app/controllers/admin/customers_controller.ts:index`
- `apps/api/app/controllers/admin/products_controller.ts:index`
- `apps/api/app/controllers/admin/coupons_controller.ts:index` (if it exists by now)
- `apps/api/app/controllers/admin/reviews_controller.ts:index`
- `apps/api/app/controllers/admin/media_controller.ts:index`
- `apps/api/app/controllers/admin/refunds_controller.ts:index`
- `apps/api/app/controllers/admin/notes_controller.ts:index` (per-order notes)
- `apps/api/app/controllers/admin/payments_controller.ts:index`
- `apps/api/app/controllers/admin/categories_controller.ts:index` (+ tags + brands +
   attributes + terms — the whole product-taxonomy family)
- `apps/api/app/controllers/admin/shipping_zones_controller.ts:index`
- `apps/api/app/controllers/admin/tax_rates_controller.ts:index`
- `apps/api/app/controllers/admin/customer_downloads_controller.ts:index`
- `apps/api/app/controllers/account/orders_controller.ts:index` (storefront-side list)
- any export-wizard preview endpoints that take filter params today
   (`product_exports`, `customer_exports`).

The grep audit: `rg "ctx.request.qs\(\)" apps/api/app/controllers/` plus
`rg "\.paginate\(" apps/api/app/controllers/`. Anything that returns a paginated
list and reads query params for filter/sort goes through TableView. Nothing that
returns a single resource or a "counts" map does.

### 4.2 Admin client list pages to update

These match the API audit:

- `apps/admin/src/views/orders/list/orders-list.tsx`
- `apps/admin/src/views/customers/list/customers-list.tsx`
- `apps/admin/src/views/products/list/products-list.tsx`
- `apps/admin/src/views/products/{categories,brands,tags,attributes}/...`
- `apps/admin/src/views/products/reviews/reviews-list.tsx`
- `apps/admin/src/views/media/media-list.tsx`
- exports' filter-and-columns step

Each must:

1. Build its filter set as a **TableView query** client-side (a typed object).
2. Serialise it to the URL via a `serializeTableViewQuery()` helper (this is the
    inverse of the VineJS rule).
3. Pass it to the matching `useXxxList()` query hook as a single typed object, not
    as a flat record of `?source=&payment=&status=` ad-hoc keys.

The existing `useDataTable` hook keeps its outward shape (consumers call `setFacetValues`,
`setSort`, etc.) but internally it owns a normalised TableView query object and emits
the URL representation. Tests for the hook expand accordingly.

### 4.3 OpenAPI spec

Each migrated endpoint gets:

- `$ref` to a shared `parameters/table-view/filter.yaml`, `filterOr.yaml`, `sort.yaml`,
   `page.yaml`, `limit.yaml` (mirror the technance shapes — see their files).
- A description listing the **allowed filterable / orderable fields** for that endpoint
   so the spec is honest and the codegen produces useful types.

The spec assertions
(`tests/bootstrap.ts` + `response.assertAgainstApiSpec()`) enforce this, and
`node ace check:api-docs` enforces the route inventory. **Both must stay green** —
acknowledged drift goes in `.check-api-docs-known-drift.json` only as a temporary
ladder rung during migration, not as a permanent escape hatch.

### 4.4 SDK regeneration

After every YAML change: `pnpm --filter @calibra/sdk codegen`. The generated
`admin.d.ts` then drives the FE query hooks' type safety.

---

## 5. Integration with the date-filter UI primitive

The date-filter chip primitive at `apps/admin/src/components/ui/date-picker/` already
emits values like `before:2026-05-26`, `in:2026-Q4`, `within:2026-05-01..2026-05-07`.
Make these interop with TableView, not parallel to it.

### 5.1 Map the picker's `DateFilterValue` onto TableView ops

The picker's value model is richer than `gt`/`lt`/`between`. Add a small
`dateFilterValueToTableViewFilters(value)` that returns one or two TableView filter
entries:

```
before:2025-05-26  →  [{ field: 'X', op: 'lt',  value: '2025-05-26' }]
after:2025-05-26   →  [{ field: 'X', op: 'gt',  value: '2025-05-26' }]
in:2025-Q4         →  [{ field: 'X', op: 'between', value: ['2025-10-01','2025-12-31'] }]
within:a..b        →  [{ field: 'X', op: 'between', value: [a, b] }]
```

Period values (`Q4`, `H1`, `2025`) get expanded to a Gregorian `between` pair at the
boundary — the API only sees raw dates. Jalali years (< 1700) get converted to
Gregorian during expansion (`@mohammadxali/jalaali-js`, already in the catalog).
This keeps the picker rich on the UI without bloating the server-side parser.

### 5.2 Drop the standalone `created` URL param

The current PR (date-picker) writes `?created=before:2025-05-26`. After this PR, the
URL writes `?filter[]=created_at:lt:2025-05-26` — the unified shape. Migrate the
adoption-sweep call sites accordingly. There's no third format; the picker is a UI
shortcut over TableView, not a peer system.

---

## 6. Definition of done

### 6.1 The primitive

- [ ] `apps/api/app/lib/table_view/` (or wherever the ADR puts it) contains:
   `create_table_view.ts`, `types.ts`, `constants.ts`, `validators.ts`, plus an
   index.
- [ ] `createTableView({ model, columns, defaultSort, relations })` returns
   `{ schema, run, config }`.
- [ ] `view.schema` is a Vine object usable as
   `vine.compile(vine.object({ query: view.schema }))`.
- [ ] `view.run(builder, parsedQuery, overrides?)` returns
   `{ data, meta }` matching the existing pagination envelope.
- [ ] Each operator (all 19) is implemented + tested. Type validity matrix enforced.
   `in`/`nin`/`between` value cardinality checked at validate time AND defensively at
   run-time.
- [ ] Override surface (`overrides.filter`, `filterOr`, `sort`) bypasses the
   filterable/orderable whitelist for trusted, controller-supplied scopes.
- [ ] Relation flattening works for one-level relations
   (e.g. `customer.email`). Multi-level (`customer.country.code`) is **out of scope
   for v1** — call it out in the ADR.
- [ ] Vine errors localised via `messages.json` under `table_view.*`.

### 6.2 The client

- [ ] `apps/admin/src/lib/table-view/` exports `parseTableViewQuery()`,
   `serializeTableViewQuery()`, and the shared types — same wire grammar as the
   server.
- [ ] `useDataTable` internally normalises to a TableView query; the public hook
   API stays source-compatible with what list pages already use, OR list pages
   migrate to a new hook with a clean break (ADR decides — both are defensible).
- [ ] Round-trip URL test suite: pick any TableView query → serialise → parse →
   identity. 50+ assertions across all op types + both calendars.

### 6.3 The migration

- [ ] `rg "ctx\.request\.qs\(\)" apps/api/app/controllers/` post-migration only
   matches non-list endpoints (resource patches, exports, etc.).
- [ ] Every list controller is `view.run(query.useScopes(...), parsedQuery)` —
   no inline `query.where(...) ` chains driven by query-param keys.
- [ ] All ad-hoc per-list validators (after/before/source/payment/country/…) are
   gone, replaced by the view's `schema`.
- [ ] OpenAPI for every migrated endpoint references the shared `filter[]` /
   `filterOr[]` / `sort[]` parameter components and lists the endpoint's allowed
   fields.
- [ ] SDK regenerated; admin proxy continues to forward Authorization + Accept-Language
   to the API correctly.
- [ ] All Japa functional tests pass, including the new `assertAgainstApiSpec()`
   matchers on every migrated endpoint.
- [ ] `node ace check:api-docs` green (no new drift entries unless the ADR explains
   a single rung-up-the-ladder exception).

### 6.4 Tests

- [ ] Unit tests for the validators (filter grammar, sort grammar, value coercion,
   error reporting).
- [ ] Unit tests for the runtime `run()`: each operator builds the right SQL fragment
   (use `query.toSQL()` snapshots OR an in-memory sqlite). Both `filter` AND
   `filterOr` paths covered. Combined `(AND) AND (OR)` covered.
- [ ] Japa functional tests per migrated endpoint: 401, 403 if gated, 200 happy
   path with `assertAgainstApiSpec()`, plus one test per meaningful filter
   dimension and the sort dimension. The test plan is wide because the surface
   is wide — embrace it, this is the contract.
- [ ] FE unit tests for `parseTableViewQuery` / `serializeTableViewQuery` round-trip.
- [ ] FE Playwright spec covering one canonical migrated page (orders list) end-to-end:
   open the date chip → set a filter → assert URL → assert refetch payload.

### 6.5 Docs

- [ ] `apps/api/docs/adr/0001-table-views.md` with the design decisions called out
   above.
- [ ] A user-facing `apps/api/app/lib/table_view/README.md` mirroring the technance
   docs but written against our Lucid + AdonisJS shape, with at least 3 concrete
   examples (a simple model, a model with relations, an endpoint with a controller-
   supplied tenant scope override).
- [ ] Update `apps/api/AGENTS.md` with a "Use TableView for any new list endpoint"
   pointer.
- [ ] Update `apps/admin/AGENTS.md` similarly for list pages.

---

## 7. Execution order

1. `pnpm spin table-views` + `pnpm spin doctor table-views --json` — confirm.
2. Read everything in §1.1 + §1.2. Take notes.
3. Write the ADR. Run it past the user before coding (open a draft PR with just the
   ADR markdown so we agree on the design before three days of implementation work).
4. Implement the API primitive + unit tests. Bring it to green before touching any
   real endpoint.
5. Implement the FE primitive + unit tests. Same gate.
6. Migrate **one** endpoint top-to-bottom (orders list is the most exercised + has
   the date filter the user cares about right now) — server, OpenAPI, SDK regen,
   admin page, Japa + Vitest + Playwright. Commit and push that as a vertical
   slice the user can sanity-check end-to-end.
7. Migrate the rest, one PR-sized commit per resource family (orders, customers,
   products, taxonomies, media, reviews, shipping/tax, account-side). Keep the
   draft PR auto-refreshing.
8. Add the spec drift assertions + clean known-drift file.
9. Update the docs in §6.5 last so they describe the system as shipped, not as
   planned.

---

## 8. Hard rules

- No new top-level deps without explicit user approval, per the repo's `AGENTS.md`
   dep rule. The work needs nothing beyond what's already in the catalog
   (`@vinejs/vine`, `@adonisjs/lucid`, `@mohammadxali/jalaali-js`).
- No parallel sub-agents for shared-module writes (the primitive's source files are
   shared modules). Codebase research with sub-agents is fine.
- Sub-100-line commits where reasonable. Commit scopes match package names
   (`api`, `admin`, `sdk`). The vertical-slice commit for the orders migration is
   the only one that legitimately touches multiple scopes — split it then if you
   prefer.
- **No legacy bridges.** The user explicitly said no legacy. Every migrated endpoint
   stops accepting its old per-list query params at the same commit that adds
   `filter[]` / `filterOr[]` / `sort[]` support. Old query params return `422` from
   the validator. There is no parallel-write window.
- Defer `between` for date columns to the period-expansion logic from §5.1; the
   server-side parser stays calendar-agnostic.
- Don't put the TableView primitive in `packages/sdk`. It belongs in `apps/api`
   (server) and `apps/admin/src/lib` (client). The SDK only knows the wire shape via
   the OpenAPI codegen.

---

## 9. What to ask the user about during the ADR step

Open these explicitly in the ADR — they're judgment calls, not unilateral choices:

1. **Column-type metadata source** (hand-declared per view vs `schema.ts` introspection).
   Recommendation: hand-declared. Get explicit sign-off.
2. **One-level relations only for v1**, or do we eat the multi-level type acrobatics
   from technance now?
3. **Whether the existing `useDataTable` keeps its current API surface** or this is a
   clean break to a `useTableView` hook with breaking changes the list pages absorb
   in the migration commit.
4. **Per-endpoint allowed-field doc strings vs OpenAPI extensions** — do we list the
   allowed filterable fields in the param `description` (operator-readable) or via
   `x-table-view-fields` (machine-readable)?
5. **`limit` cap.** Current admin pages use `[10, 20, 50, 100]`. Keep the cap at 100
   or raise it for exports?

Don't surprise-decide any of these. Surface them, recommend, get a green light, then
build.

---

## 10. Why this matters

This is a foundational refactor. Done right, every list endpoint in the codebase for
the next two years has the same query language, the same op set, the same error
shapes, the same OpenAPI footprint, and the same client-side parser. Done wrong, we
add a third inconsistent layer on top of two existing ones and the next agent who
touches a list endpoint has to figure out which year's pattern to follow.

Read carefully, write the ADR, get the design checked, then ship the vertical slice.
Don't try to do it all in one commit.
