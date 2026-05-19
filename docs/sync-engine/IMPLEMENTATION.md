# Calibra Admin Sync Engine — Phased Implementation Plan

> Prerequisite reading: [`README.md`](./README.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md). This document is a sequencing plan — it doesn't re-justify the design; it tells you what to build, in what order, and how to know each phase is done.

**Scope.** This plan implements **Path A — Build (Linear-style)**. The Path B (ElectricSQL + TanStack DB) version of this plan is ~40% shorter; see `IMPLEMENTATION-B.md` if/when we choose that path.

**Cadence.** Each phase ends with a PR that ships into `main` behind a feature flag (`SYNC_ENGINE_PHASE_<N>`). Nothing lights up for end users until Phase 8 flips the master switch. Until then, the existing React Query implementation stays default.

---

## Phase 0 — Prework (1 week)

We do *not* start writing the sync engine until these are in place.

**Deliverables**

- `apps/api/database/migrations/<n>_create_sync_actions.ts` — the `sync_actions` table with indexes per `ARCHITECTURE.md § Data model`.
- `apps/api/app/services/sync_action_recorder.ts` — append-only writer, takes a transaction client. Used by every mutation going forward.
- `tooling/sync-model-codegen/` — codegen that walks Lucid models, reads `@syncable()` metadata, emits a TypeScript ModelRegistry for both server (`apps/api/app/sync/generated/model-registry.ts`) and client (`apps/admin/src/lib/sync/generated/model-registry.ts`).
- Decision documented in PR: **Valtio vs Zustand vs custom proxy.** Bench the three with a 5k-object pool reactive update and pick.
- Feature flag plumbing: `SYNC_ENGINE_ENABLED` env var checked at the layout level. When off (production until Phase 8), the sync engine paths short-circuit and React Query stays in use.

**Acceptance**

- `pnpm --filter @calibra/api migration:run` applies cleanly on dev DB.
- A Japa test asserts that creating an `Order` via the existing controller appends one row to `sync_actions` inside the same transaction.
- Codegen runs in CI; mismatch between generated registry and Lucid models fails the build.

**Risks**

- Codegen drift between server and client. Mitigation: codegen runs in `prebuild` and the SDK package; output files are committed and CI checks `git diff` is empty after running.

**Out of scope**

- No WebSocket, no bootstrap, no client object pool yet. We're building scaffolding.

---

## Phase 1 — Sync action recording on every mutation (1 week)

Wire every existing AdonisJS controller method to record sync actions.

**Deliverables**

