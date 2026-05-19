# Calibra Admin Sync Engine — Architecture

> Prerequisite reading: [`RESEARCH.md`](./RESEARCH.md). This document refers to its primitives without re-explaining them.

## Goals

1. **Sub-50ms perceived latency** on every mutation in the admin panel — from clicking Save to the UI committing — with eventual server confirmation. Linear's bar.
2. **Real-time updates across operators.** If two ops people are looking at the same order, an edit by one paints in the other's UI within ≤1 s.
3. **Offline-safe operator work.** Tab crashes, dropped WiFi, brief flight-mode — none cause lost mutations. Queued transactions replay automatically on reconnect.
4. **Multi-merchant tenancy intact.** The agency clones this repo per client; a sync engine MUST NOT leak data across merchants. RBAC happens at the sync-group boundary, not in the UI.
5. **Storefront untouched.** No GraphQL or WebSocket lives in `apps/web` because of this work.
6. **Reuse what we already have.** OpenAPI codegen, AdonisJS controllers, the `/api/admin/[...path]` proxy, React Query with persistence — all stay. The sync engine extends rather than replaces.

## Non-goals

- CRDTs (last-writer-wins is sufficient, see `RESEARCH.md § Linear`)
- P2P sync
- Cross-region active-active replication of the sync hub
- Mobile (admin is web-only)
- Replacing the storefront's REST surface

---

## Path Decision

The README presented three paths. The serious tradeoff between them lives here.

### Path A — Build a Linear-style engine

We write the sync hub, the protocol, the object pool, the transaction queue.

**Pros**

- Total control over message shapes, batching, sync-group semantics. We never have to wait on an upstream OSS project to ship a feature we need.
- Single deploy target. AdonisJS owns the WebSocket. No new sidecar service to operate.
- Schema co-evolves with Lucid models. The sync engine's "model" is just an Adonis model + a `@syncable()` decorator. Schema changes already migrate via Lucid's migration story; we add per-model `__schemaHash` for client-side cache busting.
- Future portability. The protocol becomes our property; a native mobile admin or a B2B integration partner can implement against it without us paying license fees.

**Cons**

- ~16 weeks of engineering for a solo. The "easy" parts (REST proxy, IndexedDB cache) are 30 % of the work; the hard parts (sync hub backpressure, replay correctness, schema migration without invalidating client caches) are 70 %.
- We have to operate Postgres logical replication ourselves. The list of footguns in `RESEARCH.md § PowerSync` is now on our oncall rotation.
- A custom protocol means custom telemetry, custom debugging tools, custom load testing. Linear has a team for this; we'd have a quarter of one engineer.

### Path B — ElectricSQL + TanStack DB

We adopt ElectricSQL as the WAL-fanout layer and TanStack DB on the client.

**Pros**

- ~6 weeks of engineering. Most work is "wire it up + write the shape definitions + refactor reads."
- ElectricSQL solves the Postgres-replication challenges from `RESEARCH.md § PowerSync` for us. That's at least 4 of the 16 weeks of Path A.
- TanStack DB is from the same team as TanStack Query (which we just adopted). The mental model is continuous: collections that subscribe to shapes, optimistic mutations, server reconciliation. No "two state systems" tax.
- Mutations stay on our existing API. ElectricSQL never participates in the write path; we keep AdonisJS controllers and validators as-is.
- If we need Path A later, ElectricSQL is replaceable. The TanStack DB collection abstraction is wire-format-agnostic.

**Cons**

- Two new sidecars: the ElectricSQL service and a proxy for auth. (Not a separate database — ElectricSQL runs against our existing Postgres.)
- TanStack DB is comparatively new; we're an early adopter. Expect to upstream bug reports.
- Shapes are queries; they're not free. Each subscribed shape per client costs server resources. Multi-merchant boundaries via shapes need careful scoping (`SELECT * FROM orders WHERE merchant_id = $1` style).

### Path C — Replicache

We adopt Replicache.

**Pros**

- The "mutators are pure functions on both sides" model is elegant and a forcing function for clean domain logic.
- Battle-tested. Replicache has been in production at Reflect, Cohere, Pierre and others.
- Push/pull over HTTP — no WebSocket to operate; works through any corporate firewall.

