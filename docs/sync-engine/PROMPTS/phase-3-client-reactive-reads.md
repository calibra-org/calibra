================================================================
TASK — Sync Engine Phase 3: client reactive reads (SSE → TanStack Query cache patching)
================================================================

Make open admin views update live when another operator changes data. Subscribe to the
Phase 2 Transmit channels, apply each delta by PATCHING THE TANSTACK QUERY CACHE (the
substrate decided in the foundation doc), and recover via `GET /admin/sync/delta` after a
reconnect/gap. No optimistic writes yet — that's Phase 4. No Valtio object pool, no local
query engine, no full mirror. Behind `NEXT_PUBLIC_SYNC_ENGINE_ENABLED`.

READ THE FOUNDATION DOC FIRST: `00-foundation.md` (§6 — the cache IS
the substrate). Depends on Phase 1 (`lastSyncId` envelope) + Phase 2 (channels, delta +
cursor endpoints, `SyncAction` SDK type).

Start a fresh worktree:

    pnpm spin sync-engine-phase-3

Verify with `pnpm spin doctor sync-engine-phase-3 --json`. Commit + push; PR refreshes.

----------------------------------------------------------------
1. READ FIRST (verified paths)
----------------------------------------------------------------

- `apps/admin/src/lib/transmit.ts` — the `@adonisjs/transmit-client` singleton
  (`getTransmit()`), CSRF-wired via `beforeSubscribe`. THE client transport — reuse it,
  do not add another.
- `apps/admin/src/app/api/transmit/[...path]/route.ts` — the SSE proxy (preserves
  `cache-control: no-transform`, streams the body). Subscriptions already work through it.
- `apps/admin/src/lib/queries/QueryProvider.tsx` — the `QueryClient`, the
  `PersistQueryClientProvider` (idb-keyval persister, `dehydrateOptions.shouldDehydrateQuery`
  currently persists only `["dashboard", …]`, buster `"v2"`, 24h). The `SyncProvider`
  mounts inside this so it shares the `queryClient`.
- `apps/admin/src/app/[locale]/(authenticated)/layout.tsx` — where `QueryProvider` mounts;
  you mount `<SyncProvider>` just inside it.
- `apps/admin/src/lib/queries/api-client.ts` — `apiGet` (you call `apiGet("sync/delta", …)`
  and `apiGet("sync/cursor")`).
- Query-key conventions + the adapters that turn a raw `AdminX` row into the view shape —
  THESE are what a delta `data` must flow through (the delta `data` == `AdminX` schema by
  Phase 1 design, so reuse the adapters):
    - orders: `apps/admin/src/lib/queries/orders.ts` (`["admin","orders","list"|"detail"|"counts",…]`)
      + `apps/admin/src/lib/adapters/orders.ts` (`toAdminOrderListRow`, `toAdminOrderDetail`).
    - products: `apps/admin/src/lib/products/queries.ts` + `apps/admin/src/lib/adapters/products.ts` (`toAdminProduct`).
    - customers: `apps/admin/src/lib/queries/customers.ts` + `adapters/customers.ts`.
    - coupons: `apps/admin/src/lib/queries/coupons.ts`.
    - reviews: `apps/admin/src/lib/reviews/queries.ts` + `adapters/reviews.ts` (`toAdminReview`).
- `idb-keyval` (catalog ^6.2.2, already used by QueryProvider) — for the `_meta` watermark store.
- SDK type for a delta row: `AdminSchemas["schemas"]["SyncAction"]` (Phase 2).

----------------------------------------------------------------
2. ARCHITECTURAL RULES
----------------------------------------------------------------

R1. **Patch the cache; never hold a full mirror; never fetch missing rows.** Reads stay
    server-paginated. The applier only touches data already in the cache, plus
    invalidations that trigger the EXISTING paginated refetch.
