# Claude Code Prompts — One per Phase

These prompts are designed to be pasted into Claude Code as the initial brief for each phase. They follow the same shape as the original "Refactor: admin dashboard → TanStack Query (client-side fetching)" brief that landed this PR: explicit goal, why, tricky bits, hard rules, verification, adjudication. Self-contained — each prompt assumes Claude Code has read [`README.md`](./README.md), [`RESEARCH.md`](./RESEARCH.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), and [`IMPLEMENTATION.md`](./IMPLEMENTATION.md). The first thing each prompt does is restate that requirement.

> All prompts assume **Path A**. If we switch to Path B (ElectricSQL + TanStack DB) before starting, the prompts in Phases 2, 3, 4, 5, 8 change substantially — primarily *replacing* the relevant component with shape + collection wiring. The Path B prompt set lives in `PROMPTS-B.md` (to be written when/if we pivot).

---

## Phase 0 — Prework prompt

```
Set up the foundations for the Calibra admin sync engine. We have not started
building the engine yet. Read these before writing any code:

1. docs/sync-engine/README.md
2. docs/sync-engine/ARCHITECTURE.md (full)
3. docs/sync-engine/IMPLEMENTATION.md § Phase 0

Working directory: /home/inf1nite-lo0p/keshavarz20-com/keshavarz20. Cut a
worktree:

  git worktree add ../calibra--sync-engine-phase-0 -b feat/sync-engine-phase-0 origin/main
  cd ../calibra--sync-engine-phase-0
  pnpm install

Goal

Land the scaffolding: the sync_actions table, the SyncActionRecorder service,
the @syncable() metadata + codegen, and the feature flag. NO sync API
endpoints, NO client object pool. Just the pieces every later phase will need.

Why

We can't safely incrementally migrate without (a) the recorder writing actions
on every mutation we already have and (b) the codegen ensuring server and
client agree on what's syncable. Phase 0's job is to make Phase 1+ greenfield-
free.

Scope

In scope:
- apps/api/database/migrations/<n>_create_sync_actions.ts — see schema in
  ARCHITECTURE.md § Data model § sync_actions table. Include the GIN index
  on sync_groups and the btree on id.
- apps/api/app/sync/services/sync_action_recorder.ts — exposes
  record(trx, params: SyncActionParams). It MUST be called from within a
  Lucid transaction; assert via a precondition.
- A Japa test for the recorder: inside a transaction, calling record() then
  rolling back leaves no row; calling record() then committing leaves
  exactly one row matching the params.
- tooling/sync-model-codegen/ — a small Node script that reads Lucid models
  in apps/api/app/models, looks for static syncable() metadata, and emits:
    - apps/api/app/sync/generated/model-registry.ts
    - apps/admin/src/lib/sync/generated/model-registry.ts
  Both committed; CI fails if they're out of sync with the codegen output
  (run codegen, check `git diff` is empty).
- Feature flag SYNC_ENGINE_ENABLED env var; read in apps/admin/src/app/[locale]/(authenticated)/layout.tsx; default off.
- A decision PR comment with a benchmark of Valtio vs Zustand reactivity on
  a 5k-object pool. Pick one; subsequent phases use it.

Out of scope:
- Apply @syncable() to actual models. That's Phase 1.
- Bootstrap, delta, WebSocket. Phases 2-3.

Architectural constraints

1. The recorder takes a Lucid TransactionClientContract. It does not open
   its own transaction. If you find yourself wanting to, re-read
   ARCHITECTURE.md § Append-only writer.
2. The codegen is single-source. There's exactly one file walked
   (apps/api/app/models), one definition of @syncable() metadata, two
   emitters. Don't grow it into two parallel writers.
3. No new runtime deps without explicit confirmation. The codegen uses ts-morph
   if necessary (already in catalog? check; if not, ask).
4. The Japa test uses a real Postgres transaction. Don't mock it.

Tricky bits to budget time for

- AdonisJS doesn't have first-class decorators in the same form as the
  Linear repo's hypothetical @syncable. Use a static method on the model
  class (`static syncable() { return { ... } }`) and have the codegen
  introspect it.
- The codegen running pre-build vs in CI: prefer pre-build (`turbo run
  prebuild` → `pnpm sync-codegen`) so local dev sees drift immediately,
  AND a CI step that re-runs and asserts `git diff --exit-code`.
- migrations run in a specific order; the new migration goes at the END,
  with the timestamp prefix you'd expect.

Suggested commit ordering

1. chore(api): add sync_actions table migration
2. feat(api): SyncActionRecorder service + Japa coverage
3. feat(tooling): @syncable codegen for model-registry.ts
4. chore(admin): SYNC_ENGINE_ENABLED flag plumbing
5. docs(sync): pick Valtio vs Zustand (link bench in PR body)

Each commit green: typecheck + lint + format + pnpm --filter @calibra/api test
(351 tests must remain green).

Verification

  pnpm --filter @calibra/api migration:run
  pnpm --filter @calibra/api test                # 351+ pass
  pnpm sync-codegen && git diff --exit-code      # codegen output is committed
  pnpm run format && pnpm run lint && pnpm run typecheck

Adjudication rules

1. Confirm before adding deps (ts-morph likely, possibly graphql-tag
   later). Repo policy is no deps without explicit user approval, even
   from the catalog.
2. If the codegen surface seems to demand a runtime reflection library, surface
   it instead of installing. We prefer a build-time codegen over a runtime
   reflection.
3. Don't apply @syncable() to existing models — that's Phase 1.

Hard rules

- Never call SyncActionRecorder.record outside a Lucid transaction.
- Never let codegen drift from generated output (CI must enforce).
- Never bypass the feature flag — if SYNC_ENGINE_ENABLED is off, the new
  code paths must be 100% inert.
- Don't touch lib/queries/* or lib/server-repos.ts. Phase 0 is additive.

Report back with: codegen output excerpt for one model, the Valtio-vs-Zustand
benchmark numbers, and which one was chosen + why.
```

