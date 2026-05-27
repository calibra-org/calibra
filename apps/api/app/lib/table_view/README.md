# TableView — unified list query primitive

Server-side primitive that gives every list endpoint a single filter / sort / pagination
grammar. Mirrors the technance-backend `table-view` package; the client twin lives at
[`apps/admin/src/lib/table-view/`](../../../../admin/src/lib/table-view/).

Design rationale, decisions, and migration plan: [ADR 0001](../../../docs/adr/0001-table-views.md).

## Wire grammar

```
GET /resource
    ?page=2
    &limit=50
    &sort[]=created_at:desc
    &sort[]=id:asc
    &filter[]=status:eq:processing
    &filter[]=created_at:between:2026-01-01,2026-05-26
    &filter[]=billing_email:ilike:%@calibra.dev
    &filterOr[]=tags:in:vip,whale
    &filterOr[]=lifetime_spend:gte:10000000
```

- `filter[]` joins with AND. `filterOr[]` joins with OR. Combined: `(AND clauses) AND (OR clauses)`.
- `field:value` is shorthand for `field:eq:value`.
- Void ops without a value: `created_at:isnull`, `description:notnull`.
- Sort direction is case-insensitive.
- All values URL-decoded server-side before parsing.

### Operators

19 operators across 7 categories:

| Category   | Operators                                              |
|------------|--------------------------------------------------------|
| equality   | `eq`, `neq`                                            |
| ordering   | `gt`, `gte`, `lt`, `lte`                               |
| substring  | `like`, `ilike`, `nlike`, `nilike`                     |
| contains   | `inc`, `iinc`, `ninc`, `niinc` (auto-wraps with `%v%`) |
| set        | `in`, `nin`                                            |
| range      | `between` (exactly two comma-separated values)         |
| null       | `isnull`, `notnull` (no value slot)                    |

### Column-type → operator matrix

Validation rejects mismatches at the schema layer (returns 422 with a per-field message):

| Column type              | Allowed ops                                                                  |
|--------------------------|------------------------------------------------------------------------------|
| `boolean`                | `eq`, `neq`, `isnull`, `notnull`                                             |
| `number` / `bigint` / `decimal` | universal + `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `between`          |
| `datetime` / `date`      | universal + `gt`, `gte`, `lt`, `lte`, `between`                              |
| `string` / `uuid`        | universal + `like` family + `inc` family + `in`, `nin`, `between`            |
| `enum`                   | `eq`, `neq`, `isnull`, `notnull`, `in`, `nin`                                |
| `json`                   | universal only                                                               |

## Authoring a view

```ts
// apps/api/app/table_views/admin/orders.ts
import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import { ORDER_STATUS_VALUES } from "#enums/order_status";
import Order from "#models/order";

export const adminOrdersView = createTableView({
    model: Order,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        order_number: { type: "bigint", filterable: true, orderable: true },
        status: {
            type: "enum",
            values: ORDER_STATUS_VALUES as unknown as readonly string[],
            filterable: true,
            orderable: true,
        },
        customer_id: { type: "bigint", filterable: true, orderable: false },
        billing_email: { type: "string", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
        grand_total: { type: "bigint", filterable: true, orderable: true },
    },
    defaultSort: [
        ["created_at", "desc"],
        ["id", "desc"],
    ],
});

export type AdminOrdersViewQuery = InferTableViewQuery<typeof adminOrdersView>;
```

- `columns` keys are wire/URL field names; `column?: string` overrides the SQL identifier
  when they differ. Pass the whole object `as const` for literal-type inference.
- `defaultSort` fires only when the wire `sort[]` array is absent — populates `parsed.sort`
  inside the validator.

## Validator + controller

```ts
// apps/api/app/validators/admin/order_validator.ts
import vine from "@vinejs/vine";
import { adminOrdersView } from "#table_views/admin/orders";

export const adminOrderListValidator = vine.compile(
    vine.object({
        ...adminOrdersView.schema.getProperties(),
        // endpoint extensions outside the TableView grammar:
        q: vine.string().trim().minLength(1).maxLength(120).optional(),
        trashed: vine.boolean().optional(),
    }),
);
```

```ts
// apps/api/app/controllers/admin/orders_controller.ts
import { adminOrdersView, type AdminOrdersViewQuery } from "#table_views/admin/orders";