**Cons**

- License: Replicache is a commercial product (free for small teams, paid above a threshold). For an agency-clone-per-client repo, every client is a separate consumer.
- "Implement every mutation twice" is more discipline than our current team boundary supports. The server team and admin team will diverge.
- The pull endpoint design (cookie/cursor + patch) is incompatible with our existing OpenAPI surface; we'd need to invent and maintain a separate `replicache_pull` endpoint per resource group.

### Recommendation

**Path B for v1.** Concretely:

- Now → +4 weeks: deploy ElectricSQL alongside Postgres in staging. Define one shape per merchant (`orders`, `products`, `customers`). Stand up the auth proxy that maps the admin session to a list of shapes.
- +4 → +8 weeks: refactor `lib/queries/*.ts` from `useQuery(apiGet(...))` to `useLiveQuery(collection.query(...))` for the same resources the React Query rollout covered. Mutations stay on the proxy/REST path.
- +8 → +12 weeks: harden — backpressure, reconnect storms, schema migration drills, multi-merchant fuzz testing.
- +12+ weeks: ship.

If at +12 weeks we're hitting ElectricSQL limits we cannot work around (per the issue tracker / upstream blockers), pivot to Path A using the experience we banked. The TanStack DB API stays, the shape definitions become guidance for our own protocol.

The rest of this document specifies what we'd build for **Path A** — because Path B largely defers to ElectricSQL's protocol — and calls out per-section what Path B substitutes.

---

## High-level topology

```
              ┌───────────────────────────────────────────────────────────────────┐
              │                       Client (apps/admin)                          │
              │                                                                    │
              │     ┌──────────────┐    ┌────────────────┐    ┌───────────────┐   │
              │     │ Object pool   │◄──►│ Transaction    │◄──►│ Persistence:   │   │
              │     │ (Valtio /     │    │ queue          │    │ IndexedDB      │   │
              │     │  Zustand)     │    │ (4-stage FSM)  │    │ (idb-keyval)   │   │
              │     └──────┬───────┘    └───────┬────────┘    └───────────────┘   │
              │            │                    │                                  │
              │            ▼                    ▼                                  │
              │     ┌────────────────────────────────────┐                        │
              │     │ Sync client                                              │  │
              │     │ - WebSocket (push)                                       │  │
              │     │ - HTTP bootstrap + delta + mutation                       │  │
              │     │ - Applies sync actions to object pool + IndexedDB         │  │
              │     └────────────────┬────────────────────┬─────────────────────┘  │
              └─────────────────────┼────────────────────┼────────────────────────┘
                                    │                    │
                          WSS /admin/sync/ws    POST /admin/sync/mutate
                          GET /admin/sync/bootstrap        (REST or GraphQL)
                          GET /admin/sync/delta
                                    │                    │
              ┌─────────────────────┼────────────────────┼────────────────────────┐
              │                     ▼                    ▼                        │
              │  ┌─────────────────────────────────────────────────────────────┐ │
              │  │                  Sync Hub (AdonisJS app, in-process)         │ │
              │  │                                                              │ │
              │  │   ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │ │
              │  │   │ Connection  │  │  Sync-group  │  │ Mutation handler  │   │ │
              │  │   │ registry    │  │  router      │  │ (calls Lucid via  │   │ │
              │  │   │ (per WS     │  │ (which       │  │  existing         │   │ │
              │  │   │  session)   │  │  groups does │  │  controllers)     │   │ │
              │  │   └──────┬──────┘  │  this client │  └─────────┬─────────┘   │ │
              │  │          │         │  belong to)  │            │             │ │
              │  │          │         └──────┬───────┘            ▼             │ │
              │  │          │                │             ┌──────────────┐    │ │
              │  │          ▼                ▼             │ sync_actions │    │ │
              │  │   ┌─────────────────────────────┐       │  table       │    │ │
              │  │   │ Delta dispatcher             │◄─────│ (id, action, │    │ │
              │  │   │ - reads sync_actions stream  │       │  modelName,  │    │ │
              │  │   │ - fans out to subscribers    │       │  modelId,    │    │ │
              │  │   │   per sync-group filter      │       │  data,       │    │ │
              │  │   └─────────────┬───────────────┘       │  syncGroups) │    │ │
              │  │                 ▲                       └──────┬───────┘    │ │
              │  │                 │                              │            │ │
              │  │                 │ NOTIFY sync_actions_inserted │            │ │
              │  │                 │                              │            │ │
              │  └─────────────────┼──────────────────────────────┼────────────┘ │
              │                    │                              │              │
              │                    │  pg_logical / NOTIFY         │ INSERT       │
              │                    │                              │              │
              │  ┌─────────────────┴──────────────────────────────┴────────────┐ │
              │  │                          Postgres                            │ │
              │  │   (existing schema + new `sync_actions` table)               │ │
              │  └──────────────────────────────────────────────────────────────┘ │
              │                                                                    │
              │                       Server (apps/api)                            │
              └────────────────────────────────────────────────────────────────────┘
```