---

## Phase 1 — Sync action recording on every mutation

```
Wire SyncActionRecorder into every Lucid model the admin mutates. Phase 0
landed the scaffolding; this phase makes it pervasive.

Pre-reading (must complete first):
- docs/sync-engine/ARCHITECTURE.md § Data model + § Server-side architecture
- docs/sync-engine/IMPLEMENTATION.md § Phase 1
- apps/admin/AGENTS.md

Working directory: /home/inf1nite-lo0p/keshavarz20-com/keshavarz20. Cut a
worktree off main once Phase 0 is merged:

  git worktree add ../calibra--sync-engine-phase-1 -b feat/sync-engine-phase-1 origin/main
  cd ../calibra--sync-engine-phase-1
  pnpm install

Goal

Every mutation to a syncable model produces exactly one row in sync_actions,
inside the same transaction as the mutation. By the end of the phase, the
sync_actions table is the canonical change feed for admin work, even though
no client reads from it yet.

Why

Phase 1 enables Phase 2 (bootstrap + delta) and is also independently
auditable — once it's in, ops engineers have a complete change log for
every merchant.

Scope

In scope:
- A Syncable mixin (apps/api/app/sync/syncable_mixin.ts) that:
  - Reads the model's static syncable() metadata.
  - Registers afterSave / afterDelete hooks that build the recorder params
    and call SyncActionRecorder.record(trx, params).
  - Computes syncGroups via the model's static syncGroupsFor(instance).
- Apply the mixin to every syncable model per ARCHITECTURE.md (Order,
  OrderLineItem, Product, ProductVariation, Customer, Coupon, Review,
  Refund, PaymentGateway, Category, Brand, Tag, Attribute, AttributeTerm).
  Cart/CartItem etc. stay out — storefront only.
- Add a syncable() static method to each of those models declaring:
  - modelName (stable string)
  - loadStrategy ('instant' | 'lazy' | 'local')
  - hiddenColumns (columns the serializer must omit, e.g. password hash)
- Add syncGroupsFor(instance) returning the right groups per model. Default
  template: ['merchant:'+instance.merchantId, ...resource-specific groups].

Out of scope:
- Bootstrap / delta. Phase 2.
- Cross-row events (a single API call mutating N line items still records N
  rows; coalescing is deferred to Phase 8).
- Migrating the codegen output — that's regenerated by the Phase 0 codegen.

Architectural constraints

1. The mixin must NOT swallow recorder failures. If the recorder throws, the
   surrounding Lucid transaction rolls back. Mutation atomicity is sacred.
2. Hidden columns: any column in the model's hiddenColumns list MUST NOT
   appear in the sync_action.data JSON. Audit by spot-checking one model
   (Order's billing_email is fine; User's password_hash must never).
3. The recorder receives the SAME Lucid transaction the mutation is using.
   afterSave passes the trx via `model.$trx ?? db.connection()`.

Tricky bits to budget time for

- Some models have soft-delete (deleted_at). When deleted_at is set, the
  action should be 'D' (delete), not 'U' (update). The mixin needs to detect
  this — check the dirty fields.
- Bulk operations (admin/orders/batch) currently use db.transaction
  with one trx for N child models. Verify recorder rows match the children;
  fix model.useTransaction(trx) calls if needed.
- A new Japa test PER MIXED-IN MODEL asserting: a mutation generates the
  expected sync_action.

Suggested commit ordering

1. feat(api): Syncable mixin + syncable() metadata schema
2. feat(api): apply Syncable to Order + OrderLineItem (the highest-volume
   models; battle-test the mixin here first)
3. feat(api): apply Syncable to Product + ProductVariation
4. feat(api): apply Syncable to Customer
5. feat(api): apply Syncable to Coupon, Review, Refund, PaymentGateway
6. feat(api): apply Syncable to Category, Brand, Tag, Attribute, AttributeTerm

Each commit green: typecheck + lint + Japa.

Verification

  pnpm --filter @calibra/api test
  # All 351+ tests pass + the new ones (one per model).

Then a smoke check:
  pnpm just up
  # Sign in to admin; transition an order's status.
  # Confirm: SELECT * FROM sync_actions ORDER BY id DESC LIMIT 5;
  # Should show the change with sync_groups containing 'merchant:<id>'.

Adjudication rules

1. If a model exposes columns that would leak across merchants if synced
   (e.g. a global admin's notes), flag and discuss. By default, exclude
   them via hiddenColumns.
2. Don't apply Syncable to models we listed as out-of-scope (storefront
   models, internal queue tables).
3. If the mixin's hook chain conflicts with existing afterSave hooks (e.g.
   index updates), surface the conflict — don't paper over it.

Hard rules

- Mutations and recorder rows must be in the SAME transaction.
- Hidden columns must NEVER appear in sync_action.data.
- The mixin must not introduce N+1 queries (no per-row reload).

Report back with: a count of sync_actions rows generated by the full Japa
suite on a clean DB, and the worst-case ratio of mutation:sync_action rows
across the suite (looking for unexpected fanout).
```