async index(ctx: HttpContext) {
    const payload = (await ctx.request.validateUsing(adminOrderListValidator)) as AdminOrdersViewQuery & {
        q?: string;
        trashed?: boolean;
    };

    /** Controller owns the soft-delete + preload + free-text-search scopes — the view applies
     * the operator-supplied predicates on top of this pre-scoped builder. */
    const builder = Order.query()
        .whereNull("orders.deleted_at")
        .preload("lineItems")
        .preload("couponLines");

    if (payload.q !== undefined) {
        const needle = `%${payload.q.toLowerCase()}%`;
        builder.where((sub) => sub.whereRaw("LOWER(billing_email) LIKE ?", [needle]));
    }

    const { data, meta } = await adminOrdersView.run<Order>(builder, payload);
    return { data: data.map((o) => new OrderTransformer(o).forList()), meta };
}
```

## Run-time overrides

For trusted scopes that must not be exposed to the URL — tenant IDs, locale, role gates — pass
them as `run()` overrides. Overrides win on conflict with wire-supplied filters on the same
field, and they bypass the filterable/orderable whitelist for fields the view didn't have to
know about.

```ts
const { data, meta } = await userAffiliateCodesView.run(builder, parsed, {
    filter: { ownerUserId: { op: "eq", value: ctx.auth.user!.id } },
});
```

## Relations (v1: one level)

Single-level relation joins compose into the builder automatically:

```ts
export const adminCustomersView = createTableView({
    model: Customer,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        created_at: { type: "datetime", filterable: true, orderable: true },
    },
    relations: {
        user: {
            columns: {
                email: { type: "string", filterable: true, orderable: true },
            },
        },
    },
});

// wire: ?filter[]=user.email:ilike:%@calibra.dev
// sql:  inner join "users" ... where "users"."email" ILIKE '%@calibra.dev'
```

The runtime adds each relation's JOIN at most once regardless of how many filter / sort
entries reference its columns. Multi-level relations (`customer.country.code`) are deferred
to v2.

## Endpoint extensions

Many endpoints need filters that don't fit a per-field predicate — multi-column free-text
search, aggregate having-clauses, existence checks across joined tables, bespoke tab scopes,
soft-delete flips, response-shape flags. **Keep these as top-level wire params on the
validator**, layered on top of the TableView surface:

```ts
export const adminCustomerListValidator = vine.compile(
    vine.object({
        ...adminCustomersView.schema.getProperties(),
        q: vine.string().trim().minLength(1).maxLength(120).optional(),
        tab: vine.enum(["any", "account", "guest", "big", "new", "inactive", "no_address", "trashed"]).optional(),
        cities: csvArray().optional(),
        opt_in_email: vine.boolean().optional(),
        has_national_id: vine.boolean().optional(),
        with_orders: vine.boolean().optional(),
        order_count_min: vine.number().min(0).optional(),
        // …
    }),
);
```

The controller handles these manually before calling `view.run(builder, payload)`.

## OpenAPI

Reference the shared parameter components on each migrated endpoint:

```yaml
parameters:
    - $ref: "../../../common/components/parameters/table-view/Page.yaml"
    - $ref: "../../../common/components/parameters/table-view/Limit.yaml"
    - $ref: "../../../common/components/parameters/table-view/Filter.yaml"
    - $ref: "../../../common/components/parameters/table-view/FilterOr.yaml"
    - $ref: "../../../common/components/parameters/table-view/Sort.yaml"