### Why a `sync_actions` table instead of pure WAL consumption

Two reasons. First, the LSN ordering trap (`RESEARCH.md § PowerSync`) makes the WAL a bad source-of-truth for ordering — we want a single monotonic integer per merchant. Second, mutation handlers (the AdonisJS controllers) already run inside Lucid transactions; appending one row to `sync_actions` inside that same transaction is atomic with the mutation. The WAL eventually emits both rows, but we don't have to interpret it — we just read from `sync_actions`.

The WAL still matters: we use `LISTEN/NOTIFY` (or `pg_logical_emit_message`) to wake the delta dispatcher when new rows land, instead of polling. That's an order-of-magnitude latency improvement.

### Path B substitution

For Path B, the sync hub box is replaced by **ElectricSQL** running as a sidecar service. The `sync_actions` table isn't needed; ElectricSQL consumes the WAL via a logical replication slot it manages. Our admin app proxies shape subscriptions through an auth layer that maps `admin_session` → permitted shapes. Mutations still go through the existing `/api/admin/[...path]` proxy to AdonisJS controllers.

---

## Data model

### Syncable models

Every Lucid model that participates in sync gets a `@syncable()` decorator (or, since we use AdonisJS without first-class decorators, a static registration step). The decorator declares:

- **`modelName`** — stable string used on the wire. Must never change (rename = new model + migration).
- **`syncGroups(instance) → string[]`** — the set of sync groups this instance belongs to. For `Order`, that's `[\`merchant:\${order.merchantId}\`, \`customer:\${order.customerId}\`]`. For `Product`, `[\`merchant:\${product.merchantId}\`, \`catalog:\${product.merchantId}\`]`.
- **`loadStrategy`** — `instant` (bootstrap loaded) | `lazy` (on-demand reference fetch) | `local` (client-only, never sent up).
- **`__schemaHash`** — derived from the model's column set at build time. Mismatch on bootstrap → wipe-and-re-fetch.

This metadata lives in a static `ModelRegistry` on both server and client. Generated from the same source (a `tooling/sync-model-codegen` step) to prevent drift.

### `sync_actions` table

```sql
CREATE TABLE sync_actions (
    id              BIGSERIAL PRIMARY KEY,
    model_name      TEXT NOT NULL,
    model_id        BIGINT NOT NULL,
    action          CHAR(1) NOT NULL CHECK (action IN ('I', 'U', 'D', 'A', 'V')),
    data            JSONB,                       -- full post-image, or null for D
    sync_groups     TEXT[] NOT NULL,             -- e.g. {'merchant:42','customer:99'}
    actor_user_id   BIGINT,                      -- who caused this (audit + dedupe)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sync_actions_groups_idx ON sync_actions USING GIN (sync_groups);
CREATE INDEX sync_actions_id_idx     ON sync_actions (id);
```

- **`id`** — the `lastSyncId`. Per-deployment global; not per-merchant. Sync-group filtering is what scopes it.
- **`action`** — `I` insert, `U` update, `D` delete, `A` archive, `V` unarchive. Linear-compatible.
- **`data`** — the full post-image of the model instance (after the change). On the client this overwrites the in-memory object's properties wholesale. Delete actions carry `data: null`.
- **`sync_groups`** — the set this row should fan out to. The dispatcher matches against the connected client's `userSyncGroups` (computed at bootstrap and refreshed when group membership changes).

