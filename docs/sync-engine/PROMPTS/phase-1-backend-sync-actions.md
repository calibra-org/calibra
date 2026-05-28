================================================================
TASK — Sync Engine Phase 1: `sync_actions` backbone (backend, end-to-end)
================================================================

Lay the server-side foundation for the admin sync engine: an append-only,
monotonically-ordered change log written ATOMICALLY inside every admin mutation, plus a
`lastSyncId` watermark on responses. NO push, NO HTTP delta endpoint, NO client work in
this phase — that is Phases 2–4. This phase is strictly ADDITIVE and feature-flag-gated;
the existing API behaviour must be byte-identical when the flag is off.

READ THE FOUNDATION DOC FIRST: `00-foundation.md` (path printed by
the prompt author). It records the decided path (build on our own Postgres, single-
tenant, Transmit/SSE, REST not GraphQL) and the realities that override the stale
`docs/sync-engine/` dossier. Do NOT follow the dossier's multi-merchant / GraphQL /
WebSocket assumptions.

Start a fresh worktree:

    pnpm spin sync-engine-phase-1

Verify with `pnpm spin doctor sync-engine-phase-1 --json` before starting. Commit + push
to that branch; the draft PR refreshes on each push.

----------------------------------------------------------------
1. READ FIRST (verified paths)
----------------------------------------------------------------

Surface you're extending:
- `apps/api/app/controllers/admin/orders_controller.ts` — `store`/`update`/status/`destroy`.
  `store` already wraps writes in `db.transaction(async (trx) => {...})` and allocates a
  sequence value via `orderNumberService.allocate(trx)` INSIDE the txn — copy that shape.
- `apps/api/app/controllers/admin/catalog/products_controller.ts` — `store`/`update`/
  `destroy`/`restore`; uses `withTransaction(...)` from `#services/catalog_writer`.
- `apps/api/app/controllers/admin/catalog/reviews_controller.ts` — `update` (moderate) +
  `destroy` are single `row.save()`/`row.delete()` (NOT in a txn — you will wrap them).
- `apps/api/app/controllers/admin/customers_controller.ts`, `coupons_controller.ts`.
- `apps/api/app/transformers/api_envelope.ts` — `resource<T>`, `collection<T>`,
  `paginated<T>` + the `Resource<T>` / `Paginated<T>` / `PaginationMeta` types.
- `apps/api/app/transformers/order_transformer.ts`, `product_transformer.ts`,
  `customer_transformer.ts`, `coupon_transformer.ts`, `product_review_transformer.ts` —
  each is a `BaseTransformer<T>` with `forList`/`forAdmin`/`forDetail` variants; add a
  `forSync()` variant (see §3).

Reference patterns to mirror:
- Sequence migration: `apps/api/database/migrations/*_create_order_number_sequence.ts`
  (`CREATE SEQUENCE IF NOT EXISTS …`). A `BIGSERIAL` PK gives us the sequence for free —
  prefer that. Allocation-inside-txn pattern: `apps/api/app/services/order_number_service.ts`.
- Domain events + listeners: `apps/api/app/events/admin_action_performed.ts`,
  `apps/api/start/events.ts` (the `order:status_changed → CacheInvalidation` wiring is the
  hook to co-locate sync recording with — see §2 GOODIE).
- Audit writer (a service called from controllers with `ctx`): `apps/api/app/services/admin_audit_log_service.ts` (`recordAudit({ ctx, action, entityKind, entityId })`).
  The recorder you write has the SAME ergonomics but takes a `trx`.
- Cache invalidation service shape: `apps/api/app/services/cache_invalidation.ts`.

Approved infra (no new deps): `@adonisjs/lucid`, VineJS, Japa. NO new packages this phase.

----------------------------------------------------------------
2. ARCHITECTURAL RULES (load-bearing)
----------------------------------------------------------------

R1. **The sync action is written inside the mutation's Lucid transaction.** It commits
    with the mutation or not at all. A mutation that is not already in a `db.transaction`
    (reviews moderate/destroy) MUST be wrapped so the recorder is atomic. This is the
    load-bearing correctness property — get it wrong and clients see ghost changes.

R2. **`data` is the post-image from a `forSync` transformer variant — never raw model
    columns.** Hidden/sensitive fields (password hashes, tokens, private notes) MUST NOT
    enter `sync_actions`. The `forSync` variant reuses the existing transformer's
    column-picking so exclusion is automatic. A test asserts no excluded field appears.

R3. **Single-tenant.** No `merchant_id` / sync-group-by-tenant. `channel` is a DOMAIN
    label (`orders` | `catalog` | `customers` | `coupons` | `reviews`) used later for
    fanout only. Do NOT add tenant columns.

R4. **Feature flag.** Gate ALL recording behind `env.get('SYNC_ENGINE_ENABLED', false)`.
    When off, `SyncActionRecorder.record` is a no-op (returns `null` lastSyncId) and the
    response envelope omits `lastSyncId`. Declare the env in `apps/api/start/env.ts`.