```

Enumerate the endpoint's allowed filterable / orderable fields in the path's `description`
so the rendered docs make the contract honest. The view's `view.allowedFields` accessor
returns the sorted lists for tooling that wants the machine form.

## Testing

The primitive ships with:

- **Unit tests** for the validators ([validators.spec.ts](../../../tests/unit/table_view/validators.spec.ts))
  — every grammar branch, every op, every type-validity rejection. 32 cases.
- **Runtime tests** ([runtime.spec.ts](../../../tests/unit/table_view/runtime.spec.ts))
  — each operator's SQL shape via `query.toQuery()`, AND vs OR composition, override behaviour,
  relation join idempotency. 22 cases.

Migrated endpoints add functional Japa coverage — see
[`tests/functional/admin/orders.spec.ts`](../../../tests/functional/admin/orders.spec.ts) for
the reference shape: 401, 403, happy-path with `assertAgainstApiSpec`, plus one test per
meaningful filter dimension + OR composition + 422 paths.

## Limitations to know

- **Multi-level relations and join-condition extras (e.g. `kind = 'billing'` on `order_addresses`)
  are out of scope for v1.** Stay controller-side via `whereExists` until a real second-level
  need lands.
- **The default snake-case naming strategy renames `getMeta()` keys** (`current_page`,
  `per_page`). The runtime reads paginator instance properties directly (`paginator.currentPage`,
  `.perPage`) so the meta shape stays consistent regardless of the project's naming strategy.

## Migration status

Every paginated list endpoint on the API speaks the unified wire grammar
(`page` / `limit` / `filter[]` / `filterOr[]` / `sort[]`), returns the
`{ data, meta: { page, limit, total, lastPage } }` envelope, and goes through
`view.compileStrict({ extras })` so unknown top-level query keys return 422 instead of
silently dropping. The wire param for free-text search is `q` everywhere it exists.

**Admin:**

- `GET /api/v1/admin/orders` — full migration incl. date-picker adapter
- `GET /api/v1/admin/customers` — simple per-column filters on TableView; `tab` / `q` / tags /
  aggregate-based filters stay as declared endpoint extras
- `GET /api/v1/admin/catalog/products` — sort + pagination + col filters; `name` and
  `stock_quantity` use the primitive's `sortRaw` hook for joined-subquery ORDER BYs;
  `applyListSort` / `SORTABLE_COLUMNS` are gone
- `GET /api/v1/admin/catalog/brands` / `categories` / `tags` — `used_count` is an orderable
  column via `sortRaw`; `q` searches slug + translated name; `defaultLimit: 100`
- `GET /api/v1/admin/catalog/attributes` + `attributes/:id/terms`
- `GET /api/v1/admin/catalog/variations` — sub-resource scoped by `product_id` + soft-delete
- `GET /api/v1/admin/catalog/tax-classes` / `shipping-classes`
- `GET /api/v1/admin/payment-attempts`
- `GET /api/v1/admin/coupons` — bulk of per-column filters move; tab / `q` /
  has_*_constraints / brand pivot stay as extras
- `GET /api/v1/admin/orders/:order_id/refunds` — sub-resource
- `GET /api/v1/admin/orders/:order_id/notes` — sub-resource; `type` keyword alias retained as
  an extra
- `GET /api/v1/admin/orders/:order_id/history` — sub-resource
- `GET /api/v1/admin/customer-tags` — `?q=` prefix-search retained as an extra for the combobox UX
- `GET /api/v1/admin/customers/:customer_id/notes` — sub-resource
- `GET /api/v1/admin/customers/:id/timeline` — stitched in-controller; the wire grammar /
  envelope still match (post-merge pagination + inline strict-keys validation)
- `GET /api/v1/admin/customer-segments` — owner-scope pre-applied as a security invariant
- `GET /api/v1/admin/catalog/reviews` — moderation queue
- `GET /api/v1/admin/media` — `q` multi-col free-text + bespoke WP-style extras (`type`
  MIME-group, `month` window, `uploaded_by`); `defaultLimit: 60`
- `GET /api/v1/admin/payment-gateways`

**Account-side (storefront-facing):**

- `GET /api/v1/account/orders`
- `GET /api/v1/account/orders/:order_id/history` — `viewOrder` ability + parent-id pre-scope
- `GET /api/v1/account/orders/:order_id/notes` — `visibility = 'customer'` pre-scope
- `GET /api/v1/account/addresses` — customer-scope pre-scope; `field_metadata` lives as a
  top-level sibling of `data`/`meta` (was previously under `meta.field_metadata`)
- `GET /api/v1/account/downloads` — customer-scope + active-grant predicate pre-scope

**Remaining follow-up work:**

- **FE `useDataTable` ↔ `useTableView` consolidation.** Every migrated admin list page is
  functional, but two URL-state managers coexist on each page: `useDataTable` owns the
  legacy facet / toggle / dateFacet abstractions and writes `?sort=-name` form, while
  `useTableView` owns the canonical `?sort[]=` form (used when the page composes a
  `TableViewQuery`). The list pages map between them in `useMemo`. Collapsing the two
  hooks into a single source of truth — with UI-only state (column visibility / density /
  selection) split off into smaller hooks — is the remaining refactor.
- **Server-side `parseDateFilter` service.** Still in use by `customers_controller` for the
  `last_order` aggregate-filter parsing (the customers list's "ordered in last 30 days"
  chip). Deletable once the customers picker emits a TableView-shaped range filter and the
  controller swaps the aggregate predicate to a `havingRaw` on the joined orders subquery.