### Retention

`sync_actions` is append-only. Old rows can be pruned once we're confident no client will reconnect with a `lastSyncId` older than the prune horizon. Default: prune anything older than 7 days. A client reconnecting with `lastSyncId` below the prune floor receives a `BOOTSTRAP_REQUIRED` error and falls back to a full bootstrap.

---

## Bootstrap

`GET /api/v1/admin/sync/bootstrap?type=full|partial` → `application/x-ndjson` (newline-delimited JSON). Streamed; the response body is consumed line-by-line by the client without buffering.

### Wire format

```
{"_type":"Order","id":1,"orderNumber":1001,"status":"completed",...}
{"_type":"Order","id":2,"orderNumber":1002,...}
{"_type":"Customer","id":99,...}
...
{"_type":"_metadata_","lastSyncId":613955486,"userSyncGroups":["merchant:42","catalog:42","orders:42"],"schemaHashes":{"Order":"abc123","Product":"def456",...},"databaseVersion":3}
```

- The `_type` field disambiguates lines.
- The metadata line is always last; the client uses its presence to detect a complete bootstrap.
- `userSyncGroups` is computed server-side from the bearer token's `role`, `merchantId`, and any granular permissions (e.g. a sub-merchant ops user only sees `customer:*` for their assigned customer subset).
- `schemaHashes` lets the client compare against its persisted hashes per model. Any mismatch triggers a `full` bootstrap on the next attempt.

### Modes

| Mode | When | Behavior |
|------|------|----------|
| `full` | Empty IndexedDB or schema-hash mismatch | Stream every `instant` model in `userSyncGroups`. Lazy models defer. |
| `partial` | Operator switches merchant context, or scoped re-fetch needed | Caller passes `?syncGroups=customer:99` style filters. Stream only matching instances. |
| `local` (no HTTP) | IndexedDB has data and recent `lastSyncId` | Pure client decision. Skip bootstrap and request delta. |

### Streaming details

AdonisJS supports streaming responses via `ctx.response.stream()` and Node's `Readable.from(asyncIterator)`. The bootstrap controller hydrates models via Lucid in chunked queries (page-by-page, `cursor` pagination on `id`) and yields each row as a JSON line. The connection MUST set `Cache-Control: no-store` and `Content-Type: application/x-ndjson`.

For Path B: ElectricSQL handles bootstrap via shape subscription. Initial subscription receives all current rows matching the shape; subsequent activity arrives as deltas. No custom bootstrap endpoint.

---

## Delta

`GET /api/v1/admin/sync/delta?since=<lastSyncId>&until=<lastSyncId>` → `application/json`:

```json
{
  "actions": [
    {"id": 613955487, "action": "U", "modelName": "Order", "modelId": 1, "data": {...}},
    {"id": 613955488, "action": "I", "modelName": "Customer", "modelId": 100, "data": {...}}
  ],
  "lastSyncId": 613955488,
  "complete": true
}
```

- Used only on reconnect when we can't accept the WebSocket's first push (gap recovery).
- `complete: false` means the server has more pages; the client must call again with the new `since`. Pagination is by row count (max 5,000 per response).
- If `since` is below the prune floor, returns `409 Conflict` with `{"error":"bootstrap_required","minimum_sync_id":<n>}`.

---

## Push channel (WebSocket)

Endpoint: `wss://<admin-origin>/api/v1/admin/sync/ws`.

### Auth

The WebSocket inherits the bearer token from the `admin_session` cookie via the same-origin proxy. The handshake checks the session and rejects with `4401` (RFC 6455 custom close code) if absent. After accept, the server sends a `HELLO` frame with the current `lastSyncId` and the client's `userSyncGroups`.

### Frame format

JSON over text frames. Every frame is `{ "type": "<TYPE>", ...payload }`.