---

## Phase 2 — Bootstrap + delta HTTP endpoints

```
Build the GET /admin/sync/bootstrap and GET /admin/sync/delta endpoints.
No WebSocket yet — pure HTTP pull.

Pre-reading:
- ARCHITECTURE.md § Bootstrap, § Delta
- IMPLEMENTATION.md § Phase 2

Worktree:
  git worktree add ../calibra--sync-engine-phase-2 -b feat/sync-engine-phase-2 origin/main
  cd ../calibra--sync-engine-phase-2 && pnpm install

Goal

A client (anything that can speak HTTP) can:
  GET /api/v1/admin/sync/bootstrap?type=full
  → streamed application/x-ndjson with every model instance the operator
    can see, followed by a _metadata_ line with lastSyncId, userSyncGroups,
    schemaHashes.

  GET /api/v1/admin/sync/delta?since=N&until=M (until optional)
  → JSON array of sync actions strictly after N, filtered by the operator's
    sync groups.

Both endpoints respect the bearer + Accept-Language conventions every other
admin endpoint uses.

Why

Bootstrap is the only way to seed an empty IndexedDB. Delta is the recovery
path on WebSocket reconnect when there's a gap.

Scope

In scope:
- apps/api/app/sync/controllers/bootstrap_controller.ts
  - Streamed response using ctx.response.stream() + an async iterable.
  - Cursor pagination per model (1k rows / page) to bound memory.
  - Honors ?type=full and ?type=partial&syncGroups=...
  - Final line is _metadata_={lastSyncId, userSyncGroups, schemaHashes,
    databaseVersion}.
- apps/api/app/sync/controllers/delta_controller.ts
  - Returns { actions, lastSyncId, complete } where complete=false means more
    pages; client calls again with since=lastSyncId.
  - Returns 409 with { error: 'bootstrap_required', minimum_sync_id } when
    since is below the prune floor (default: 7 days, or 1M rows whichever
    is more recent).
- apps/api/app/sync/services/sync_group_resolver.ts:
  resolve(session) → string[].
- OpenAPI spec entries for both endpoints (admin.v1.yaml). SDK codegen
  regenerated. check:api-docs reports 190+2 in sync.
- A Vitest suite in apps/admin/tests/unit/sync/ that exercises both
  endpoints over msw, asserting:
  - bootstrap returns metadata last
  - delta with no changes returns empty actions + complete:true
  - delta with stale since returns 409
  - userSyncGroups filtering: a row from a different merchant never appears

Out of scope:
- WebSocket. That's Phase 3.
- Client-side persistence / object pool. Phase 5.

Architectural constraints

1. Bootstrap MUST stream. Don't buffer the full result into memory — the
   biggest merchants have hundreds of MB. Use cursor pagination + an async
   generator yielding one JSON line per row.
2. The streaming response Content-Type is application/x-ndjson.
3. Cache-Control: no-store on both endpoints.
4. Auth via the existing admin_session cookie + bearer forwarding the proxy
   already does. The endpoints live under /api/v1/admin/* so the proxy's
   forwarding works unchanged.

Tricky bits to budget time for

- Async iteration over a Lucid cursor — Adonis exposes
  `Order.query().exec()` and `.firstOrFail()`, but streaming via
  `eachByChunk` is the safe path. Wrap that in an async iterable.
- The metadata line must be LAST. If the stream errors mid-flight, surface
  via a final {"_type":"_error_",...} line and an HTTP 200 (because we've
  already started writing). The client treats missing _metadata_ as failure.
- Partial bootstrap with multiple groups: the resolver expands a single
  merchant:N into [merchant:N, catalog:N, orders:N, ...] per the model
  registry.

Suggested commit ordering

1. feat(api): sync_group_resolver service + tests
2. feat(api): bootstrap controller (full mode), streamed ndjson
3. feat(api): bootstrap controller (partial mode)
4. feat(api): delta controller + bootstrap_required handling
5. feat(api): OpenAPI entries + SDK regen for sync surface

Verification

  pnpm --filter @calibra/api test
  pnpm --filter @calibra/api exec node ace check:api-docs   # 192/192 in sync
  pnpm --filter @calibra/sdk codegen:check                  # no drift
  pnpm --filter @calibra/admin typecheck

Manual: hit both endpoints with curl + a freshly-issued admin_session cookie
(see this PR's verification section). Bootstrap should stream within 2s on a
bulk-seeded DB.

Adjudication rules

1. The bootstrap response size matters. If a typical merchant produces >100MB
   on test data, flag and discuss before going further; we may need to
   adjust the load_strategy of some models from 'instant' to 'lazy'.
2. If sync_group resolution depends on data not yet loaded (e.g. customer
   sub-merchants), surface — we may need to extend the resolver before
   completing this phase.

Hard rules

- No row leaks across merchants. Add fuzz tests if you're unsure.
- Streamed responses don't buffer.
- 409 bootstrap_required is the ONLY way the delta endpoint signals a gap.

Report back with: bootstrap response time on bulk-seeded data, total bytes
streamed, and how many rows in sync_actions exist after running the full
Japa suite (sanity check).
```

---

## Phase 3 — WebSocket push channel

