================================================================
TASK — Sync Engine Phase 4: optimistic mutation engine + offline transaction queue
================================================================

The headline UX win: every admin write applies instantly, survives a tab crash / offline
window, and reconciles against the server via the Phase 3 delta stream (Convex "Server
Reconciliation"; last-writer-wins by `sync_actions.id`). Generalize the existing per-hook
`onMutate` optimism into one reusable engine and adopt it across the admin mutations.
Behind `NEXT_PUBLIC_SYNC_ENGINE_ENABLED`.

READ THE FOUNDATION DOC FIRST: `00-foundation.md`. Depends on Phase 1
(`lastSyncId` in the mutation response, `client_tx_id` idempotency via the
`X-Client-Tx-Id` header), Phase 2 (`SyncAction` wire shape), and Phase 3 (the delta
applier + `SyncProvider` + per-channel watermark — the confirmation signal lives here).

Start the phase on the **parallel `sync-engine` track** — do NOT land on `main`:

    pnpm spin sync-engine-phase-4
    cd <worktree-from-spin-handoff>
    git fetch origin && git merge origin/sync-engine   # fold in 00-foundation + Phases 1–3

`pnpm spin` cuts the branch from `origin/main` and opens a draft PR targeting `main`;
retarget it: `gh pr edit <PR#> --base sync-engine`. Verify with
`pnpm spin doctor sync-engine-phase-4 --json`. Commit + push; merge the phase PR **into
`sync-engine`**, NEVER into `main` (see `00-foundation.md` §7). Draft PR refreshes on push.

----------------------------------------------------------------
1. READ FIRST (verified paths)
----------------------------------------------------------------

- `apps/admin/src/lib/queries/api-client.ts` — `apiMutate(method, path, { body, … })`.
  It stamps `X-CSRF-Token`; you EXTEND it to also forward an optional `clientTxId` as the
  `X-Client-Tx-Id` header (Phase 1 reads it for idempotency).
- Existing optimism to GENERALIZE then REPLACE:
    - `apps/admin/src/lib/queries/orders.ts` → `useUpdateOrderStatus` (`onMutate`/`onError`/
      `onSettled` snapshot+rollback of the detail cache).
    - `apps/admin/src/lib/products/mutations.ts` → `useQuickEditProduct` (optimistic list
      patch + rollback), `useToggleFavorite` (PUT/DELETE), `useUpdateProduct`.
    - `apps/admin/src/lib/reviews/mutations.ts` → `useModerateReview`, `useTrashReviews`,
      `useRestoreReviews` (currently invalidate-then-refetch — the source of the
      flash/re-sort bugs; optimism fixes them).
- `apps/admin/src/lib/queries/use-settle-mutation.ts` — settle-then-persist. It COMPOSES
  with this engine (settle decides WHEN to fire; the fired mutation is optimistic). Do not
  remove it.
- Phase 3 artifacts you build on: `apps/admin/src/lib/sync/delta-applier.ts`
  (`patchListRow`/`removeListRow`/`setQueryData` helpers — reuse for the optimistic patch),
  `meta-store.ts` (watermarks), `sync-client.ts`/`SyncProvider.tsx` (where tx replay +
  confirmation hook in).
- `idb-keyval` (already a dep) for the `_transactions` durable store.
- `apps/admin/src/components/ui/toast` — the toast used for mutation success/failure.

----------------------------------------------------------------
2. ARCHITECTURAL RULES
----------------------------------------------------------------

R1. **Optimistic-apply through the SAME cache helpers the delta applier uses** (Phase 3
    `patchListRow` / `setQueryData`). One code path patches the cache whether the change
    is local-optimistic or server-delta — no divergence.
R2. **Confirm via the delta, not `onSettled`.** A transaction is finalized when the SSE
    delta carrying its change arrives — correlate by `client_tx_id` (preferred) or by
    `lastSyncId` (the mutation response's id; the tx is confirmed once the applier has
    processed an action with `id >= syncIdNeededForCompletion`). PREFERRED: add
    `clientTxId` to the `SyncActionWire` (a one-line Phase-2 addition — see STOP-and-ask)
    so the originating client (a) recognizes its own change and SKIPS re-applying it and
    (b) resolves the exact transaction. Fall back to `lastSyncId` correlation if not.
R3. **Rollback on error; rebase on conflict.** On a 4xx/5xx, restore the snapshot and
    toast the failure. If a conflicting delta for the same model arrives while the tx is
    still `executing` (another operator won), re-apply the local optimistic patch on top
    of the new authoritative row and resend with the SAME `clientTxId` (idempotent). For
    an invalid state transition the server returns 409 → roll back, do NOT rebase.
R4. **Durable + offline-safe.** Persist `queued`+`executing`+`completedButUnsynced` to
    IndexedDB `_transactions`. On `SyncProvider` boot, REPLAY them (resend) before
    accepting new input for that resource. On `navigator.onLine` flip to online, drain the
    queue. A mutation that fails because offline stays `executing` and retries.
R5. **Idempotency.** Every send carries `clientTxId`; Phase 1's recorder upserts on it, so
    a replay/retry never double-applies server-side.
R6. **Flag-gated.** When `NEXT_PUBLIC_SYNC_ENGINE_ENABLED` is off, `useOptimisticMutation`
    falls back to a plain `useMutation` (apiMutate + invalidate) — identical to today.

----------------------------------------------------------------
3. SCOPE
----------------------------------------------------------------

**A. `apps/admin/src/lib/sync/transactions/` module.**
- `types.ts` — `Transaction { clientTxId: string; resource: SyncResource; modelName: string;
  modelId: number | null; kind: "create"|"update"|"delete"; vars: unknown; snapshot:
  CacheSnapshot; status: "queued"|"executing"|"completedButUnsynced"; syncIdNeededForCompletion?:
  number; createdAt: number }`. `CacheSnapshot` = the `getQueriesData` results captured for
  rollback.
- `queue.ts` — the FSM (`created → queued → executing → completedButUnsynced`), an
  in-memory list mirrored to IndexedDB `_transactions` (idb-keyval, host-namespaced like
  `meta-store`). API: `enqueue(tx)`, `markExecuting`, `markCompletedUnsynced(id)`,
  `confirm(syncId | clientTxId)`, `fail(clientTxId)` (rollback + drop), `replayAll()`.
  Microtask batching is an EXTENSION POINT (v1 sends one REST call per tx; do not build
  GraphQL batching).
- `use-optimistic-mutation.ts` — the public hook:
  ```ts
  useOptimisticMutation<TVars>({
    resource, modelName,
    mutationFn: (vars, clientTxId) => apiMutate(...),     // returns { data, lastSyncId }
    optimisticUpdate: (qc, vars) => void,                 // patches cache via Phase-3 helpers
    targetId: (vars) => number | null,
    invalidateOnSettle?: QueryKey[],                      // e.g. counts
  })
  ```
  Flow: generate `clientTxId`; snapshot affected caches; `optimisticUpdate`; enqueue tx;
  `markExecuting`; call `mutationFn`; on success set `syncIdNeededForCompletion =
  response.lastSyncId`, `markCompletedUnsynced`; on error `fail` (rollback snapshot + toast);
  confirmation is driven by the delta applier (B), not here.

**B. Wire confirmation into the Phase 3 delta applier.** When `applyAction` processes an
action, call `queue.confirm(action.clientTxId ?? action.id)`:
  - If it matches a `completedButUnsynced` tx → resolve it (the optimistic state is now
    authoritative; the applier's own patch is a no-op/equal).
  - If a delta arrives for a model with an in-flight `executing` tx and a DIFFERENT
    `clientTxId` → conflict → rebase per R3.
  - If `action.clientTxId` is MY tx and the tx is still in flight → skip re-applying (avoid
    flicker). (Requires R2's `clientTxId` in the wire.)

**C. `apiMutate` extension.** Add an optional `clientTxId` arg → `X-Client-Tx-Id` header.

**D. `SyncProvider` boot replay.** On mount (flag on), `await queue.replayAll()` so a tab
reopened with unsent transactions resends them; subscribe to `online` to drain.

**E. Adoption sweep (same PR).** Migrate to `useOptimisticMutation`, deleting the bespoke
`onMutate` plumbing:
  - Orders: `useUpdateOrderStatus`, `useMarkShipped`.
  - Products: `useQuickEditProduct`, `useUpdateProduct`, `useToggleFavorite`.
  - Reviews: `useModerateReview`, `useTrashReviews`, `useRestoreReviews` (these are the
    ones whose invalidate-then-refetch caused row flash/re-sort — optimism + delta confirm
    fixes them at the root).
  - Customers: status/suspend toggles (keep note CREATES on invalidate — optimistic insert
    into a server-filtered list isn't safe; see Phase 3 R3).
  Keep `useSettleMutation` for conversational toggles; have its `mutate` call go through an
  optimistic mutation.

**F. Rollback/rebase UX.** On rollback, the existing failure toast. On rebase-away (a
peer's write supersedes the operator's in-flight change), a one-line info toast
("Updated by another operator") — minimal, do not block.

----------------------------------------------------------------
4. FILE LAYOUT (after this PR)
----------------------------------------------------------------

```
apps/admin/src/
├── lib/sync/transactions/
│   ├── types.ts                       ← NEW
│   ├── queue.ts                       ← NEW (FSM + IDB _transactions)
│   ├── use-optimistic-mutation.ts     ← NEW (public hook)
│   └── *.test.ts                      ← NEW (vitest: FSM, rollback, replay, confirm/rebase)
├── lib/sync/delta-applier.ts          ← EXTEND (call queue.confirm; skip own clientTxId)
├── lib/sync/SyncProvider.tsx          ← EXTEND (replayAll on boot; online drain)
├── lib/queries/api-client.ts          ← EXTEND (X-Client-Tx-Id)
├── lib/queries/orders.ts              ← EXTEND (adopt useOptimisticMutation)
├── lib/products/mutations.ts          ← EXTEND
├── lib/reviews/mutations.ts           ← EXTEND
└── lib/queries/customers.ts           ← EXTEND (status toggles)
```
(If R2's wire `clientTxId` is taken: `docs/api/reference/openapi/admin/components/schemas/SyncAction.yaml`
+ `apps/api/app/transformers/sync_action_transformer.ts` ← EXTEND, then sdk codegen.)

----------------------------------------------------------------
5. NON-NEGOTIABLES
----------------------------------------------------------------

- Optimistic patches go through the Phase-3 cache helpers (one patch path).
- Every send carries `clientTxId`; rely on Phase-1 idempotency for safe replay.
- No new deps; JSDoc only; commit scope `feat(admin): …` (+ `feat(api):`/`chore(sdk):` if
  wire `clientTxId` is added).
- Flag off → plain `useMutation` behaviour, byte-identical to today.
- Never leave a tx in `executing` with no retry path; never double-apply on replay.

----------------------------------------------------------------
6. DEFINITION OF DONE
----------------------------------------------------------------

Functional (vitest + manual; flag ON):
  [ ] Unit: optimistic update patches cache immediately; on mutationFn reject the snapshot
      is restored exactly.
  [ ] Unit: a tx moves queued→executing→completedButUnsynced→(confirmed) when the matching
      delta is applied; confirming removes it from `_transactions`.
  [ ] Unit: replaying the same `clientTxId` after a simulated reload does not duplicate the
      cache effect; `_transactions` is drained.
  [ ] Manual: change an order status → row updates instantly, no spinner; kill the network
      mid-flight → it retries on reconnect and lands once.
  [ ] Manual: review mark-spam/trash no longer flashes or jumps (the Phase-3 + optimistic
      path replaces the invalidate-then-refetch that caused it).
  [ ] Manual offline: DevTools offline → perform 3 mutations → online → all 3 land, no dupes.
Technical:
  [ ] admin typecheck + vitest + `just lint` green (+ api/sdk green if wire clientTxId added).
  [ ] No new deps.
Flag OFF:
  [ ] `useOptimisticMutation` === plain mutation; existing behaviour unchanged.

----------------------------------------------------------------
7. EXECUTION ORDER
----------------------------------------------------------------

1. `types.ts` + `queue.ts` (FSM + IDB) + unit tests for the FSM in isolation.
2. `apiMutate` `X-Client-Tx-Id`; (STOP-and-ask) decide wire `clientTxId` vs `lastSyncId`
   correlation — if adding to the wire, make the Phase-2 transformer + OpenAPI + sdk change
   first.
3. `use-optimistic-mutation.ts` + wire confirmation into `delta-applier.ts`; tests.
4. `SyncProvider` replay/drain.
5. Adoption sweep, ONE resource at a time (orders first — it already has optimism to port),
   verifying the two-tab + offline demos per resource.

STOP-and-ask gates: adding `clientTxId` to the `SyncAction` wire (touches Phase 2 + SDK);
any mutation whose optimistic shape can't be derived without a server round-trip (fall back
to invalidate for that one and note it).

Push commits often in small logical scopes; the draft PR auto-refreshes.