| Type | Direction | Payload | Purpose |
|------|-----------|---------|---------|
| `HELLO` | S → C | `{ lastSyncId, userSyncGroups, schemaHashes }` | First frame on accept. Client uses `lastSyncId` to detect missed deltas and either requests delta or starts a re-bootstrap. |
| `DELTA` | S → C | `{ actions: SyncAction[], lastSyncId }` | Push of new sync actions. Always contiguous (`actions[0].id === previous lastSyncId + 1`). |
| `SYNC_GROUPS_CHANGED` | S → C | `{ userSyncGroups }` | The set of groups the operator is in just changed (RBAC update, merchant impersonation). Client must purge anything from removed groups and pull delta for new groups. |
| `PING` | both | `{ ts }` | Keepalive every 25 s. Client responds with `PONG`. |
| `PONG` | both | `{ ts }` | Heartbeat ack. |
| `BYE` | S → C | `{ code, reason }` | Graceful shutdown. Server is restarting; client should reconnect with backoff. |

Out-of-band errors (4-digit close codes):

- `4401` — no session.
- `4408` — session expired during connection lifetime.
- `4409` — `lastSyncId` gap too large; client must re-bootstrap.
- `4429` — too many concurrent connections from same session.

### Reconnect

Client implements exponential backoff: 250 ms, 500 ms, 1 s, 2 s, 5 s, 10 s, cap 30 s. On every reconnect, the client sends its current `lastSyncId` as a query param; the server's `HELLO` either confirms it's still aligned (no action) or sends a `DELTA` immediately catching it up. If gap > prune horizon, server emits `4409` and the client falls back to `full` bootstrap.

---

## Mutation surface

We support two modes side-by-side and let the consuming hook decide.

### Mode 1 — REST (default for the existing proxy)

Existing `/api/admin/[...path]` proxy handles all mutations. The Adonis controllers append a row to `sync_actions` inside the mutation's transaction. Response includes `lastSyncId` from the inserted row.

```http
POST /api/admin/orders/42/status
Content-Type: application/json
X-CSRF-Token: <token>
{ "to_status": "processing" }

→ 200 OK
{ "data": { "id": 42, "status": "processing", ... }, "lastSyncId": 613955488 }
```

### Mode 2 — GraphQL (batched mutations)

A second endpoint, `/api/v1/admin/sync/mutate`, accepts a single GraphQL document with N aliased mutations:

```graphql
mutation BatchedAdminMutations($input1: OrderStatusInput!, $input2: ProductUpdateInput!) {
  m1: orderStatusUpdate(input: $input1) { lastSyncId }
  m2: productUpdate(input: $input2) { lastSyncId }
}
```

Each mutation maps 1:1 to an existing Lucid-backed controller method via a resolver shim. Returns `lastSyncId` per mutation. The client's transaction queue groups same-microtask mutations into one batched GraphQL call — matching Linear's pattern.

**Implementation note.** We don't need a full GraphQL gateway. The resolver shim is ~20 LOC per syncable model; mutation inputs reuse VineJS validators. We don't expose queries via GraphQL — reads always come from the object pool.

### Mode choice

- The **transaction queue uses GraphQL mode** because batching wins matter.
- One-off operator actions (export CSV, regenerate PDF) keep REST.
- Path B doesn't change either of these — mutations don't flow through ElectricSQL.

---