```
Add the WebSocket layer that pushes sync actions to connected admins.

Pre-reading:
- ARCHITECTURE.md § Push channel, § Server-side architecture § Dispatcher
- IMPLEMENTATION.md § Phase 3

Worktree:
  git worktree add ../calibra--sync-engine-phase-3 -b feat/sync-engine-phase-3 origin/main
  cd ../calibra--sync-engine-phase-3 && pnpm install

Goal

A WebSocket endpoint at wss://<admin-origin>/api/v1/admin/sync/ws that:
1. Authenticates via the admin_session cookie (forwarded by Next.js proxy).
2. Sends HELLO with current lastSyncId, userSyncGroups, schemaHashes.
3. Pushes DELTA frames as sync_actions are recorded, filtered by group.
4. Heartbeats every 25s; drops connections that miss two PONGs.
5. Closes with 4401 / 4408 / 4409 per the protocol spec in ARCHITECTURE.md.

Why

Bootstrap + delta over HTTP is enough for correctness; WebSocket is what
makes the UX 'real-time.' p99 push latency target is 100ms.

Scope

In scope:
- AdonisJS WebSocket integration. Pick @adonisjs/transmit if it can do
  bidirectional frames; otherwise use ws + a small server boot in
  start/sync.ts.
- apps/api/app/sync/controllers/websocket_controller.ts handling upgrade + HELLO.
- apps/api/app/sync/services/connection_registry.ts holding per-session
  state in-process.
- apps/api/app/sync/services/delta_dispatcher.ts that:
  - LISTENs on `sync_actions_new` (postgres NOTIFY channel).
  - On notify, reads sync_actions since last seen id, fans out to every
    matching connection.
- SyncActionRecorder issues `pg_notify('sync_actions_new', '<merchant_id>')`
  in afterCommit of its trx.
- A Next.js route handler at apps/admin/src/app/api/admin/sync/ws/route.ts
  that proxies the WebSocket upgrade to AdonisJS (same-origin proxy
  pattern). This is non-trivial — Next.js 16 WebSocket support is via the
  experimental `proxy.ts`. Validate the path before committing to it.
- Client TypeScript module apps/admin/src/lib/sync/socket.ts:
  - SyncSocketClient class with reconnect-with-backoff, frame routing, no
    React surface yet.
- A Playwright test that opens two browser contexts, mutates in one,
  asserts the other receives a DELTA within 1s.

Out of scope:
- React hooks on top of the socket. Phase 5.
- Multi-instance fanout (sticky LB or Redis). Phase 8.

Architectural constraints

1. Connections are per Adonis instance. Sticky LB is the placeholder.
2. Backpressure: if a client's send buffer exceeds 1MB, drop them with a
   close code so they reconnect from a clean state.
3. Heartbeat is server-driven. Client just replies to PING with PONG.
4. The NOTIFY payload is the merchant_id only. Data isn't in the notify.

Tricky bits to budget time for

- Next.js WebSocket proxying. Next 16 added `proxy.ts` which deprecated
  middleware.ts (we already migrated). Confirm whether proxy can handle
  WebSocket upgrade or if we need a fallback (e.g. socket connects to a
  separate hostname). If it does NOT, fall back to clients connecting
  directly to apps/api with a CORS-allowed origin and a short-lived
  session token from POST /admin/sync/ticket → handshake.
- The dispatcher's notify-listen loop runs forever; supervise it. If it
  dies, the admin app silently stops pushing — wire it to AdonisJS's
  ProcessSupervisor / IgnitorService.
- Reconnect storm on deploy: dispatch HELLO frames in jittered batches if
  >100 reconnects within 1s.

Suggested commit ordering

1. feat(api): connection_registry + heartbeat
2. feat(api): websocket_controller + HELLO handshake
3. feat(api): delta_dispatcher with LISTEN/NOTIFY plumbing
4. feat(api): SyncActionRecorder emits pg_notify in afterCommit
5. feat(admin): SyncSocketClient (no React)
6. feat(admin): Next.js WS proxy route (or fallback: direct connect ticket)
7. test(admin): Playwright cross-tab DELTA propagation

Verification

  pnpm --filter @calibra/api test
  pnpm --filter @calibra/admin test:e2e
  # Manual: open admin in two tabs, mutate in one, watch DELTA in the other
  # within ≤1s. Network tab should show WS frames.

Adjudication rules

1. If the Next.js 16 proxy can't pass WebSocket upgrades, do NOT shoehorn
   it. Surface the limitation, and switch to the ticket-based direct
   connect to apps/api (with strict CORS + Origin check). Update
   ARCHITECTURE.md with the decision.
2. Don't paper over reconnect storms. If your test reveals 1000 clients
   stampede a single Adonis instance, fix the jitter before considering
   the phase done.

Hard rules

- Never include row data in pg_notify payloads (the 8KB limit will bite).
- Connection registry is per-process; never assume a Redis exists yet.
- Heartbeat misses drop the connection — don't make it forgiving.

Report back with: p50 / p99 push latency measured under a synthetic load of
50 connections + 10 mutations/sec. Surface any path you took that deviates
from ARCHITECTURE.md.
```

---

## Phase 4 — GraphQL mutation surface (batched)