----------------------------------------------------------------
3. SCOPE
----------------------------------------------------------------

**A. Migration — `sync_actions` table.**
New migration (timestamp AFTER the latest — run `ls apps/api/database/migrations | tail -1`):

```
id             BIGSERIAL PRIMARY KEY          -- the global lastSyncId (single-tenant → global is correct)
model_name     TEXT      NOT NULL             -- stable wire name, e.g. 'Order' (never rename)
model_id       BIGINT    NOT NULL
action         CHAR(1)   NOT NULL CHECK (action IN ('I','U','D'))
data           JSONB                          -- forSync post-image; NULL for 'D'
channel        TEXT      NOT NULL             -- 'orders' | 'catalog' | 'customers' | 'coupons' | 'reviews'
actor_user_id  BIGINT                         -- nullable; who caused it
client_tx_id   TEXT                           -- nullable; client idempotency key
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
```
Indexes: `(channel, id)`, and `CREATE UNIQUE INDEX … ON sync_actions (client_tx_id) WHERE client_tx_id IS NOT NULL`.
No model class is strictly required (the recorder uses the query builder), but if you add
one, extend the generated `SyncActionSchema` per the repo's Lucid-v22 convention.

**B. `SyncActionRecorder` service** — `apps/api/app/services/sync/sync_action_recorder.ts`.
```ts
interface RecordInput {
  modelName: string; modelId: number; action: "I" | "U" | "D";
  data: Record<string, unknown> | null; channel: SyncChannel;
  actorUserId?: number | null; clientTxId?: string | null;
}
// Returns the inserted row's id (the lastSyncId), or the existing id on client_tx_id
// conflict (idempotent), or null when SYNC_ENGINE_ENABLED is false.
static async record(trx: TransactionClientContract, input: RecordInput): Promise<number | null>
```
- Insert via `trx.table('sync_actions')…returning('id')`.
- Idempotency: `.onConflict('client_tx_id').ignore()` then, if no row returned, SELECT the
  existing id for that `client_tx_id`. (Mirror the `.onConflict(...).ignore()` shape used
  in `product_favorites` writes.)
- No-op + return null when the flag is off.

**C. `SYNC_MODELS` registry** — `apps/api/app/services/sync/sync_models.ts`.
A hand-maintained map (NOT codegen — the dossier's `tooling/sync-model-codegen` is
over-built for v1; a static map is enough and easier to review):
```ts
export const SYNC_MODELS = {
  Order:    { channel: "orders" },
  Product:  { channel: "catalog" },
  Customer: { channel: "customers" },
  Coupon:   { channel: "coupons" },
  ProductReview: { channel: "reviews" },
} as const;
export type SyncModelName = keyof typeof SYNC_MODELS;
export type SyncChannel = (typeof SYNC_MODELS)[SyncModelName]["channel"];
```

**D. `forSync()` transformer variant** on the 5 core transformers (Order, Product,
Customer, Coupon, ProductReview). It returns the post-image the client cache will hold —
reuse the richest existing variant minus anything not needed for a cache row, and CONFIRM
no hidden column leaks. For Order/Product, `forAdmin()` is fine to delegate to; for
Customer/Review, use the list/detail shape the admin already renders. The shape MUST
match the corresponding `AdminX` OpenAPI schema so the client can treat a delta `data`
exactly like a fetched row.

**E. Wire the recorder into the core write paths.** Inside each existing mutation's txn,
AFTER the entity write, BEFORE returning:
- Orders: `store` (I), `update` (U), the status-transition action (U), `destroy` (D,
  soft-delete → still a U or D? Use `D` for soft-delete-to-trash AND hard delete; the
  client treats trash via the row's `deleted_at`/status — record `U` with the post-image
  for soft-delete so the row stays in cache as trashed, `D` only for hard delete).
  Decide explicitly and document in a JSDoc on the recorder call.
- Products: `store` (I), `update` (U), `restore` (U), `destroy` (soft → U with post-image,
  force → D).
- Reviews: `update`/moderate (U) — WRAP the single `row.save()` in `db.transaction` first;
  `destroy` (D — wrap likewise).
- Customers, Coupons: create (I), update (U), delete (D/U per soft-delete rule).
Each call passes `actorUserId: ctx.auth.user?.id`, the `forSync` post-image as `data`, the
channel from `SYNC_MODELS`, and `clientTxId` from an optional `X-Client-Tx-Id` request
header (read it; null when absent).

**F. `lastSyncId` on the response envelope.** Extend `api_envelope.ts`: `resource()` and
the mutation responses accept an optional `lastSyncId` and include it in the JSON when
present (`{ data, lastSyncId? }`). Update the controllers' mutation responses to thread
the recorder's returned id. Lists/detail GETs MAY also include the current
`MAX(id) FROM sync_actions` as `lastSyncId` (cheap; do it for the 5 list endpoints so a
freshly loaded page knows its watermark) — but keep this behind the same flag.

----------------------------------------------------------------
4. BACKEND CONTRACT (per the repo rule)
----------------------------------------------------------------