## Client-side architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ React component                                                          │
│   const order = useSyncObject('Order', 42)   // synchronous, reactive    │
│   <OrderHeader status={order.status} />                                  │
└──────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ Valtio proxy / Zustand selector
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ Object pool                                                               │
│   modelLookup: Map<\`\${modelName}:\${id}\`, ProxyInstance>                  │
│   modelInstances: WeakMap<ProxyInstance, RawModel>                        │
│   subscribers tracked by Valtio                                           │
└──────────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ applies sync actions
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│ Sync client                                                               │
│   ├─ WebSocket (push)                                                    │
│   ├─ Bootstrap + delta HTTP                                              │
│   ├─ Transaction queue (4-stage FSM, microtask batched)                  │
│   └─ Persistence (IndexedDB via idb-keyval — already in catalog)         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Why Valtio (not MobX, not Redux)

MobX is what Linear uses but is heavyweight for our team — class-based models, decorators, devtools split between MobX and Redux. Valtio gives us the same observable-getter ergonomics with proxy-based reactivity, integrates with React 19 trivially (`useSnapshot`), and is small enough to ship without bundle worry. Zustand would also work but its store-per-domain model fights the global object pool we need.

### Transaction queue

Four arrays match Linear:

```ts
class TransactionQueue {
  created:    Transaction[];        // pre-flight, awaiting microtask flush
  queued:     Transaction[];        // batched, awaiting wire send
  executing:  Transaction[];        // sent, awaiting server response
  completedButUnsynced: Transaction[]; // server returned lastSyncId, awaiting delta confirmation
}
```

State transitions:

1. `User calls api.orders.updateStatus(42, "processing")` → `OrderUpdateTransaction` enqueued in `created`. Object pool patched immediately.
2. Microtask flush moves all `created` into `queued` and serializes into a single batched GraphQL mutation.
3. Batch sent: transactions move to `executing`.
4. Server returns `{ m1: { lastSyncId: N }, m2: { lastSyncId: N+1 } }`. Transactions move to `completedButUnsynced` with their expected `syncIdNeededForCompletion`.
5. WebSocket pushes `DELTA` with `lastSyncId ≥ N`. Transactions in `completedButUnsynced` whose `syncIdNeededForCompletion ≤ DELTA.lastSyncId` are removed and their effect is "confirmed" — the in-memory state matches authoritative.

### Persistence

- `_transactions` IndexedDB table mirrors `queued` + `executing` + `completedButUnsynced`. Survives tab close.
- `_meta` IndexedDB table holds: `lastSyncId`, `userSyncGroups`, per-model `schemaHash`, `databaseVersion`.
- Per-model IndexedDB tables (`Order`, `Product`, `Customer`, …) hold the durable copy. Writes happen *only* when a `DELTA` confirms a server-authoritative state. The in-memory pool can be ahead optimistically; IndexedDB always lags by ≤ one round-trip.

### Conflict resolution

Last-writer-wins by `sync_action.id`. If two operators edit `Order.status` concurrently, the second write produces a higher `sync_action.id` and overwrites the first. The first operator's UI receives a `DELTA` that flips status to the second's value — their optimistic write was reconciled away. If their local transaction was still in flight when the conflicting `DELTA` arrived, the rebase logic re-applies the local transaction on top of the new authoritative state and resends with a fresh `clientTxId`.

This is the same model Convex calls "Server Reconciliation" (`RESEARCH.md § Convex`). For order status transitions specifically we should *also* check the state machine on the server — a conflicting transition that lands in an invalid state (e.g. `completed → pending`) returns a `409 Conflict` and the client rolls back rather than rebasing.

### Hooks API

```ts
// Read a single object by id. Suspends if not yet loaded (lazy models).
const order = useSyncObject('Order', orderId);

// Read a derived collection. Object pool's local query language.
const recentOrders = useSyncQuery('Order', q => q.orderBy('id', 'desc').limit(8));