```
Replace per-mutation REST calls with a batched GraphQL mutate endpoint.

Pre-reading: ARCHITECTURE.md § Mutation surface § Mode 2 — GraphQL. The
shim is deliberately NOT a full GraphQL gateway.

Worktree:
  git worktree add ../calibra--sync-engine-phase-4 -b feat/sync-engine-phase-4 origin/main
  cd ../calibra--sync-engine-phase-4 && pnpm install

Goal

POST /api/v1/admin/sync/mutate accepts:

{
  "query": "mutation Batched($i1: OrderStatusInput!, $i2: ProductUpdateInput!) {
    m1: orderStatusUpdate(input: $i1) { lastSyncId }
    m2: productUpdate(input: $i2) { lastSyncId }
  }",
  "variables": { "i1": {...}, "i2": {...} }
}

→ { data: { m1: { lastSyncId: 1001 }, m2: { lastSyncId: 1002 } } }

Each aliased mutation maps 1:1 to an existing AdonisJS controller method.
clientTxId on every input enables idempotent retries.

Why

Linear batches because most "mutations" are actually a single user gesture
that touches 3-5 fields across multiple records. We want that win.

Scope

In scope:
- apps/api/app/sync/controllers/mutate_controller.ts — parses the document
  via graphql-tag (no execution engine), dispatches each aliased mutation
  to the right Lucid controller method via the codegen'd dispatch table.
- apps/api/app/sync/services/mutation_dispatch_table.ts — generated map
  { 'orderStatusUpdate': AdminOrdersController.transitionStatus, ... }.
- Idempotency: every input has clientTxId. The recorder upserts on this
  column and returns the previously-issued lastSyncId on duplicates.
- Add clientTxId column to sync_actions (nullable; legacy rows have NULL).
- OpenAPI entry + SDK regen.
- Client-side MutationBatcher in apps/admin/src/lib/sync/mutations.ts that:
  - Collects mutate() calls within the current microtask.
  - Compiles to one GraphQL document.
  - Sends to /api/v1/admin/sync/mutate.
  - Returns per-mutation promises that resolve with their lastSyncId.

Out of scope:
- React hooks. Phase 5.

Architectural constraints

1. We do NOT install a full GraphQL gateway (Mercurius, Apollo). The shim
   is bespoke and ≤500 LOC. If you find yourself exceeding that, stop
   and discuss.
2. The dispatcher does NOT execute side effects beyond the controller method.
   The controller is the authority — same code path as the REST mutation.
3. clientTxId is required on every mutation input. Reject 400 if missing.
4. Validation reuses the existing VineJS validators. Don't duplicate.

Tricky bits

- Aliasing means the same mutation can appear N times with N inputs.
  Handle ordering: actions for m1 must complete before m2 if the user
  expected serialization. Document the contract: aliased mutations run in
  document order (not parallel) — that matches Linear's behavior.
- graphql-tag parses but does not validate against a schema. We don't have
  a schema to validate against (no GraphQL gateway). Our validation is:
  is the field name in the dispatch table? Are the variables valid per
  the VineJS validator for that mutation? Anything else → 400.
- The MutationBatcher must NOT batch across user gestures. Today's
  microtask boundary is fine; if the user clicks two buttons 50ms apart,
  those are two batches.

Suggested commit ordering

1. feat(api): mutation_dispatch_table codegen + Vitest
2. feat(api): mutate_controller + idempotency on clientTxId
3. feat(api): OpenAPI entry + SDK regen
4. feat(admin): MutationBatcher (microtask scheduler)
5. test(api): aliased multi-mutation, retry-idempotency

Verification

  pnpm --filter @calibra/api test
  pnpm --filter @calibra/sdk codegen:check
  # Manual: hit the endpoint with a 3-aliased-mutation document via curl;
  # confirm 3 sync_actions rows + per-mutation lastSyncId responses.

Adjudication rules

1. If the dispatch shim grows past 500 LOC, reconsider Mercurius. Don't
   silently bloat the shim.
2. If we discover an existing controller method whose signature doesn't
   match a clean GraphQL input shape, refactor the controller (don't
   adapt at the GraphQL layer — keep the surface boring).

Hard rules

- No GraphQL gateway / Apollo / Mercurius.
- clientTxId required + idempotent.
- Validation goes through existing VineJS validators.

Report back with: shim LOC count; an example of a batched call with 3
mutations + the resulting sync_actions rows; manual confirmation that a
duplicate clientTxId returns the original lastSyncId.
```

---

## Phase 5 — Client object pool + transaction queue