No NEW HTTP endpoint in Phase 1. But: any response shape change (adding `lastSyncId`) is
an OpenAPI change. Update the affected path/response schemas (mutations + the 5 lists) to
document the optional `lastSyncId: integer` field, then `pnpm --filter @calibra/sdk run
codegen` and commit `packages/sdk/src/generated/admin.d.ts`. `just docs-check` must pass.

----------------------------------------------------------------
5. FILE LAYOUT (after this PR)
----------------------------------------------------------------

```
apps/api/
├── database/migrations/<ts>_create_sync_actions_table.ts        ← NEW
├── app/services/sync/
│   ├── sync_action_recorder.ts                                  ← NEW
│   └── sync_models.ts                                           ← NEW (registry)
├── app/transformers/
│   ├── order_transformer.ts        ← EXTEND (+ forSync)
│   ├── product_transformer.ts      ← EXTEND (+ forSync)
│   ├── customer_transformer.ts     ← EXTEND (+ forSync)
│   ├── coupon_transformer.ts       ← EXTEND (+ forSync)
│   ├── product_review_transformer.ts ← EXTEND (+ forSync)
│   └── api_envelope.ts             ← EXTEND (optional lastSyncId)
├── app/controllers/admin/**        ← EXTEND (recorder calls in the 5 domains)
├── start/env.ts                    ← EXTEND (SYNC_ENGINE_ENABLED)
└── tests/functional/sync/
    └── sync_actions_recording.spec.ts                           ← NEW
docs/api/reference/openapi/admin/**  ← EXTEND (lastSyncId in response schemas)
packages/sdk/src/generated/admin.d.ts ← REGENERATED
```

----------------------------------------------------------------
6. NON-NEGOTIABLES
----------------------------------------------------------------

- JSDoc comments only; no inline `//`.
- Commit scope `feat(api): …` (this phase is api-only except the SDK regen → that file
  rides the same commit or a `chore(sdk): regenerate …` follow-up).
- No new deps.
- Money stays BIGINT minor units; `forSync` must serialize money exactly as the existing
  transformers do (the client treats a delta row identically to a fetched row).
- Recorder failure must propagate (throw) so the txn rolls back — never swallow.
- When `SYNC_ENGINE_ENABLED=false`, zero behaviour change: same response bytes, no
  `sync_actions` rows, no `lastSyncId`. A test asserts this.

----------------------------------------------------------------
7. DEFINITION OF DONE
----------------------------------------------------------------

Functional (Japa, flag ON):
  [ ] Creating an Order via the controller appends exactly ONE `sync_actions` row
      (`action='I'`, `channel='orders'`, `model_name='Order'`, `data` = forSync image)
      inside the SAME transaction.
  [ ] Updating each of Order/Product/Customer/Coupon/Review appends one `U` row with the
      post-image; the mutation response includes `lastSyncId` equal to that row's id.
  [ ] A mutation forced to roll back (throw mid-txn) appends ZERO `sync_actions` rows.
  [ ] `data` for a Customer/Review row contains NO excluded column (assert a known hidden
      field — e.g. a password hash / private note — is absent).
  [ ] Sending the same `X-Client-Tx-Id` twice produces ONE row and returns the SAME
      `lastSyncId` (idempotency).
  [ ] Soft-delete records `U` (row stays in cache as trashed); hard/force-delete records `D`.
Flag OFF:
  [ ] No `sync_actions` rows written; response envelope omits `lastSyncId`; existing
      functional specs unchanged.
Technical:
  [ ] `pnpm --filter @calibra/api typecheck` + `test` green; `just lint`, `just docs-check`,
      `pnpm --filter @calibra/sdk run codegen:check` green.
  [ ] OpenAPI documents `lastSyncId`; SDK regenerated + committed.
  [ ] No new package deps.
Security:
  [ ] `sync_actions.data` NEVER contains a column excluded by the source transformer —
      verified with a seeded row carrying a sensitive value.

----------------------------------------------------------------
8. EXECUTION ORDER
----------------------------------------------------------------

1. `start/env.ts` flag + migration (`migration:run` on the spin DB).
2. `sync_models.ts` + `sync_action_recorder.ts` + a focused unit/functional test of the
   recorder (insert, idempotency, flag-off no-op).
3. `forSync()` on the 5 transformers (+ assert shape matches the `AdminX` schema).
4. `api_envelope.ts` `lastSyncId` + thread through one controller (orders) end-to-end;
   write its functional test; confirm green BEFORE fanning out.
5. Fan out the recorder to products / customers / coupons / reviews (wrap reviews in a
   txn). One commit per domain.
6. OpenAPI `lastSyncId` + `pnpm --filter @calibra/sdk run codegen` + commit.
7. Full DoD pass.

STOP-and-ask gates: if `forSync` for any model would require exposing a field not already
in its `AdminX` OpenAPI schema, STOP and confirm the field is safe to broadcast before
adding it. If any mutation cannot be made transactional without a larger refactor, STOP
and flag it rather than recording outside a txn.

Push commits often in small logical scopes; the draft PR auto-refreshes.
