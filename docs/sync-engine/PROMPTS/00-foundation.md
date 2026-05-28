================================================================
SYNC ENGINE — FOUNDATION & PATH RE-BASE (read before any phase prompt)
================================================================

This is the master spec for adding a **Linear-style sync engine** to `apps/admin`
(operator panel only — the storefront `apps/web` stays REST/SSR). It RE-BASES the
2026-05-20 dossier onto the current codebase and records the now-final path. The
dossier's `RESEARCH.md` (Linear/Convex/Replicache field notes) is RETAINED alongside this
folder as sourced context; the prior `README.md` / `ARCHITECTURE.md` / `IMPLEMENTATION.md`
/ `PROMPTS.md` have been REPLACED by this `PROMPTS/` set (`00-foundation.md` + the per-
phase prompts). **Where this doc and the retained research disagree, THIS doc wins.**

Goal bar (unchanged from the dossier): (1) sub-50ms perceived mutation latency,
(2) cross-operator live updates ≤1s, (3) offline-safe queued mutations that replay on
reconnect. Deliver Linear's *feel* on our own infrastructure.

----------------------------------------------------------------
0. DECIDED PATH (resolves dossier § "Path Decision")
----------------------------------------------------------------

**BUILD on our own infra (dossier "Path A").** Confirmed by the product owner:
- ❌ Path B (ElectricSQL + TanStack DB) — REJECTED. Commercial/paid posture, a new
  sidecar service + replication-slot ops, and it hits the same scale wall (see §1.4).
- ❌ Path C (Replicache) — REJECTED. License + "implement mutators twice" coupling.
- ✅ Postgres (the one we already run) is the change-feed substrate. **IndexedDB** is
  the client durable store. Push rides **`@adonisjs/transmit` (SSE)**, already wired.

----------------------------------------------------------------
1. FIVE REALITIES THAT CHANGED SINCE THE DOSSIER (all load-bearing)
----------------------------------------------------------------

The dossier was written before PR #49 and assumes a world we are not in. Every phase
prompt is built on these corrections — do NOT copy the dossier's stale assumptions.

**1.1 SINGLE-TENANT.** There is NO `merchant_id` / `tenant_id` / `workspace_id` column
on any model or migration (verified across `apps/api/database/migrations/` and the
generated `apps/api/database/schema.ts`). The agency clones the repo per client, so
each deployment IS one store.
→ Sync groups are NOT per-merchant. RBAC is simply **"is admin"** (the existing
  `admin` role gate). The dossier's `merchant:42` / `customer:99` sync-group security
  model is DELETED. We still partition the change stream by **domain** (`orders`,
  `catalog`, `customers`, …) but purely for **fanout efficiency**, never for tenant
  isolation. Strip every `merchant:*` reference from the dossier when porting an idea.

**1.2 TRANSPORT = `@adonisjs/transmit` (SSE over Redis pub/sub), ALREADY WIRED.**
- Server: `apps/api/config/transmit.ts` (Redis transport, `pingInterval: 30s`,
  per-spin channel namespacing), `apps/api/start/transmit.ts` (routes gated by
  `middleware.auth({ guards: ["api"] })`, per-channel `authorize` resolvers, subscriber
  gauges in `domain_metrics.ts`). Used today by `product_import/event_bus.ts` +
  `product_export/export_event_bus.ts`.
- Client: `apps/admin/src/lib/transmit.ts` (`@adonisjs/transmit-client` ^1.1.0, lazy
  singleton, CSRF-aware), proxied through `apps/admin/src/app/api/transmit/[...path]/route.ts`
  (preserves `cache-control: no-transform`, streams `upstream.body`).
→ Use Transmit/SSE for the delta PUSH channel. **Do NOT build a custom WebSocket
  server.** SSE is server→client (exactly what delta push needs); the client→server
  direction (mutations, pings) already goes over the REST proxy. The dossier's
  `wss://…/sync/ws`, HELLO/PING/PONG frames, and connection-registry are replaced by
  Transmit channels + the existing keepalive. Redis pub/sub ALSO means multi-process
  fanout works today — the dossier's "sticky LB vs Redis pubsub" Phase-8 worry is moot.