// Write. Returns a Promise that resolves when the server confirms (delta arrives).
const tx = useSyncMutation();
await tx.update('Order', orderId, { status: 'processing' });
```

These replace the existing `useQuery` hooks per-resource. Migrating page-by-page from React Query to sync hooks is the body of phases 5-7.

### Path B differences

- Object pool ≈ TanStack DB collection. We don't write the pool; `@tanstack/db` provides it.
- Transaction queue ≈ TanStack DB's mutation lifecycle. Custom rebase logic isn't required.
- IndexedDB ≈ TanStack DB's local store (configurable). The persisted-cache phase we already shipped (`commits/269da79`) is in spirit the same thing.
- We don't write a bootstrap endpoint; ElectricSQL's shape subscription is the boot.

---

## Server-side architecture

### The sync hub

A new domain inside `apps/api`:

```
apps/api/app/
├── sync/
│   ├── controllers/
│   │   ├── bootstrap_controller.ts        # GET /admin/sync/bootstrap
│   │   ├── delta_controller.ts            # GET /admin/sync/delta
│   │   ├── mutate_controller.ts           # POST /admin/sync/mutate
│   │   └── websocket_controller.ts        # WS  /admin/sync/ws
│   ├── services/
│   │   ├── sync_action_recorder.ts        # append-only writer (called by every mutation)
│   │   ├── sync_group_resolver.ts         # user → groups
│   │   ├── delta_dispatcher.ts            # NOTIFY consumer + WS fanout
│   │   ├── connection_registry.ts         # per-session connection state
│   │   └── model_registry.ts              # syncable model metadata
│   └── transformers/
│       └── sync_action_transformer.ts     # row → wire JSON
└── start/sync.ts                          # service container bindings + WS boot
```

### Append-only writer

```ts
// Inside every mutation, after the entity-level write:
await SyncActionRecorder.record(trx, {
    modelName: 'Order',
    modelId: order.id,
    action: 'U',
    data: order.serialize(),
    syncGroups: [`merchant:${order.merchantId}`, `customer:${order.customerId}`],
    actorUserId: ctx.auth.user.id,
});
```

Recorder runs inside the same Lucid transaction as the mutation. If the mutation rolls back, so does the sync action — sync actions are only ever observable for committed state.

We add a Lucid model trait/mixin so every `@syncable()` model auto-records on `afterSave` / `afterDelete`. Manual recording is reserved for cross-row events (e.g. an order's status transition is recorded against the order; the corresponding stock-decrement on each line item records against those products).

### Dispatcher

Listens on `LISTEN sync_actions_new`. The Adonis controller writes the row inside the transaction and emits `pg_notify('sync_actions_new', '<merchant_id>')` on commit (in `afterCommit`). Dispatcher receives, reads all rows since its last seen `id` matching the notified scope, and pushes them to every WebSocket connection whose `userSyncGroups` intersect the row's `sync_groups`.

This avoids polling and keeps latency under 50 ms in the local case.

### Connection registry

Holds the per-WebSocket state: session, last `id` sent, `userSyncGroups`, keepalive timer, backpressure budget. Stored in-process (single sync hub per Adonis instance). Multi-instance scaling: pin clients to instances via sticky load balancer, OR replace the in-process registry with a Redis-backed pub/sub (deferred to phase 8).

### Mutation handler

`POST /admin/sync/mutate` accepts a GraphQL document. The shim parses with `graphql-tag`, dispatches each aliased operation to the existing Adonis controller method, collects per-mutation responses including `lastSyncId`. Returns a single JSON response.

We do not run a real GraphQL gateway. The shim is ~200 LOC of bespoke parsing + dispatch table. This avoids adding Mercurius / Apollo Server + a schema management story for a single internal use case.

---

## RBAC & multi-merchant

Sync groups are the only enforcement boundary. The bootstrap controller computes `userSyncGroups` from:

- `session.user.role === 'admin'` AND `session.user.merchantId === order.merchantId` → `merchant:<id>`, `catalog:<id>`, `orders:<id>` etc.
- A "support" user impersonating a merchant: same groups but with an audit trail.
- A read-only auditor role: subscribes to groups but `mutate` returns 403.

The dispatcher checks group intersection on every fanout. The mutate controller checks group membership before recording (so an admin from merchant A can't write a sync action that an admin from merchant B would see).

### Why not row-level Postgres policies (RLS)

RLS would be nice but doesn't play well with bulk WAL consumption (Path A's dispatcher reads `sync_actions` directly, bypassing per-query RLS). Group filtering at the dispatcher level is simpler and easier to audit.

---

## Schema evolution

We pick a model with the team's bandwidth. The clean version:

1. Each syncable model has a `__schemaHash` derived from its column set at build time. Stable across deploys until the model definition changes.
2. The bootstrap response includes `schemaHashes` per model.
3. The client compares against its persisted hashes:
   - **Match for all** → resume from delta.
   - **Mismatch on any model** → wipe that model's IndexedDB table, re-fetch via partial bootstrap. The object pool entries are invalidated and re-hydrated lazily.
   - **Mismatch on a `local` model** (client-only data, see below) → bump the `databaseVersion` to force a full wipe + re-login. Rare; this happens only when we change a local-only schema like UI preferences.
4. Server-side, the Lucid migration adds the column; the `@syncable()` decorator's hash automatically picks up the change. Old clients connect, get a mismatch, re-fetch. There is no downtime.

This works for additive changes. Renames and destructive changes follow a two-deploy migration:

- Deploy 1: server reads/writes both old and new column. Schema hash bumps.
- All clients re-bootstrap.
- Deploy 2: drop the old column. Old clients (who skipped Deploy 1) get `4409` on reconnect.

### Path B differences

ElectricSQL's "schemaless" replication (`RESEARCH.md § PowerSync § Schema evolution`) handles this for us. The cost is the JSON-typed shape — we lose some compile-time safety. TanStack DB regenerates types from the shape definition; close enough.

---

## Observability

Telemetry on day 1 (we cannot operate this without it):

| Signal | Why |
|--------|-----|
| `sync.action.lag_ms` — time between row commit and WS push to first client | Catches dispatcher pauses / backpressure. |
| `sync.action.fanout_count` — connections that received an action | Sizes the broadcast load. |
| `sync.connection.count` — concurrent WebSocket connections | Tracks capacity. |
| `sync.connection.dropped{reason}` — 4408 / 4409 / network | Surfaces auth / sync-gap regressions. |
| `sync.bootstrap.duration_ms` and `.size_bytes` | Detects bootstrap bloat. |
| `sync.transaction.queue_depth` (client-side, sampled) | Detects offline accumulation. |
| `pg.replication_slot.lag_bytes` (if Path B) | The thing PowerSync warned about. |

All emitted as OpenTelemetry from the Adonis app and as `console.warn` + sampled posts back to a `/admin/sync/telemetry` endpoint from the client.

---

## Failure modes & recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| WebSocket disconnect | Heartbeat miss | Exponential backoff reconnect; HELLO with current `lastSyncId` re-aligns. |
| Server restart | Connection closes, `BYE` frame | Same as above. |
| `sync_actions` row dropped (impossible by design) | Client receives non-contiguous `id` | Force re-bootstrap. |
| Postgres unavailable | All mutations 5xx | Transactions remain in `executing`; on recovery, server may reject with idempotency conflict. We tag each transaction with a `clientTxId` and the recorder upserts on `(clientTxId)` so a retry is idempotent. |
| Tab crash mid-edit | None — by design | On reopen, `_transactions` IndexedDB table is replayed before UI is interactive. |
| Operator's session revoked | `4408` on next WS frame | UI bounces to `/login`; transactions in `_transactions` are preserved for resubmission after re-auth. |
| Replication slot orphaned (Path A) | `pg_replication_slots.confirmed_flush_lsn` lag | Operator alert; manual `pg_drop_replication_slot`. Hub picks up from `sync_actions.id` snapshot. |
| Replication slot orphaned (Path B) | Same | ElectricSQL is supposed to handle this; we monitor. |

---

## Security posture

- All endpoints under `/admin/sync/*` require `admin_session`.
- WebSocket inherits the cookie via the same-origin proxy. No bearer ever in the URL or local storage.
- Mutations require `X-CSRF-Token` (already shipped, `commits/6ad4a91`).
- Sync actions stream NEVER includes columns marked `@hidden` (passwords, password reset tokens, internal admin notes flagged as private).
- The dispatcher checks group membership at fanout AND at bootstrap. Defense in depth.

---

## What's still uncertain

Decisions deferred to implementation, surfaced here so reviewers can challenge:

1. **Valtio vs Zustand vs custom proxies.** Valtio is the lead because of reactive proxies, but if bundle size or React 19 compatibility issues surface, we fall back to Zustand with a manual subscription model.
2. **GraphQL shim vs an actual GraphQL gateway.** If the shim grows beyond ~500 LOC we should reconsider Mercurius. Threshold check at end of Phase 4.
3. **Sticky load-balancer vs Redis pubsub for multi-instance fanout.** Deferred to scale, but the Phase 8 prompt covers both.
4. **TanStack DB pre-1.0 risk (Path B).** We accept it. If TanStack DB has a regression that blocks us, Path A is the documented escape hatch.
5. **Stress test budget.** We pick a target: 200 concurrent operators per merchant, 10 mutations/sec sustained, p99 push latency ≤ 100 ms. Phase 8 validates.