R2. **Delta `data` == `AdminX` schema == adapter input.** Run delta `data` through the
    SAME `toAdminX` adapter the list/detail hooks use, so a patched row is byte-identical
    to a fetched one. (This is why Phase 1's `forSync` shape must match `AdminX`.)
R3. **Action → cache op mapping (exact):**
    - `U`: `queryClient.setQueryData(["admin", res, "detail", id-keyed], next)` for the
      detail; AND for EVERY cached list variant (`getQueriesData(["admin", res, "list"])`)
      that contains the id, map-replace that row in place. Do not reorder, do not add.
    - `I`: a new row may or may not match a list's active server-side filter, so do NOT
      guess insertion — `invalidateQueries(["admin", res, "list"])` (background refetch)
      + invalidate `["admin", res, "counts"]`.
    - `D`: remove the id from every cached list variant + drop the detail; invalidate
      `["admin", res, "counts"]`.
    (Note: Phase 1 records soft-delete-to-trash as `U` with the post-image, so trashing
    flows through the `U` path and the row updates in place rather than vanishing — correct
    for the trash-tab UX.)
R4. **Watermark discipline.** Track `lastSyncId` per channel in IndexedDB `_meta`. On
    connect: `apiGet("sync/cursor")`; if `serverLastSyncId > localLastSyncId`, pull
    `apiGet("sync/delta", { since: localLastSyncId, channels })` and apply in id order;
    on `409 resync_required` (or no local watermark), `invalidateQueries(["admin"])` for
    the affected resources (refetch the loaded views — NOT a full bootstrap) and set the
    watermark to the server cursor.
R5. **Flag-gated + inert when off.** `NEXT_PUBLIC_SYNC_ENGINE_ENABLED` (declare in the
    admin env). When off, `SyncProvider` renders children and does nothing else.
R6. **Idempotent application.** Skip any action whose `id <= channel watermark` (deltas +
    live pushes can overlap during reconnect).

----------------------------------------------------------------
3. SCOPE
----------------------------------------------------------------

**A. `apps/admin/src/lib/sync/` module.**
- `channels.ts` — the channel list (`orders|catalog|customers|coupons|reviews` + `counts`)
  and a `SYNC_MODEL_MAP`: `{ Order: { resource: "orders", toView: toAdminOrderListRow,
  toDetail: toAdminOrderDetail }, Product: { resource: "products", toView: toAdminProduct },
  … }`. This is the single registry mapping a `SyncAction.modelName` → which query keys to
  patch + which adapter to run. (Hand-maintained, mirrors Phase 1's `SYNC_MODELS`.)
- `delta-applier.ts` — `applyAction(queryClient, action)` implementing R3. Pure-ish
  (queryClient in, cache mutated) so it is unit-testable. Export helpers
  `patchListRow(queryClient, resource, id, view)` and `removeListRow(...)` that iterate
  `getQueriesData`.
- `meta-store.ts` — idb-keyval-backed `_meta`: `getWatermark(channel)` /
  `setWatermark(channel, id)` (namespaced key per `window.location.host`, like
  QueryProvider). In-memory mirror so the hot path doesn't await IDB on every push.
- `reconcile.ts` — `reconcileOnConnect(queryClient)` implementing R4 (cursor → delta →
  apply, or resync-invalidate).
- `sync-client.ts` — owns the Transmit subscriptions: subscribe to each `admin/sync/<ch>`,
  on message run `applyAction` + advance the watermark; on (re)subscribe run
  `reconcileOnConnect`. Expose `start()` / `stop()`.
- `SyncProvider.tsx` — a client component that, when the flag is on, calls `start()` on
  mount and `stop()` on unmount, and re-reconciles on `visibilitychange`/online events.

**B. Mount `<SyncProvider>`** inside `QueryProvider` in
`apps/admin/src/app/[locale]/(authenticated)/layout.tsx` (must be under the
`QueryClientProvider` to access the shared `queryClient` via `useQueryClient()`).

**C. Channel subscription set.** Single-tenant admin sees everything, so subscribe to ALL
domain channels + `counts` on mount (cheap over one SSE connection). No per-route
subscribe/unsubscribe churn in v1.

**D. Counts.** On a `counts` push (or any I/D/status-U), `invalidateQueries(["admin", res,
"counts"])` so the status-tab badges refresh.

**E. Detail-key shape.** Detail query keys differ per resource (e.g. orders
`["admin","orders","detail", id, {locale}]`, products `["admin","product", id, locale]`).
`SYNC_MODEL_MAP` must encode the exact detail-key builder per resource — read each
`queries.ts` and copy the real key shapes (do NOT assume a uniform shape).

----------------------------------------------------------------
4. FILE LAYOUT (after this PR)
----------------------------------------------------------------

```
apps/admin/src/
├── lib/sync/
│   ├── channels.ts          ← NEW (SYNC_MODEL_MAP, channel list)
│   ├── delta-applier.ts     ← NEW (applyAction + list/detail patchers)
│   ├── meta-store.ts        ← NEW (idb-keyval watermarks)
│   ├── reconcile.ts         ← NEW (cursor→delta→apply / resync)
│   ├── sync-client.ts       ← NEW (Transmit subscriptions)
│   ├── SyncProvider.tsx     ← NEW (lifecycle, flag gate)
│   └── *.test.ts            ← NEW (vitest: applier + reconcile, jsdom)
├── app/[locale]/(authenticated)/layout.tsx   ← EXTEND (mount SyncProvider)
└── env / config for NEXT_PUBLIC_SYNC_ENGINE_ENABLED ← EXTEND
```

----------------------------------------------------------------
5. NON-NEGOTIABLES
----------------------------------------------------------------

- Reuse `lib/transmit.ts` (do NOT instantiate another Transmit client) and `apiGet`
  (do NOT bypass the proxy / CSRF).
- Reuse the existing `toAdminX` adapters; do NOT hand-map delta rows.
- No new deps (Transmit client + idb-keyval already present).
- JSDoc only; commit scope `feat(admin): …`.
- When the flag is off, ZERO behaviour change (no subscriptions, no IDB writes).
- The applier must NEVER `fetchQuery` a missing row; only `setQueryData` on present data
  and `invalidateQueries` for refetch.

----------------------------------------------------------------
6. DEFINITION OF DONE
----------------------------------------------------------------

Functional (vitest + manual two-tab check; flag ON):
  [ ] Unit: `applyAction` with a `U` patches the detail cache AND every cached list
      variant containing the id, running the row through the resource's adapter; leaves
      other rows/order untouched.
  [ ] Unit: `I` and `D` invalidate the list + counts; `D` also drops the detail; the
      applier never fetches a missing row.
  [ ] Unit: `reconcileOnConnect` pulls `delta?since=watermark`, applies in id order, and
      advances the watermark; a `409` triggers `invalidateQueries(["admin", res])` instead.
  [ ] Idempotency: replaying an action with `id <= watermark` is a no-op.
  [ ] Manual two-tab: edit an order status in tab A → tab B's open orders list + detail
      reflect it within ~1s, with no full-page refetch flash (only the row updates).
Technical:
  [ ] admin typecheck + `just lint` green; vitest green.
  [ ] No new deps.
Flag OFF:
  [ ] No SSE subscription opens; no IDB `_meta` writes; lists behave exactly as today.

----------------------------------------------------------------
7. EXECUTION ORDER
----------------------------------------------------------------

1. `channels.ts` (`SYNC_MODEL_MAP` with REAL per-resource query-key + adapter wiring —
   read each `queries.ts` first).
2. `delta-applier.ts` + unit tests (the riskiest logic — get list/detail patching right
   in isolation before any SSE).
3. `meta-store.ts` + `reconcile.ts` + tests (mock `apiGet`).
4. `sync-client.ts` (subscriptions) + `SyncProvider.tsx` + mount in the authenticated
   layout behind the flag.
5. Manual two-tab verification; DoD.

STOP-and-ask gates: if any resource's detail/list cache key cannot be derived
deterministically from `{modelName, modelId}` (e.g. a composite key needing locale you
don't have on the delta), STOP and decide whether to invalidate-instead-of-patch for that
resource rather than guessing the key.

Push commits often in small logical scopes; the draft PR auto-refreshes.