```
Build the heart of the client: the object pool, the 4-stage transaction
queue, persistence to IndexedDB, and the React hooks.

Pre-reading:
- ARCHITECTURE.md § Client-side architecture (all subsections)
- IMPLEMENTATION.md § Phase 5
- The Phase 0 decision PR (Valtio vs Zustand).

Worktree:
  git worktree add ../calibra--sync-engine-phase-5 -b feat/sync-engine-phase-5 origin/main
  cd ../calibra--sync-engine-phase-5 && pnpm install

Goal

- An object pool that holds the operator's working set of models, reactive
  to changes.
- A transaction queue moving mutations through created → queued → executing
  → completedButUnsynced.
- Persistence: _transactions, _meta, per-model tables in IndexedDB. Hydrated
  on boot; replays unsent transactions before the UI accepts new input.
- React hooks: useSyncObject, useSyncQuery, useSyncMutation.
- A SyncProvider that owns the lifecycle: connect WS, bootstrap if needed,
  hydrate persistence, replay unsent transactions, hand control to the UI.

NO admin page consumes these hooks yet. That's Phase 6.

Why

This is the make-or-break phase. Get the object pool right and the rest is
plumbing.

Scope

In scope:
- apps/admin/src/lib/sync/object-pool.ts (Valtio-backed, per Phase 0 decision).
- apps/admin/src/lib/sync/transaction-queue.ts implementing the 4-stage FSM.
- apps/admin/src/lib/sync/persistence.ts (idb-keyval-backed; uses the
  CACHE_NAME convention from QueryProvider but with a NEW database name to
  not collide with the persisted-query cache).
- apps/admin/src/lib/sync/index.ts exporting the public hook surface.
- apps/admin/src/lib/sync/provider.tsx — SyncProvider component.
- A new section in (authenticated)/layout.tsx that renders SyncProvider
  wrapping QueryProvider when SYNC_ENGINE_ENABLED is on; otherwise renders
  QueryProvider alone. (Both layers can co-exist during the migration.)
- Vitest unit tests for the queue's state machine, idempotency on retry,
  and rebase on conflicting delta.

Out of scope:
- Migrating any admin page off React Query to sync hooks. Phase 6/7.

Architectural constraints

1. The object pool MUST patch in-memory immediately on mutation. Linear's
   pattern — see ARCHITECTURE.md § Transaction queue, step 1.
2. IndexedDB writes happen ONLY when a DELTA confirms the change. The
   pool can be ahead optimistically; persistence always lags by ≤1
   round-trip.
3. Replaying unsent transactions on boot must complete BEFORE the UI
   accepts new input. SyncProvider's children render a hold-state until
   replay finishes.
4. The hooks API is the only surface external code uses. Don't leak the
   object pool or queue.

Tricky bits

- Valtio's proxies and React 19 strict mode: confirm useSnapshot does the
  right thing under double-render.
- Persistence schema: bump databaseVersion on any change. Migration is
  "wipe and re-bootstrap" — no in-place upgrades.
- The replay of unsent transactions on boot: if a transaction targets a
  model the operator no longer has access to (group changed), drop it
  with a console.warn.
- The hooks suspend (use React 19 Suspense) for lazy models. Document the
  contract.

Suggested commit ordering

1. feat(admin): object pool primitive (Valtio backed, no persistence)
2. feat(admin): transaction queue 4-stage FSM + unit tests
3. feat(admin): IndexedDB persistence layer
4. feat(admin): bootstrap orchestrator (calls /sync/bootstrap, hydrates pool)
5. feat(admin): SyncProvider lifecycle + replay
6. feat(admin): useSyncObject / useSyncQuery / useSyncMutation
7. test(admin): integration test exercising the full lifecycle

Verification

  pnpm --filter @calibra/admin test
  pnpm --filter @calibra/admin typecheck
  # Manual: open admin with SYNC_ENGINE_ENABLED=true; the dashboard should
  # still render via React Query (because Phase 6 hasn't migrated it yet);
  # SyncProvider should successfully bootstrap and not error.

Adjudication rules

1. If Valtio's React 19 story is wobbly (frequent re-renders, devtools
   broken), document and fall back to Zustand. Don't ship a broken hook
   surface.
2. The persistence schema is hard to change later; over-design it now
   (versioning, per-model tables, _meta with schemaHashes).

Hard rules

- Optimistic in-memory always; IndexedDB only on server confirmation.
- Replay on boot before UI accepts input.
- No suspense fallback in the SyncProvider itself — children handle their
  own loading.

Report back with: a screen recording (or detailed log) of the bootstrap +
replay sequence, the FSM unit test coverage, and the bundle size delta
(should be under 30KB gzipped for the entire sync layer).
```

---

## Phase 6 — Migrate dashboard to sync hooks

```
Replace the dashboard's React Query hooks with sync hooks, behind a flag.

Pre-reading:
- IMPLEMENTATION.md § Phase 6
- apps/admin/src/app/[locale]/(authenticated)/dashboard/DashboardClient.tsx
  (current React Query implementation)

Worktree:
  git worktree add ../calibra--sync-engine-phase-6 -b feat/sync-engine-phase-6 origin/main
  cd ../calibra--sync-engine-phase-6 && pnpm install

Goal

The dashboard renders via useSyncObject / useSyncQuery when
SYNC_ENGINE_PHASE_6 is on. Visual output identical to current. Existing
Playwright tests pass under both flag states.

Why

Dashboard is the simplest surface (no nested routes, no mutations except
Refresh). Proving the migration here de-risks Phases 7.

Scope

In scope:
- apps/admin/src/lib/queries/dashboard-sync.ts — a sync-engine version of
  every dashboard hook (useOrdersTodayStats, useRevenueTodayStats, etc.).
  Same return shape, different internals.
- A small dispatcher in DashboardClient.tsx that picks between
  lib/queries/dashboard.ts (React Query) and lib/queries/dashboard-sync.ts
  (sync engine) based on the SYNC_ENGINE_PHASE_6 flag.
- The Refresh button calls syncClient.requestDelta() (replaces
  queryClient.invalidateQueries).
- Existing Playwright tests run under both flags; both pass.

Out of scope:
- Migrating other admin pages. Phase 7.
- Removing the React Query path. Phase 8.

Architectural constraints

1. Both code paths co-exist via the flag. No global "feature toggle" that
   removes either.
2. Sync hooks reuse the SAME view types (AdminOrder, AdminCustomer, etc.).
   Don't introduce a parallel type system.
3. Refresh is per-DELTA now, not per-query. Document the semantic change
   in the PR body.

Tricky bits

- Locale switching: the React Query keys included locale; the sync engine
  pool is locale-agnostic. Locale change calls
  syncClient.changePartialBootstrap(['catalog:<id>', ...]) which re-fetches
  models that have locale-dependent serialization.
- Optimistic refresh: the current Refresh button is instant. Under sync,
  it's a no-op if the WS is live (we already have the data). Make Refresh
  trigger a manual delta pull just to give the operator the satisfaction.

Suggested commit ordering

1. feat(admin): dashboard-sync.ts hooks shadowing each useX
2. feat(admin): per-widget dispatcher (flag-gated)
3. fix(admin): locale-change re-bootstrap path
4. test(admin): Playwright runs with both flag states green

Verification

  SYNC_ENGINE_PHASE_6=true pnpm --filter @calibra/admin test:e2e
  SYNC_ENGINE_PHASE_6=false pnpm --filter @calibra/admin test:e2e
  # Both pass.

Manual: open the dashboard with the flag on, watch network tab — no React
Query fetches should occur. Mutate an order in another tab; the dashboard
should reflect within 1s.

Adjudication rules

1. If a widget renders empty or stale, capture the case and add a Playwright
   regression — don't paper over.
2. If the sync hook surface needs new primitives (e.g. an aggregation hook
   we didn't anticipate), update ARCHITECTURE.md § Hooks API in the same
   PR.

Hard rules

- Both paths green at end of phase.
- Visual output identical with the flag on/off.
- No new ad-hoc state in DashboardClient.tsx.
```

