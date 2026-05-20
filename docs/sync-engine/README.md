# Calibra Admin Sync Engine — Design Dossier

This directory is the design package for replacing the request/response data layer in **`apps/admin`** with a **Linear-style sync engine**: an in-memory object graph that the operator UI reads from synchronously, an IndexedDB-backed transaction queue for offline-safe mutations, and a server that streams authoritative delta packets over WebSocket as Postgres rows change. The storefront (`apps/web`) stays on plain REST/SSR by design — its read patterns (catalog browsing) do not benefit from this model, and the latency budget of marketing pages is incompatible with the bootstrap cost of an object pool.

> **Status.** Design only. No code lands in `apps/admin` from these docs until each phase is greenlit. The current React Query baseline (see [`apps/admin/AGENTS.md`](../../apps/admin/AGENTS.md)) is the foundation we build *on*, not something we discard.

## Reading order

1. **[`RESEARCH.md`](./RESEARCH.md)** — Field notes from Linear (via [wzhudev/reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine), [`marknotfound.com`](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/), [`fujimon.com`](https://www.fujimon.com/blog/linear-sync-engine)), Convex's object sync model, Replicache, TanStack DB + ElectricSQL, PowerSync's Postgres logical-replication challenges, and Asana's LunaDB. **Read this first.** It frames every decision in the architecture doc.
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** — The Calibra-specific design. Object graph, sync IDs, transaction lifecycle, server-side fanout, GraphQL mutation surface, WebSocket wire protocol, schema versioning, conflict policy, RBAC.
3. **[`IMPLEMENTATION.md`](./IMPLEMENTATION.md)** — The phased rollout. 8 phases over an estimated 12–16 calendar weeks (one engineer); 6–8 with two. Each phase has acceptance criteria, risks, and a clean rollback boundary.
4. **[`PROMPTS.md`](./PROMPTS.md)** — A Claude Code prompt for every phase. Each prompt is self-contained (briefing, scope, hard rules, verification recipe) and matches the brief format `apps/admin` already uses for large multi-day work.

## TL;DR for the busy reader

We have three paths. Pick one **before** opening `IMPLEMENTATION.md`.

| Path | What we build | Effort | Best when |
|------|---------------|--------|-----------|
| **A — Build (Linear-style)** | Custom WebSocket sync server in AdonisJS, GraphQL mutation surface, JS object pool on the client, IndexedDB transaction queue, Postgres `wal2json` consumer. | ~16w solo / 8w with two engineers. | We want full control of the protocol, the team has the bandwidth for protocol-level work, and we're confident in the long-term commerce SaaS bet. |
| **B — Adopt (ElectricSQL + TanStack DB)** | Run ElectricSQL alongside Postgres, point TanStack DB at it. Keep AdonisJS for mutations (writes still go through the existing REST/proxy path). | ~6w solo / 3w with two. | We want the UX win in this quarter, not next year. We're OK with ElectricSQL becoming a load-bearing dep. |
| **C — Adopt (Replicache)** | Replicache for the entire client + a Replicache push/pull endpoint on AdonisJS that bridges to Lucid models. | ~8w solo / 4w with two. | We value the rebasing-on-server-state model and like the "implement mutators twice" pattern. |

**Recommendation (CTO call): Path B for v1 inside Q3, with the option to peel ElectricSQL off and replace with Path A's custom engine in Q1 of the following year if scale requires it.** Path A is the right *long-term* architecture — it's also a quarter of engineering we can't justify before we've earned the product-market validation. Path B gives us 80 % of the UX delta now and leaves the upgrade door open.

If you disagree with the recommendation, jump to [`ARCHITECTURE.md § Path Decision`](./ARCHITECTURE.md#path-decision) — that section lays out the tradeoffs in detail so you can argue back with the same numbers.

## Non-goals (this dossier doesn't address them)

- **The storefront.** It stays REST + SSR.
- **Mobile apps.** No native admin app is planned; if one ships, the engine's WebSocket protocol is naturally portable, but design for it lives in a separate dossier.
- **Multi-region active-active.** Calibra is a single-region deployment per client; the sync hub is co-located with the primary Postgres and we don't try to solve cross-region replication of the change feed.
- **CRDTs.** Linear's choice — total ordering via a monotonic `sync_id` and a last-writer-wins policy on conflicting field updates — applies cleanly to commerce data, where almost every conflict is operator-vs-operator and the operator who clicked Save last is the one who meant it. We don't ship Y.js or Automerge.

## Glossary

| Term | Meaning in this dossier |
|------|-------------------------|
| **Object pool** | The client-side, in-memory map of `{ modelName, id } → instance`. Every UI read is synchronous against it. |
| **Transaction** | A single user intent — `OrderUpdate(id=42, status="processing")`. Lives on the client first; queues to the server; finalized when the server returns a `sync_id`. |
| **Sync action** | The server-side description of one change — `{ id: 91230, action: "U", modelName: "Order", modelId: 42, data: {...} }`. Sent down the WebSocket as part of a delta packet. |
| **`lastSyncId`** | A monotonically-increasing integer per workspace (per `merchantId`). The wall clock of the sync engine. |
| **Sync group** | A logical fence — e.g. `merchant:42`, `customer:99` — that decides which clients see which sync actions. Linear's RBAC primitive, applicable verbatim to our multi-merchant world. |
| **Bootstrap** | The first-load streaming of the operator's accessible model graph: `GET /admin/sync/bootstrap?type=full` → newline-delimited JSON. |
| **Delta** | The incremental sync from `lastSyncId=A` to `lastSyncId=B`, returned as an array of sync actions. Either pushed over the WebSocket (live) or pulled over HTTP (recovery). |

## How to evolve this dossier

- Any architecture change merges through a PR that updates **both** `ARCHITECTURE.md` and the relevant prompt in `PROMPTS.md`. Drift between the two is the bug we are most likely to introduce.
- `RESEARCH.md` is a snapshot — pin the dates of fetched articles and never silently re-write its claims. If a referenced piece updates, add a dated addendum.
- The phases in `IMPLEMENTATION.md` are sequenced because of real dependencies, not preference. Don't reorder them without a written justification in the PR description.