**1.3 MUTATIONS = REST / OpenAPI / SDK + the unified TableView grammar (PR #49).**
Reads go through `GET /api/v1/admin/<resource>?filter[]=field:op:value&sort[]=…&page=&limit=`
(`apps/api/app/lib/table_view/`), the SDK is `openapi-fetch` (`packages/sdk`,
`src/generated/admin.d.ts`), writes go through `apiMutate` →
`apps/admin/src/app/api/admin/[...path]/route.ts` (CSRF double-submit) → controllers.
→ **No GraphQL.** Delete the dossier's GraphQL mutation shim entirely. Mutations stay
  REST. If we ever want Linear-style batching, it is a REST `POST /admin/sync/mutate`
  taking an array of operations — NOT a GraphQL document. (Batching is NOT in v1.)

**1.4 SCALE = 100k products / 500k users / 100k orders** (the bulk seeder targets, see
`apps/api/database/seed_modules/0010_bulk_dataset_seeder.ts`).
→ **Full-workspace bootstrap into the client is INFEASIBLE.** We do NOT mirror whole
  collections into IndexedDB and we do NOT build a local query engine over all rows.
  The dossier's `GET /sync/bootstrap?type=full` "stream every instant model" and
  `useSyncQuery('Order', q => …)` (local query over the full pool) are DROPPED for the
  large collections. **Reads stay SERVER-PAGINATED via the TableView grammar.** The
  sync engine keeps the **loaded working set** live and replays optimistic mutations —
  it is a reactive cache over what the operator has open, not a complete replica. This
  is the single biggest deviation from the dossier; it is non-negotiable at this scale.

**1.5 FE FOUNDATION = TanStack Query with a PERSISTED cache + existing optimism.**
- `apps/admin/src/lib/queries/QueryProvider.tsx`: `PersistQueryClientProvider` +
  `createAsyncStoragePersister` over `idb-keyval` (catalog ^6.2.2), keyed
  `calibra-admin-query-cache:${host}`, 24h max-age, buster `"v2"`, **dehydrate filter
  currently persists only `["dashboard", …]`** (line ~142), 1000ms throttle,
  `removeOldestQuery` on quota.
- Existing optimism: `apps/admin/src/lib/queries/orders.ts` (`onMutate`/`onError`/
  `onSettled` rollback for status), `apps/admin/src/lib/products/mutations.ts`
  (optimistic list patch for quick-edit), `apps/admin/src/lib/queries/use-settle-mutation.ts`
  (settle-then-persist for conversational toggles, 1200ms quiet timer).
→ The sync engine **EXTENDS TanStack Query**; it does NOT introduce a Valtio/Zustand
  object pool. **The TanStack Query cache IS our object pool** — a partial, loaded-
  working-set pool, which is all that is feasible at 100k scale. We add Linear's
  mechanics (a delta stream + a transaction queue + server-reconciliation) ON TOP of
  it. This avoids a dual-state-system tax and reuses the persisted-cache work already
  shipped. (See §6 DECISION — the one place to push back before client phases.)

----------------------------------------------------------------
2. ARCHITECTURE (Path A, reconciled to the above)
----------------------------------------------------------------

```
  CLIENT (apps/admin)                                   SERVER (apps/api)
  ┌──────────────────────────────────────┐             ┌─────────────────────────────────────┐
  │ React component                       │             │ Admin write controller              │
  │   useOrdersList() / useOrder(id)      │  optimistic │   validate → db.transaction:        │
  │   useOptimisticMutation(...)          │── REST ─────▶│     • write entity (existing)       │
  │                                       │  /api/admin  │     • SyncActionRecorder.record(trx)│
  │ TanStack Query cache  ◀───────────────┤◀─ {data,    │     (atomic: same txn → same commit)│
  │   (= the "object pool",               │  lastSyncId} │   afterCommit: Transmit.broadcast   │
  │    loaded working set)                │             │     ('admin/sync/<domain>', action) │
  │        ▲           ▲                  │             └───────────────┬─────────────────────┘
  │        │ patch     │ confirm/rollback │                             │ INSERT (BIGSERIAL id)
  │   ┌────┴─────┐  ┌──┴──────────────┐   │                  ┌──────────▼───────────┐
  │   │ Delta    │  │ Transaction     │   │   SSE (Transmit) │ sync_actions table   │
  │   │ applier  │◀─┤ queue (FSM,     │   │◀── admin/sync/* ─│ (id, model, action,  │
  │   └────┬─────┘  │ IndexedDB-      │   │   Redis pub/sub  │  data, channel, ...) │
  │        │        │ persisted)      │   │                  └──────────────────────┘
  │   ┌────▼─────────┴───────────────┐│   │   recovery:      GET /admin/sync/delta?since=N
  │   │ IndexedDB: _meta (lastSyncId │ │   │
  │   │  per channel) + _transactions│ │   │
  │   └──────────────────────────────┘ │   │
  └──────────────────────────────────────┘
```

**2.1 Server — `sync_actions` backbone (Phase 1).**
`sync_actions(id BIGSERIAL PK, model_name TEXT, model_id BIGINT, action CHAR(1) CHECK
IN ('I','U','D'), data JSONB, channel TEXT, actor_user_id BIGINT, client_tx_id TEXT
UNIQUE NULLABLE, created_at TIMESTAMPTZ)`. `id` is the global `lastSyncId` (single-
tenant → one global sequence is correct). Indexes: `(id)`, `(channel, id)`,
`UNIQUE(client_tx_id) WHERE client_tx_id IS NOT NULL`.
- `SyncActionRecorder.record(trx, {...})` appends INSIDE the mutation's Lucid
  transaction (mirrors how `orderNumberService.allocate(trx)` runs inside the order
  store txn) → atomic; rolls back with the mutation; only committed state is ever
  observable.
- A `Syncable` Lucid mixin auto-records on `afterSave`/`afterDelete` for the simple
  per-row case; cross-row/derived events record manually.
- `data` is the post-image from a transformer **`forSync` variant** that reuses the
  existing column-exclusion (`apps/api/app/transformers/*`) so hidden/sensitive
  columns NEVER enter the stream. `D` carries `data: null`.
- The mutation response envelope (`apps/api/app/transformers/api_envelope.ts`)
  gains `lastSyncId` so the client correlates its optimistic write with the delta.

**2.2 Server — push + recovery (Phase 2).**
- `afterCommit` of the recorder's transaction → `transmit.broadcast('admin/sync/<channel>',
  syncAction)`. Redis transport carries the payload (no 8KB `pg_notify` limit, so we do
  NOT need a separate LISTEN/NOTIFY consumer — a genuine simplification vs the dossier).
- Channel `authorize` in `start/transmit.ts`: admin role only (reuse `admin_middleware`
  logic). Channels: `admin/sync/orders`, `/catalog`, `/customers`, `/coupons`,
  `/reviews`, plus `/counts` for tab badges.
- Recovery: `GET /api/v1/admin/sync/delta?since=<id>&channels=orders,catalog` →
  `{ actions, lastSyncId, complete }` (paginated, max 5000). Used on reconnect/gap.
  `since` below the prune floor → `409 {error:"resync_required"}` and the client
  invalidates loaded queries + refetches (NOT a full mirror).
- Retention: a queue job prunes `sync_actions` older than 7 days.

**2.3 Client — reactive reads on the TanStack Query cache (Phase 3).**
A `SyncProvider` subscribes (via `lib/transmit.ts`) to the domain channels for the
surfaces in use. The **delta applier** maps each action to cache ops:
- `U` → `setQueryData(["admin", <model>, "detail", id], postImage)` + map-patch the row
  in any cached list pages that already contain `id`. **Never fetch missing rows.**
- `I` → the row may or may not match the active server-side filter, so mark the
  affected list + counts queries **stale** (background refetch) rather than guessing an
  insertion position. (This is the correct behaviour with server pagination.)
- `D` → remove the row from cached lists + detail; refetch counts.
Track `lastSyncId` per channel in IndexedDB `_meta`. On reconnect, pull `delta?since=` and
apply; if the gap is too large, invalidate loaded queries.

**2.4 Client — optimistic mutation engine + offline queue (Phase 4).**
- Transaction queue with Linear's 4-stage FSM (`created → queued → executing →
  completedButUnsynced`), persisted to IndexedDB `_transactions` so a tab crash / flight
  mode replays on reopen.
- `useOptimisticMutation` generalizes the existing `onMutate` pattern: snapshot the
  affected detail + list caches, apply the optimistic patch, send via `apiMutate`,
  rollback on error, and **confirm via server-reconciliation** — the transaction is
  finalized when the SSE delta carrying its `lastSyncId` arrives (Convex "Server
  Reconciliation"; conflicts dissolve to last-writer-wins by `sync_actions.id`).
- `clientTxId` per mutation → the recorder upserts on `client_tx_id` so a retry after
  reconnect is idempotent.
- Adopt across existing mutation hooks (migrate orders-status + products quick-edit off
  their bespoke `onMutate` onto the helper; add favorites, reviews moderate/trash, etc.).

**2.5 Client — filter responsiveness (Phase 5, separable, can ship early).**
Local-first `useTableView` (`apps/admin/src/lib/table-view/use-table-view.ts`): hold the
parsed query in local state so controls flip instantly, sync the URL via `router.replace`
in the background, keep `keepPreviousData` for the table. Fixes the "filter lags a beat"
issue (today every facet click pays a Next App Router soft-navigation round-trip before
the control updates).

----------------------------------------------------------------
3. SINGLE-TENANT RBAC & SECURITY
----------------------------------------------------------------

- Every `/admin/sync/*` endpoint + every `admin/sync/*` Transmit channel requires the
  `api` guard AND admin role. No tenant scoping (there are no tenants).
- `sync_actions.data` comes ONLY from the `forSync` transformer variant → no hidden
  columns (passwords, tokens, private notes) ever broadcast. Assert this in tests.
- Mutations keep the existing CSRF double-submit on the proxy.

----------------------------------------------------------------
4. "GOODIES" (enhancements over the dossier, leveraging our Postgres + Transmit)
----------------------------------------------------------------

- **Unify with existing domain events.** `apps/api/start/events.ts` already fans
  `order:status_changed → CacheInvalidation`. Emit the sync action from the SAME hook
  so one event drives cache invalidation AND the sync broadcast — no parallel wiring.
- **No separate NOTIFY consumer.** Because Transmit already multiplexes over Redis,
  the recorder broadcasts directly in `afterCommit`; we skip the dossier's
  `LISTEN sync_actions_new` dispatcher process entirely.
- **`lastSyncId` in every list/detail envelope** (not just mutations) → a freshly
  loaded page knows its sync watermark, so the delta applier never double-applies.
- **Presence (future).** Transmit can later carry "operator X is viewing order 42"
  for Linear-style avatars — out of v1 scope, but the channel infra makes it cheap.

----------------------------------------------------------------
5. PHASE MAP (the prompt set — each phase is feature-flagged + additive)
----------------------------------------------------------------

Each phase ships behind `SYNC_ENGINE_*` flags; React Query stays the default until the
final adoption phase. Nothing is removed until the engine is proven.

- **Phase 1 (backend) — sync_actions backbone.** Table + `SyncActionRecorder` +
  `Syncable` mixin + per-mutation recording + `forSync` transformer variant +
  `lastSyncId` in the envelope + Japa tests. ← PROMPT WRITTEN (file below).
- **Phase 2 (backend) — push + recovery.** Transmit domain channels + broadcast-on-
  commit + admin channel auth + `GET /admin/sync/delta` + retention job + OpenAPI named
  schemas + SDK regen + Japa tests.
- **Phase 3 (client) — reactive reads.** `SyncProvider` + Transmit subscription + delta
  applier (cache patching) + `_meta`/`lastSyncId` in IndexedDB + reconnect/gap recovery.
- **Phase 4 (client) — optimistic mutation engine.** Transaction-queue FSM +
  `useOptimisticMutation` + IndexedDB `_transactions` + offline replay + idempotency +
  adoption across existing mutation hooks.
- **Phase 5 (client) — filter responsiveness.** Local-first `useTableView` (separable).
- **Phase 6 — hardening + adoption + observability.** OTel signals (action lag, fanout,
  connection count, queue depth) + Grafana board + flag flip + stress/soak. Reuse the
  existing metrics registry (`apps/api/app/services/metrics/domain_metrics.ts`).

----------------------------------------------------------------
6. CLIENT SUBSTRATE — DECIDED: TanStack Query cache (2026-05-29)
----------------------------------------------------------------

**Decision (confirmed by the product owner): the TanStack Query cache IS the client
substrate / "object pool."** We layer Linear's delta stream + transaction queue +
server-reconciliation on top of it. We do NOT introduce a Valtio/Zustand object pool or
a local query engine, because:
  (a) the TanStack Query cache already IS a keyed store of loaded models, with a shipped
      IndexedDB persister — a "partial object pool" by another name;
  (b) at 100k+ rows a complete client mirror / local query engine is impossible, so a
      pool could only ever hold the loaded working set anyway;
  (c) it avoids running two reactive state systems and rewriting every read hook.

The dossier's Valtio object pool + `useSyncObject`/`useSyncQuery` local-query API is
DROPPED. Reads keep their existing `useXList()` / `useX(id)` TanStack Query hooks; the
sync engine patches that cache from the delta stream (Phase 3) and writes through it
optimistically (Phase 4).

DEFERRED (post-v1, optional): a true in-memory object pool for BOUNDED domains only
(settings, taxonomy categories/brands/tags, a single open order's sub-resources, one
customer's detail) where a full local mirror is cheap. Not in scope for Phases 1–6.

----------------------------------------------------------------
7. CONVENTIONS (apply to EVERY phase — from the repo AGENTS.md set)
----------------------------------------------------------------

- **Parallel-track branching (load-bearing):** the ENTIRE sync engine lives on the
  long-lived `sync-engine` branch (cut from `origin/main`) so it never destabilizes `main`
  or other in-flight PRs. Per phase:
    1. `pnpm spin sync-engine-phase-<n>` — spins a worktree + draft PR off `origin/main`.
    2. In the worktree: `git fetch origin && git merge origin/sync-engine` — folds in
       `00-foundation.md` + every previously-merged phase (the spin started from `main`,
       so this is the step that actually puts you on the parallel track).
    3. Retarget the draft PR to the parallel branch: `gh pr edit <PR#> --base sync-engine`.
    4. Merge the phase PR **into `sync-engine`**, NEVER into `main`.
  `sync-engine` is promoted to `main` only via ONE final integration PR once the engine is
  proven (Phase 6 soak). Verify a spin with `pnpm spin doctor sync-engine-phase-<n> --json`.
- **Commit scopes (exact):** `api`, `admin`, `sdk`, `ui` (=packages/shared), `agents`.
  A sync-engine change in `apps/api` is `feat(api): …`, in `apps/admin` is
  `feat(admin): …`. Conventional Commits, subject-only unless the WHY needs a 2–4 line
  body.
- **Comments:** JSDoc `/** */` only, never inline `//`.
- **Deps:** NO new package without explicit human approval (the `check-pnpm-add-catalog`
  hook enforces it). Already-present + sanctioned for this work: `@adonisjs/transmit`,
  `@adonisjs/transmit-client`, `idb-keyval`, `@tanstack/react-query`,
  `@tanstack/react-query-persist-client`. Adonis-ecosystem deps pin inline in
  `apps/api/package.json`; everything else via the pnpm catalog.
- **Backend endpoints:** every new endpoint ships a Japa functional test (401 + 403 +
  happy-path `response.assertAgainstApiSpec()` + one test per dimension) AND a named
  OpenAPI schema component in `docs/api/reference/openapi/common|admin/components/schemas/`
  ($ref'd, never inlined). After spec changes: `pnpm --filter @calibra/sdk run codegen`
  and commit the regenerated `packages/sdk/src/generated/admin.d.ts`.
- **Gates (all green before PR):** `pnpm --filter @calibra/api typecheck` + `test`,
  `pnpm --filter @calibra/admin typecheck`, `just lint`, `just docs-check`,
  `pnpm --filter @calibra/sdk run codegen:check`.
- **Settle-then-persist** stays the pattern for conversational toggles; the sync engine
  does not replace it (the backend same-value no-op contract still applies).