---

## Phase 7 — Migrate remaining admin surfaces

```
Migrate the rest of the admin (orders list + detail, products list + detail,
customers, coupons, reviews) onto sync hooks.

Pre-reading: IMPLEMENTATION.md § Phase 7. The Phase 6 pattern is the
template.

Worktree: one per resource is overkill. Do this in one branch with
per-resource commits:
  git worktree add ../calibra--sync-engine-phase-7 -b feat/sync-engine-phase-7 origin/main
  cd ../calibra--sync-engine-phase-7 && pnpm install

Goal

Every admin page reads through useSyncObject / useSyncQuery. The
/api/admin/[...path] proxy continues to serve mutations from non-syncable
endpoints (CSV export, etc.) but is no longer the read path for any page.

Why

The dashboard alone doesn't unlock the UX win — operator-to-operator
real-time collab only matters when the operator is on the page being
edited.

Scope

In scope (one per resource, in this order):
1. Orders list (OrdersListClient.tsx)
2. Orders detail (OrderDetailClient.tsx) — the most complex; includes
   the optimistic status mutation, which moves from React Query's
   onMutate/onError to TransactionQueue's rebase logic.
3. Products list + detail
4. Customers list + detail
5. Coupons list + detail
6. Reviews list

For each: shadow the existing useXList / useX hook with a sync-engine
version, flag-gate per phase (SYNC_ENGINE_PHASE_7_<resource>), Playwright
runs in both states.

Out of scope:
- Removing the React Query layer. Phase 8.
- New mutation surfaces (e.g. coupon bulk create) — additive features go
  through the regular product roadmap.

Architectural constraints

1. The optimistic order status mutation in OrderDetailClient.tsx is the
   non-trivial case. The current React Query onMutate / onError logic
   translates to:
   - useSyncMutation().update('Order', id, { status }) — TransactionQueue
     handles optimistic patching of the object pool.
   - Rollback on error is automatic (the queue rebases off the next
     authoritative DELTA, which doesn't include the failed mutation).
   - Conflict (e.g. an invalid state transition) returns 409 from the
     mutate endpoint; the queue marks the transaction failed and the UI
     shows the existing error banner.
   The behavior should be visually indistinguishable for the operator.

2. Mutation batching: changing 3 orders' statuses on the list page in
   rapid succession should issue ONE GraphQL document, not three. Verify
   in DevTools.

3. Per-resource Playwright tests pass with the flag on. If they don't,
   stop and fix the resource before moving to the next.

Tricky bits

- Filter / search state on list pages was in URL via SearchInput. The sync
  hook surface doesn't drive HTTP requests, so SearchInput is filtering
  against the object pool locally. For small datasets this is fine; for
  100k+ products it requires a server-side query. The compromise: filters
  with simple equality go local (status, category); search (text) hits a
  separate /admin/sync/search endpoint that returns a list of matching IDs
  without populating the pool (deferred hydration).

- The OrderStatusBadge in the header flips immediately under the new flow.
  The current code does this via React Query's optimistic data; the sync
  engine does it via the Valtio proxy. Visual behavior identical; the
  internals are simpler.

Suggested commit ordering

One commit per resource. Each one stands alone. Each one ships behind its
own flag (SYNC_ENGINE_PHASE_7_ORDERS, _PRODUCTS, etc.) so we can roll back
the noisiest one without affecting the others.

Verification

For each resource:
  SYNC_ENGINE_PHASE_7_<RESOURCE>=true pnpm --filter @calibra/admin test:e2e
  SYNC_ENGINE_PHASE_7_<RESOURCE>=false pnpm --filter @calibra/admin test:e2e

End of phase:
  SYNC_ENGINE_PHASE_7=true pnpm --filter @calibra/admin test:e2e
  # All resources flagged on; full e2e passes.

Adjudication rules

1. If a resource has a filter / search dimension we can't handle locally,
   stop and spec the /admin/sync/search endpoint before continuing.
2. If a Playwright test reveals a divergence under the flag, fix the sync
   hook OR roll back this resource's flag — don't change the test.

Hard rules

- No resource lands without per-resource flag + green Playwright in both
  states.
- The order status mutation behavior is identical to today's UX (anything
  else is a regression).
- React Query stays in the codebase until Phase 8.
```