- A Lucid mixin / model trait `Syncable` that registers `afterSave` / `afterDelete` hooks. Each hook composes `{ modelName, modelId, action, data, syncGroups }` and calls `SyncActionRecorder.record`.
- Apply mixin to every model the admin reads / writes: `Order`, `OrderLineItem`, `Product`, `ProductVariation`, `Customer`, `Coupon`, `Review`, `Refund`, `PaymentGateway`, `Category`, `Brand`, `Tag`, `Attribute`, `AttributeTerm`. Storefront-only models (`Cart`, `CartItem`) are excluded.
- The recorder writes `sync_groups` based on a per-model `syncGroupsFor(instance)` static method. Default: `[\`merchant:\${instance.merchantId}\`]`.
- All 351 existing Japa tests pass with the recorder in place (it's strictly additive).

**Acceptance**

- A new Japa suite asserts: for every mutation in the admin route table, a corresponding `sync_actions` row lands and rolls back when the mutation rolls back.
- `sync_actions` table grows by ~1 row per existing test that mutates state.
- DB query count budget unchanged (no N+1 from the recorder).

**Risks**

- Recorder errors silently swallowing real mutation failures. Mitigation: recorder failures `throw` from the hook; the transaction rolls back atomically.
- Cross-row events (e.g. an order touches N line items, each emits its own row) blow up `sync_actions` volume. Mitigation: measure on staging seed data; bulk-coalesce at the recorder if a single mutation generates >50 rows.

---

## Phase 2 — Bootstrap + delta HTTP endpoints (1.5 weeks)

The pull side of the sync surface, no push yet.

**Deliverables**

- `apps/api/app/sync/controllers/bootstrap_controller.ts` — streams `application/x-ndjson` for `?type=full` and `?type=partial&syncGroups=...`. Uses Lucid cursor pagination internally to avoid loading everything into memory.
- `apps/api/app/sync/controllers/delta_controller.ts` — `GET /admin/sync/delta?since=N&until=M` returns `{ actions, lastSyncId, complete }`. Filters by the caller's `userSyncGroups`.
- `apps/api/app/sync/services/sync_group_resolver.ts` — computes `userSyncGroups` from session. Default rule: admin role → `merchant:${session.user.merchantId}` plus its sub-groups.
- The recorder's `sync_groups` array is correctly populated and queryable via the GIN index added in Phase 0.
- A client-side recovery integration test (Vitest in apps/admin) that:
  1. Calls bootstrap, accumulates models into a Map.
  2. Asserts the metadata line ends the stream.
  3. Calls delta with `since=<lastSyncId>`, asserts no actions (no new mutations).
  4. Triggers a mutation via the existing proxy, calls delta again, asserts one action arrives.

**Acceptance**

- Bootstrap completes in <2 s for a typical merchant (10k orders, 50k line items, 5k customers, 50k products) on dev hardware.
- Delta with no changes returns under 50 ms.
- `check:api-docs` includes both endpoints (OpenAPI spec entries + SDK regen).

**Risks**

- Bootstrap memory blow-up at scale. Mitigation: streamed cursor pagination, with a max page size (1000 rows per cursor).
- A partial bootstrap that streams the wrong `userSyncGroups` (auth bypass). Mitigation: integration tests that assert a `merchant:42` admin's bootstrap never includes a row with `sync_groups @> '{merchant:43}'`.

---

## Phase 3 — WebSocket push channel (1.5 weeks)

Real-time fanout.

**Deliverables**

- `apps/api/app/sync/controllers/websocket_controller.ts` — handles WS upgrade, runs the HELLO handshake, registers in the `ConnectionRegistry`.
- `apps/api/app/sync/services/delta_dispatcher.ts` — boots a single PG `LISTEN sync_actions_new` consumer. On notify, reads `sync_actions` since last-seen-id, fans out to every connection whose `userSyncGroups` intersects.
- `apps/api/app/sync/services/connection_registry.ts` — per-process map of `sessionId → { ws, lastSyncIdSent, userSyncGroups, lastPong }`. Heartbeat every 25s; missed PONGs drop the connection.
- The `SyncActionRecorder` issues `pg_notify('sync_actions_new', payload)` in `afterCommit` of the surrounding Lucid transaction.
- AdonisJS WebSocket integration uses `@adonisjs/transmit` if it supports the bidirectional needs (mostly SSE; check), OR `socket.io` adapter (deferred decision in Phase 0).
- Client-side `SyncSocketClient` (TypeScript, no React yet) implements: reconnect-with-backoff, HELLO handshake, frame routing. Lives in `apps/admin/src/lib/sync/socket.ts`.

**Acceptance**

- 100 concurrent connections from a load-test script. Each receives ≤100 ms after a mutation commit. Connection drop + reconnect re-aligns via HELLO.
- Force a `sync_actions` id gap (manually delete a row in a test DB) → client receives `4409`, falls back to bootstrap.
- Operator A's mutation → operator B's `SyncSocketClient.onDelta` fires with the matching action.

**Risks**

- `LISTEN/NOTIFY` payload limit (8 KB). Mitigation: payload is just the merchant id; the dispatcher reads `sync_actions` directly. We never put row data in the NOTIFY.
- Dispatcher backlog under burst load. Mitigation: dispatcher consumes notifications into an in-process queue, drains via a single async loop. If the queue exceeds 10k entries, alert and shed older notifications (they'll get caught by the next delta the client requests anyway).
- A misbehaving client holding connections open. Mitigation: per-session connection cap (5 concurrent), enforced by the registry.

---

## Phase 4 — GraphQL mutation surface (batched) (1 week)

The write path on the wire.

**Deliverables**

- `apps/api/app/sync/controllers/mutate_controller.ts` — accepts a GraphQL document, dispatches aliased operations to existing controller methods via a static dispatch table generated in Phase 0's codegen.
- Mutation shim parses with `graphql-tag` (no full GraphQL engine). Validates variables against VineJS validators (existing).
- Response includes `lastSyncId` per aliased mutation.
- `clientTxId` field on every mutation input. Used for idempotency: the recorder rejects duplicate `clientTxId` and returns the previously-recorded `lastSyncId`.
- Client-side `MutationBatcher` in `apps/admin/src/lib/sync/mutations.ts`: collects mutations called within the same microtask, batches into one GraphQL document, sends.

**Acceptance**

- Calling three updates in sequence within a `Promise.all` sends ONE HTTP request with three aliased operations.
- Replaying the same batch (same `clientTxId`s) returns the original `lastSyncId`s without re-applying the mutations.
- Mutation reflects in the WebSocket DELTA back to all connected clients of the matching sync group within ≤100 ms.

**Risks**

- The shim parser allowing unsupported GraphQL features and breaking expectations. Mitigation: explicit allow-list — only aliased single-call mutations, no fragments, no directives, no variables-of-variables. Anything else → 400.

---

## Phase 5 — Client object pool + transaction queue (2 weeks)

The big client-side investment.

**Deliverables**

- `apps/admin/src/lib/sync/object-pool.ts` — Valtio-backed object pool. `getModel(name, id)`, `setModel`, `patchModel`. Reactive snapshots via `useSnapshot`.
- `apps/admin/src/lib/sync/transaction-queue.ts` — the four-stage FSM from `ARCHITECTURE.md § Transaction queue`.
- `apps/admin/src/lib/sync/persistence.ts` — idb-keyval-backed durable store for `_transactions`, `_meta`, and per-model tables. Hydrated on bootstrap.
- `apps/admin/src/lib/sync/index.ts` — public surface: `useSyncObject(modelName, id)`, `useSyncQuery(modelName, q)`, `useSyncMutation()`.
- A `SyncProvider` component that owns the lifecycle: connects WS, runs bootstrap if needed, hydrates persistence, replays `_transactions` on load.
- A Vitest suite of unit tests for the FSM (state transitions, rebase on conflicting delta, idempotency on retry).

**Acceptance**

- Reading `useSyncObject('Order', 42)` returns synchronously after bootstrap, and the React tree re-renders when a DELTA touches `Order:42`.
- Mutating via `useSyncMutation()` patches the in-memory model immediately; an error from the server rolls back.
- Tab close + reopen with an unsent transaction → it sends on reopen.

**Risks**

- Reactivity bugs that cause infinite re-renders or stale UI. Mitigation: the Vitest suite covers the common cases; a Playwright spec replays a 60s session and asserts no React error logs.
- IndexedDB schema versioning bugs (writing into a stale table). Mitigation: `databaseVersion` in `_meta`; on mismatch, wipe and re-bootstrap.

---

## Phase 6 — Migrate dashboard to sync hooks (1 week)

Behind `SYNC_ENGINE_PHASE_6` we replace React Query on the dashboard.

**Deliverables**

- `DashboardClient.tsx`'s widget hooks rewritten on top of `useSyncObject` / `useSyncQuery`. The visual surface and tests are unchanged.
- A side-by-side runtime: if `SYNC_ENGINE_PHASE_6` flag is off, the existing React Query hooks render. If on, sync hooks render. Easy A/B during the soak.

**Acceptance**

- All existing dashboard Playwright tests pass with the flag on.
- Latency target: KPI tiles paint in ≤200ms after bootstrap (vs React Query's current ~205ms — should be lower because the data is local).
- "Refresh" button still works (now wired to `syncClient.requestDelta()`).

**Risks**

- Locale switching no longer triggers a refetch (because the object pool is locale-stable). Mitigation: explicit `syncClient.changeLocale()` that triggers a partial re-bootstrap.

---

## Phase 7 — Migrate remaining admin surfaces (3 weeks)

Migrate orders, products, customers, coupons, reviews — both list pages and detail pages.

**Deliverables**

- For each resource: `useResourceList` and `useResource(id)` replace the React Query hooks. The page components are unchanged.
- The proxy at `/api/admin/[...path]` stays around for non-syncable endpoints (file uploads, exports). React Query is uninstalled once every page is migrated and the flag has been on for one full sprint without rollback.

**Acceptance**

- Every admin page passes the existing Playwright suite under `SYNC_ENGINE_PHASE_7=on`.
- Optimistic order status mutation (from `commits/e99a5b1`) still rolls back correctly on server error — now driven by the rebase logic in `TransactionQueue` instead of React Query's onMutate/onError.
- Mutation batching: changing three orders' status in a quick succession on the orders list issues one GraphQL document.

**Risks**

- Memory consumption on a long session. Mitigation: a `gc()` step that evicts cold objects from the pool after 30 min of no reads. IndexedDB stays.
- Conflict resolution surfaces that we missed (e.g. inventory adjustment races). Mitigation: a "conflict diary" — log every rebase to a debug channel and review weekly.

---

## Phase 8 — Production rollout + observability + tear-down (2 weeks)

Make it operationally real.

**Deliverables**

- OpenTelemetry instrumentation per `ARCHITECTURE.md § Observability`.
- A Grafana dashboard for: connection count, action lag, fanout count, bootstrap duration, transaction queue depth (client-side, sampled).
- Alerts for: action lag p99 > 1s, connection count > 90% of capacity, replication slot lag > 1 GB.
- Multi-instance fanout via Redis pub/sub (sticky LB was the placeholder; this is the real version).
- Stress test against staging: 200 concurrent operators per merchant, 10 mutations/sec sustained for 30 minutes. p99 push latency ≤ 100 ms; no transactions lost.
- Master flag `SYNC_ENGINE_ENABLED=true` flipped in production for one pilot client. Soak for two weeks. Then enable for all.
- Tear down: remove `lib/queries/*.ts` (React Query layer), `apps/admin/src/app/api/admin/[...path]/route.ts` (proxy) once nothing references them.

**Acceptance**

- Staging stress test passes the latency budget.
- Pilot client runs for two weeks without a sync-related incident.
- React Query and the proxy are removed in a follow-up cleanup PR.

**Risks**

- The bug we discover under real load that we couldn't see in staging. Mitigation: keep the React Query path on a kill-switch toggle so we can fall back. Don't remove until pilot is rock-solid.

---

## Roll-out sequence summary

```
Week  1 │ Phase 0 — prework, codegen
Week  2 │ Phase 1 — sync action recording
Week  3 │ Phase 2 — bootstrap + delta (start)
Week  4 │ Phase 2 — bootstrap + delta (finish)
Week  5 │ Phase 3 — WebSocket (start)
Week  6 │ Phase 3 — WebSocket (finish)
Week  7 │ Phase 4 — GraphQL mutate
Week  8 │ Phase 5 — object pool + queue (start)
Week  9 │ Phase 5 — object pool + queue (finish)
Week 10 │ Phase 6 — dashboard migration
Week 11 │ Phase 7 — orders + customers (start)
Week 12 │ Phase 7 — products
Week 13 │ Phase 7 — coupons + reviews
Week 14 │ Phase 8 — observability + stress
Week 15 │ Phase 8 — pilot soak
Week 16 │ Phase 8 — general rollout + tear-down
```

With two engineers in parallel: Phases 0–4 collapse to ~5 weeks (one on server, one on client scaffolding); Phases 5–8 collapse to ~3 weeks. Total ~8 weeks.

## Risk register

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Bootstrap response grows past memory budget for biggest merchants | High | Cursor pagination + per-model size budget. Phase 2 acceptance gates this. |
| R2 | WebSocket connection storm on deploy | High | Server-side connection accept queue + jittered reconnect. Phase 3 + Phase 8. |
| R3 | Transaction queue persistence corrupts across schema changes | Medium | `databaseVersion` busts the cache on schema bump. Phase 0 codifies. |
| R4 | Codegen drift between server and client model registry | Medium | CI check: `git diff` empty after `pnpm sync-codegen`. Phase 0. |
| R5 | Conflict resolution surprises operators (status flips back) | Medium | Conflict diary in Phase 7; UI banner when a mutation is rebased away. |
| R6 | Postgres `sync_actions` write contention at scale | Medium | Partition by merchant once we exceed 100 mutations/sec/merchant. Deferred. |
| R7 | Replication slot lag fills disk (only Path B) | High | Monitoring + automatic teardown of orphaned slots. Phase 8. |
| R8 | A spike of operator activity overwhelms dispatcher | Medium | Backpressure budget + dropped-connection shedding. Phase 3. |
| R9 | We discover Path B was the right call halfway through | High | Decision review at end of Phase 4. If we've underestimated server-side complexity, peel off to Path B without losing the client work — the object pool is reusable against ElectricSQL shapes. |

## Definition of done (overall)

- Every admin page reads from the object pool. No `lib/queries/*.ts` survives.
- Mutations route through `/admin/sync/mutate`. The `/api/admin/[...path]` proxy is removed.
- The two-tab demo passes: two browser tabs, mutate in one, the other paints within 200 ms.
- The flight-mode demo passes: turn off WiFi, perform three mutations, turn it back on, all three land.
- The stress test runs as a nightly CI job and posts results to the engineering channel.
- This dossier is referenced from `apps/admin/AGENTS.md` and from the repo-level `AGENTS.md`.
