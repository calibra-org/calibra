# Sync Engine Research Notes

This document is the snapshot of external work this design draws from. Every claim below is sourced. Don't silently rewrite — if a referenced article changes substantively, add a dated addendum rather than editing in place.

**Snapshot date:** 2026-05-20.

## Primary references

| # | Source | Why it matters |
|---|--------|----------------|
| 1 | [wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine) — endorsed by Linear's CTO | The clearest publicly-available reverse-engineering of Linear's sync engine. Source of every protocol-level claim about Linear below. |
| 2 | [marknotfound.com — *Reverse engineering Linear's sync magic*](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/) | Wire-format details: bootstrap endpoint shape, `SyncAction` JSON, delta endpoint, mutation response shape. |
| 3 | [fujimon.com — *Linear's sync engine architecture*](https://www.fujimon.com/blog/linear-sync-engine) | The "developer ergonomics" end — what writing `user.name = '…'; user.save()` actually does. |
| 4 | [Convex — *An Object Sync Engine for Local-first Apps*](https://stack.convex.dev/object-sync-engine) | The case for object-graph sync vs CRDT, and the "Server Reconciliation" pattern (server is authority, client rolls back optimistic state when authoritative arrives). |
| 5 | [Neon — *TanStack DB + ElectricSQL*](https://neon.com/blog/tanstack-db-and-electricsql) | The concrete shape of Path B (adopt instead of build). Postgres logical-replication → ElectricSQL → TanStack DB on the client. |
| 6 | [PowerSync — *Postgres logical replication challenges*](https://powersync.com/blog/postgres-logical-replication-challenges-solutions) | The traps you only discover in production: LSN ordering inside transactions, TOAST values, REPLICA IDENTITY, schema evolution. Read this before writing any change-feed code. |
| 7 | [Replicache docs — *Local Mutations* & main site](https://doc.replicache.dev/byob/local-mutations) | The "implement mutators twice" pattern (client + server), and rebasing optimistic mutations on top of authoritative pulls. Path C. |
| 8 | [tushar.ai — *Replicache Notes*](https://tushar.ai/posts/replicache/) | A practitioner's distillation of Replicache's push/pull cursor protocol. |
| 9 | [Apollo — *Speeding up GraphQL Mutations with optimistic UI*](https://www.apollographql.com/blog/tutorial-graphql-mutations-optimistic-ui-and-store-updates-f7b6b66bf0e2) | Validation that GraphQL mutation + optimistic UI is a paved-road pattern, not a Linear quirk. |

## Linear's architecture, distilled

### Client cache

- **Dual IndexedDB layout.** A top-level `linear_databases` registry tracks workspaces / schema versions; per-workspace databases (`linear_<hash>`) hold one table per model plus two special tables: `_meta` (persistence state, last sync id) and `_transaction` (unsent transactions). [Source: ref 1, *Client Cache Architecture*]
- **In-memory object pool.** A `modelLookup` map keyed by UUID holds hydrated instances. Properties are exposed via MobX-style getters/setters; reads on the object graph drive the entire UI reactively. Mutations to a property update the in-memory object *immediately* — they do not wait for `save()` or the server. [Source: ref 1, *Object Pool & Memory Management*; ref 3, *Write path*]
- **Lazy hydration.** Reference properties hold IDs, not full child models. Loading them triggers a network fetch keyed by the parent — e.g. `comment.issueId-<uuid>` for an Issue's comments. [Source: ref 1, *Lazy Loading via Partial Indexes*]

### Transactions

- Five core transaction classes: `Create`, `Update`, `Delete`, `Archive`, `Unarchive`. All extend a `BaseTransaction`. [Source: ref 1, *Transaction Types*]
- Lifecycle is four stages: `created` → `queued` (batched by microtask) → `executing` (server in flight) → `completedButUnsynced` (waiting for delta confirmation). [Source: ref 1, *Mutation Buckets & Batching*]
- Each transaction implements `serialize()` and a static `fromSerializedData()`. On boot, the `__transactions` IndexedDB table is read and any unsent transactions are replayed before the UI accepts new input. This is what makes Linear feel correct after a tab crash. [Source: ref 1, *Commit Log & Persistence*]
- Mutations are compiled into a **single merged GraphQL mutation per batch** with aliased operations. The response only requests `lastSyncId`. [Source: ref 1, *GraphQL Mutation Format*; ref 2, "the only requested field in the response is `lastSyncId`"]

### Server authority

- Local state is *strictly* a subset of authoritative state. Optimistic in-memory updates do not write to IndexedDB until the server confirms the change via a delta packet matching the transaction's expected `lastSyncId`. [Source: ref 1, *Server Authority*]
- Total ordering via a monotonic integer `lastSyncId` per workspace, not CRDTs. Conflicts on the same field follow last-writer-wins — Linear explicitly only resolves conflicts in `UpdateTransaction`. [Sources: ref 1, *Sync Actions & Version Control*; web search digest]

### Wire protocol

- **Bootstrap.** `GET /sync/bootstrap?type=full` — newline-delimited JSON. Each line is `<ModelName>=<JSON>`. Final line is `_metadata_={"method":"postgres","lastSyncId":613955486,...}`. A secondary partial bootstrap follows for deferred models. [Source: ref 2, *Bootstrap Message Shape*]
- **Delta packet.** `GET /sync/delta?lastSyncId=X&toSyncId=Y` returns an array of `SyncAction`: `{ id, action, modelName, modelId, data }`. `action` is one of `I` insert / `U` update / `D` delete / `A` archive (with `C`, `G`, `S`, `V` reserved for covering / sync-group / unarchive). `data` is the full model state or null. [Sources: refs 1, 2]
- **Push channel.** The same `SyncAction` packets are pushed live over a WebSocket on a `SyncMessage` channel. Clients call `applyDelta` on receive. [Source: ref 1, *Transport Protocol*]
- **Mutation.** A single GraphQL mutation with aliased per-transaction fields, response field `lastSyncId`. [Source: ref 1, *GraphQL Mutation Format*]

### Bootstrap modes

Three: `full` (empty IndexedDB, load everything), `partial` (specific sync groups), `local` (existing IndexedDB + delta to catch up). The handshake compares server's `lastSyncId` to the client's stored one and chooses. [Source: ref 1, *Three Bootstrap Types*]

### What's *not* documented publicly

The references don't cover: exponential-backoff retry, exact WebSocket framing on the wire, the format of `sync_group` membership messages, the behavior when a client's `lastSyncId` is so far behind that delta becomes inefficient (assumed: re-bootstrap), or any production benchmarks. Our design has to invent answers here, and we'll mark each invented decision in `ARCHITECTURE.md` so reviewers can challenge it.

## Convex's argument for object-graph sync (vs CRDTs)

The Convex post makes the case for syncing **structured objects with relations**, not raw documents or CRDTs:

- The data model is a typed object graph, like Linear's. [Source: ref 4]
- The server tails its own change feed and broadcasts invalidations. (Convex's database is reactive; the same idea works against a separate Postgres + logical replication slot.)
- The client subscribes to *queries*, not raw streams. The framework recomputes the query's result when an underlying record changes.
- **"Server Reconciliation"** rather than conflict resolution: the server is authoritative; client rolls back any optimistic state when the authoritative version arrives. Conflicts dissolve into "the server's version wins."
- This pattern shines for collaborative apps where the network is "optional" and ~500 ms latency is acceptable. It's poorly suited to real-time games or peer-to-peer systems without a server.

The Calibra admin sits firmly in the well-suited bucket. An operator updating an order's status while another operator opens the same order is exactly Convex's example.

## TanStack DB + ElectricSQL — what Path B actually looks like

[Source: ref 5]

- **ElectricSQL** is a "Postgres-native sync engine." It uses Postgres logical replication to detect changes and pushes them to clients over HTTP long-polling (`/v1/shape` endpoints).
- **TanStack DB** is a new package family (now sibling to TanStack Query) for client-side reactive collections with optimistic mutations.
- **Shape definitions.** A `shape` is a query against Postgres that ElectricSQL subscribes to. The shape's results flow to subscribed clients. Auth/RBAC is applied via a proxy endpoint that gates which shapes a given session can read.
- **Write path.** TanStack DB collection mutation → optimistic local apply → server action (your existing API) → Postgres write → ElectricSQL detects via replication slot → push to subscribed clients.
- **Why this is attractive for Calibra.** We already have AdonisJS doing the writes. ElectricSQL never sees a mutation; it only consumes the WAL. Adoption means: deploy ElectricSQL alongside Postgres, define a shape per merchant, install `@tanstack/db`, refactor reads from `useQuery(apiGet(...))` to `useLiveQuery(collection.query(...))`. Mutations stay where they are.

## PowerSync's warning list

[Source: ref 6]

The pitfalls of running Postgres logical replication in production, which we inherit whether we build (Path A) or adopt (Path B):

1. **LSN ordering.** Inside a single transaction, the LSN ranges of individual operations can overlap with concurrent transactions. Don't trust LSN as a total order. PowerSync's solution: layer your own monotonic `op_id` on top. Linear does the same (the `lastSyncId` integer).
2. **TOAST values.** Postgres only emits TOASTed columns in the WAL when they *change*. If you treat a delta as "all columns are present," you'll silently drop large text/jsonb. Mitigation: stateful processor that holds the current row state.
3. **REPLICA IDENTITY.** Default uses primary key; FULL emits every column (storage + replication overhead); USING INDEX needs careful index choice; NOTHING breaks UPDATE / DELETE identification entirely. Pick FULL for every table the sync engine subscribes to and budget for the WAL bloat.
4. **Schema evolution.** Naive sync engines pin their schema at boot and break on DDL. PowerSync ships "schemaless replication" — data flows as JSON; clients overlay SQLite views. Linear handles this via `__schemaHash` per model and a versioned IndexedDB upgrade. We'll need a similar story.
5. **Replication slot management.** A slot held open by a disconnected consumer pins WAL forever and will eventually fill the disk. Production operationalization needs: monitoring on `pg_replication_slots.confirmed_flush_lsn` lag, automatic teardown of orphaned slots, and explicit slot creation in CI / migrations rather than at runtime.

## Replicache's "implement mutators twice" pattern

[Source: refs 7, 8]

The mental model that Path C buys us:

- Mutators are **pure functions** that take a write-tx + args and apply changes locally. The same set of mutators runs server-side too. The client speculates; the server is authoritative.
- IDs are passed *into* mutators by the caller (not generated inside), so replay on top of new server state produces deterministic IDs.
- Sync is push (client → server) and pull (server → client) over HTTP. The pull endpoint returns a *patch* relative to a cookie/cursor the client sends. Bandwidth is proportional to change, not data set size.
- Optimistic mutations are *rebased* on top of authoritative pulls — "git rebase for state."

Replicache is a strong technical fit. The reason we don't pick it as the lead path is that "implement every mutation twice" creates a stronger coupling between the client app and the server's mutation set than we want in a multi-tenant SaaS where ops engineers ship server-side schema changes without touching the admin. ElectricSQL's "writes go through your existing API" model is a better fit for our team boundary.

## Calibra-specific implications

Reading these sources side-by-side, three things become concrete for our stack:

1. **The `sync_id` invariant is non-negotiable.** Whether we build or adopt, we need a per-merchant monotonic integer that orders every state-changing event. Path A: we generate it via a `sync_actions` table + sequence. Path B: ElectricSQL's `op_id`. Path C: Replicache's space version.
2. **Tenancy maps to sync groups.** Linear's "workspace" maps directly to our "merchant." A sync group key like `merchant:42` (and more granular `merchant:42:orders`, `merchant:42:catalog`) is the unit we filter the WAL by. RBAC on the WebSocket is the gateway here, not the database.
3. **Mutations don't need GraphQL to win this UX battle.** Linear chose GraphQL because their existing API was already GraphQL. Our existing API is OpenAPI-generated REST. The *sync engine* is independent of mutation transport — the win is the delta packets + object pool + transaction queue. So in `ARCHITECTURE.md` we describe the mutation surface in two flavors (REST-shaped, GraphQL-shaped) and let the path decision pick.