---

## Phase 8 — Production rollout + tear-down

```
Make the sync engine operationally real and remove the React Query layer.

Pre-reading: IMPLEMENTATION.md § Phase 8.

Worktree:
  git worktree add ../calibra--sync-engine-phase-8 -b feat/sync-engine-phase-8 origin/main
  cd ../calibra--sync-engine-phase-8 && pnpm install

Goal

- Observability: OpenTelemetry instrumentation across the sync hub, a
  Grafana dashboard, alerts on the SLOs.
- Multi-instance fanout via Redis pub/sub (sticky LB was the placeholder).
- Stress test passing the latency budget (p99 ≤ 100ms with 200 connections
  per merchant, 10 mutations/sec).
- Master flag SYNC_ENGINE_ENABLED flipped for a pilot client; soak for two
  weeks.
- Tear-down PR: remove lib/queries/*.ts, remove the /api/admin/[...path]
  proxy, remove every flag from Phase 6/7 (they're all on now).

Why

The first 7 phases shipped the code. Phase 8 ships the product.

Scope

In scope:
- OpenTelemetry: spans on bootstrap, delta, mutate; metrics for
  sync.action.lag_ms, fanout_count, connection_count, queue_depth (client-
  sampled), pg.replication_slot.lag_bytes.
- Grafana dashboard + alerts.
- Redis pub/sub for multi-instance fanout: each instance subscribes to
  `sync_actions:<merchant_id>` and republishes to its connections. Replaces
  the in-process registry's role.
- Stress test as a nightly CI job.
- Pilot rollout to one client; soak for 14 days.
- Cleanup PR removing the React Query and proxy layers.

Out of scope:
- New features (the engine is feature-complete; new work is in product
  roadmap).

Architectural constraints

1. Sticky LB is the FALLBACK if Redis is unavailable. Redis is the
   default. Design Redis as a hard dependency — if it's down, the WS
   connections are NOT fanout-correct (they only see local mutations).
   We tolerate the degradation, but the alert fires loudly.
2. The stress test runs against staging continuously. Failed nightly runs
   block merges into main until fixed.
3. Tear-down is a SEPARATE PR after the soak completes. Don't combine the
   rollout with the removal.

Tricky bits

- Redis fanout introduces a "publisher loop" risk: instance A publishes,
  instance B receives and re-publishes. Prevent by tagging each pub/sub
  message with the originating instance id.
- The pilot client soak should include a deploy event during the soak —
  exercises the reconnect storm path.
- Tear-down: any place lib/queries/* is imported is a code smell.
  Find-and-remove must be exhaustive. The Phase 7 flags being "on" is the
  signal that they're safe to remove.

Suggested commit ordering

1. feat(api): OpenTelemetry instrumentation
2. feat(api): Redis pub/sub fanout (with in-process fallback)
3. feat(ops): Grafana dashboard JSON + alerts as code
4. test(api): stress test scripts + nightly CI job
5. ops(api): pilot flag enabled (separate PR; merges manually)
6. chore(admin): tear-down — remove lib/queries/*, /api/admin proxy, flags

Verification

  # Nightly:
  pnpm sync-engine:stress
  # p99 ≤ 100ms; no transactions lost; no replication slot lag > 1GB.

  # After pilot soak:
  # Search the codebase for residual React Query references:
  grep -r "@tanstack/react-query" apps/admin/src    # Should be empty.
  grep -r "useQuery\|useMutation" apps/admin/src    # Should be empty.

Adjudication rules

1. If the stress test reveals a bottleneck that requires architectural
   change (e.g. partitioning sync_actions by merchant), document and
   schedule, then proceed with the tear-down for the non-stress-bound
   parts.
2. If the pilot soak surfaces an incident, DO NOT proceed to the
   tear-down. Roll back via SYNC_ENGINE_ENABLED=false, investigate.
3. Don't remove the React Query layer until SYNC_ENGINE_ENABLED has been
   true in production for ≥14 days for the pilot client without a
   sync-related incident.

Hard rules

- Telemetry must exist before rollout. Don't ship blind.
- Stress test is a real gate, not a vanity number.
- Pilot soak is sacred. No tear-down until soak is clean.
- The kill-switch (SYNC_ENGINE_ENABLED=false) must work cleanly all the
  way through tear-down + 30 days.

Report back with: the Grafana dashboard URL, the stress-test latency
distribution, and a screenshot of the cleanup PR's diff stats.
```

---

## Notes on using these prompts

- **Each prompt is the entire brief.** Claude Code does not need any other context to start. The repo state at the time should match the end of the previous phase.
- **The "Working directory" line is literal.** Update the host path if the repo lives somewhere else; otherwise the worktree commands fail.
- **Phases are not parallelizable arbitrarily.** 0 must precede 1. 2 must precede 3 (delta semantics depend on the recorder being live). 4 must precede 5 (the client mutation surface targets the GraphQL endpoint). 6 must precede 7. 8 must come last.
- **Path B switch.** If we pivot to Path B between Phase 4 and Phase 5, write the Path B Phase 5 prompt that wires TanStack DB collections to ElectricSQL shapes, then continue with Phases 6-8 (which are largely the same migration of admin pages off React Query).
- **Each prompt's "Report back with" section is a forcing function** for the engineer to share concrete numbers, not a green-CI checkmark. Don't accept "all green" as the closing of a phase without those numbers.
