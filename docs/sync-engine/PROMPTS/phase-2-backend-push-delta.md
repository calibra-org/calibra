================================================================
TASK — Sync Engine Phase 2: push (Transmit/SSE) + delta recovery + retention (backend)
================================================================

Make the Phase 1 change log observable in real time and recoverable after a gap. Add:
(1) a commit-time broadcast of each `sync_actions` row over a `@adonisjs/transmit` domain
channel, (2) a `GET /admin/sync/delta` recovery endpoint, (3) a `GET /admin/sync/cursor`
watermark endpoint, (4) a retention prune. Still NO client work — that's Phase 3. Strictly
additive, behind `SYNC_ENGINE_ENABLED`.

READ THE FOUNDATION DOC FIRST: `00-foundation.md`. This phase depends
on Phase 1 (`sync_actions` table, `SyncActionRecorder`, `SYNC_MODELS`, the `forSync`
variants, `lastSyncId` envelope). Build on those; do NOT re-spec them.

Start a fresh worktree:

    pnpm spin sync-engine-phase-2

Verify with `pnpm spin doctor sync-engine-phase-2 --json`. Commit + push; draft PR refreshes.

----------------------------------------------------------------
1. READ FIRST (verified paths)
----------------------------------------------------------------

- `apps/api/start/transmit.ts` — THE pattern to mirror. It registers Transmit routes
  behind `middleware.auth({ guards: ["api"] })`, defines per-channel `authorize`
  resolvers (`imports/:importId`, `exports/:exportId` check ownership), and wires
  subscribe/unsubscribe to gauges in `domain_metrics.ts`. You add `admin/sync/:channel`.
- `apps/api/config/transmit.ts` — Redis transport, `pingInterval`, per-spin namespacing.
  No change expected; read to understand the multiplex.
- Broadcast call sites to mirror: `apps/api/app/services/product_import/event_bus.ts`,
  `apps/api/app/services/product_export/export_event_bus.ts`
  (`transmit.broadcast(channel, payload)`).
- `apps/api/app/services/sync/sync_action_recorder.ts` (Phase 1) — you extend it to
  broadcast on commit.
- `apps/api/app/services/metrics/domain_metrics.ts` — `setSseClients(root, count)` +
  the metrics registry; add sync counters here.
- `apps/api/app/middleware/admin_middleware.ts` — the admin role check to reuse in the
  channel `authorize` + the delta route.
- `apps/api/app/lib/table_view/*` is NOT used here — the delta query is a plain
  `id > since AND channel IN (...)` scan; do NOT route it through TableView.
- OpenAPI: `docs/api/reference/openapi/admin.v1.yaml` (path registry) + an existing path
  file under `docs/api/reference/openapi/admin/paths/` to mirror, and
  `docs/api/reference/openapi/admin/components/schemas/` for the new `SyncAction` schema.
- `apps/api/database/migrations/*_create_queue_tables.ts` + `apps/api/app/jobs/run_import_job.ts`
  — the `@adonisjs/queue` job + scheduling pattern for the retention prune.

----------------------------------------------------------------
2. ARCHITECTURAL RULES
----------------------------------------------------------------

R1. **Broadcast on COMMIT, never before.** A sync action must not be visible until its
    transaction commits. Register the broadcast via the Lucid transaction's
    `trx.after('commit', cb)` hook from inside `SyncActionRecorder.record`, so a rollback
    silently drops the pending broadcast. This is load-bearing — broadcasting pre-commit
    leaks phantom state to other operators.
R2. **Redis carries the payload — no `pg_notify`/`LISTEN` consumer.** Transmit already
    multiplexes over Redis pub/sub (config/transmit.ts), so broadcast the full
    `SyncAction` JSON directly. Do NOT build the dossier's separate NOTIFY dispatcher.
R3. **Channel auth = admin role only** (single-tenant). The `authorize` resolver returns
    true iff `ctx.auth.user?.role === 'admin'`. No per-tenant scoping.
R4. **Delta is a recovery path, not the steady state.** Steady state is the live SSE push
    (Phase 3 consumes it). `delta` is only hit on (re)connect/gap. Cap it at 5000 rows.
R5. **Flag-gated.** Broadcast, the delta/cursor routes, and the prune all no-op / 404
    when `SYNC_ENGINE_ENABLED=false`.

----------------------------------------------------------------
3. SCOPE
----------------------------------------------------------------

**A. Commit-time broadcast.** Extend `SyncActionRecorder.record` (Phase 1): after the
INSERT, register `trx.after('commit', () => transmit.broadcast('admin/sync/' + channel,
syncAction))` where `syncAction = { id, action, modelName, modelId, data }` (the same
shape the delta endpoint returns — define it ONCE as a `SyncActionWire` type/transformer
in `apps/api/app/transformers/sync_action_transformer.ts` and reuse for both broadcast +
delta). Also broadcast a lightweight `{ channel, lastSyncId }` on `admin/sync/counts` for
any action whose model affects a tab count (all of them, for v1).

**B. Channel registration + auth.** In `start/transmit.ts`, register
`admin/sync/:channel` (and `admin/sync/counts`) with an `authorize` that requires admin
role AND `:channel` ∈ the `SYNC_MODELS` channel set. Wire subscribe/unsubscribe to a new
`setSseClients('sync:' + channel, n)` gauge.

**C. `GET /api/v1/admin/sync/delta`.** New controller
`apps/api/app/controllers/admin/sync_controller.ts#delta`, route in
`apps/api/start/routes/admin_sync.ts` under the admin-guarded group
(`.prefix('/api/v1/admin').use(auth).use(admin)`).
- Query (VineJS validator): `since: number` (required, ≥0), `channels: csvArray<string>`
  (optional; default all `SYNC_MODELS` channels), `until: number` (optional).
- Behavior: `SELECT id, action, model_name, model_id, data FROM sync_actions WHERE id >
  since [AND id <= until] AND channel = ANY(channels) ORDER BY id ASC LIMIT 5001`. Return
  the first 5000 as `actions`, `complete = rows.length <= 5000`, `lastSyncId =
  last action id (or since when empty)`.
- Gap floor: if `since < (SELECT MIN(id) FROM sync_actions) - 1` (i.e. the client is
  behind the prune horizon), return `409 { error: "resync_required", minimum_sync_id }`.
- Response shape `{ data: { actions: SyncAction[], lastSyncId: number, complete: boolean } }`
  using the standard envelope.

**D. `GET /api/v1/admin/sync/cursor`.** Same controller `#cursor`. Returns
`{ data: { lastSyncId: <MAX(id) or 0>, channels: [...] } }`. The client calls this on
connect to learn the current watermark before deciding bootstrap-vs-delta.

**E. Retention prune.** An ace command `apps/api/commands/sync_prune.ts`
(`node ace sync:prune`) that deletes `sync_actions` older than `now() - INTERVAL '7 days'`
(make the window an env, `SYNC_ACTIONS_RETENTION_DAYS`, default 7). Wire it to the
existing scheduler (`queue_schedules` / the repo's cron mechanism — mirror how other
periodic jobs are scheduled; if none exists, document the cron line and STOP-and-ask
before adding new scheduler infra).

**F. Metrics.** In `domain_metrics.ts`: `sync_action_fanout_total{channel}` (incremented
per broadcast), `sync_delta_requests_total`, `sync_delta_duration_seconds` (histogram),
and the `sync:<channel>` SSE client gauges from (B).

----------------------------------------------------------------
4. BACKEND CONTRACT
----------------------------------------------------------------

Two new endpoints. Each: route + controller method + VineJS validator + a NAMED OpenAPI
schema (`SyncAction.yaml`, `SyncDeltaResponse.yaml`, `SyncCursorResponse.yaml` under
`docs/api/reference/openapi/admin/components/schemas/`, $ref'd — never inlined) +
registration in `admin.v1.yaml` + a Japa functional test (401 + 403-non-admin +
happy-path `assertAgainstApiSpec()` + each dimension). After spec changes:
`pnpm --filter @calibra/sdk run codegen` and commit the regenerated types.
`SyncAction` schema: `{ id: integer, action: string enum[I,U,D], modelName: string,
modelId: integer, data: object|null }`.

----------------------------------------------------------------
5. FILE LAYOUT (after this PR)
----------------------------------------------------------------

```
apps/api/
├── app/controllers/admin/sync_controller.ts                 ← NEW (delta, cursor)
├── app/validators/admin/sync_validator.ts                   ← NEW
├── app/transformers/sync_action_transformer.ts             ← NEW (SyncActionWire)
├── app/services/sync/sync_action_recorder.ts               ← EXTEND (commit broadcast)
├── app/services/metrics/domain_metrics.ts                  ← EXTEND (sync counters)
├── start/transmit.ts                                       ← EXTEND (admin/sync channels)
├── start/routes/admin_sync.ts                              ← NEW (+ import in start/routes.ts)
├── commands/sync_prune.ts                                  ← NEW (ace sync:prune)
├── start/env.ts                                            ← EXTEND (SYNC_ACTIONS_RETENTION_DAYS)
└── tests/functional/admin/sync_delta.spec.ts               ← NEW
docs/api/reference/openapi/admin/
├── components/schemas/{SyncAction,SyncDeltaResponse,SyncCursorResponse}.yaml ← NEW
├── paths/sync/{delta.get,cursor.get}.yaml                  ← NEW
└── ../admin.v1.yaml                                        ← EXTEND (register paths)
packages/sdk/src/generated/admin.d.ts                       ← REGENERATED
```

----------------------------------------------------------------
6. NON-NEGOTIABLES
----------------------------------------------------------------

- JSDoc only; commit scope `feat(api): …` (+ `chore(sdk):` for the regen).
- No new deps (Transmit + queue already present). If the retention scheduler needs new
  infra → STOP-and-ask.
- The `SyncActionWire` shape is defined ONCE and shared by broadcast + delta (no drift).
- Delta/cursor/broadcast all no-op or 404 when the flag is off.
- Channel `authorize` MUST reject non-admin (test it).

----------------------------------------------------------------
7. DEFINITION OF DONE
----------------------------------------------------------------

Functional (Japa, flag ON):
  [ ] Recording a mutation (Phase 1 path) results in a `transmit.broadcast` to
      `admin/sync/<channel>` ONLY after commit — assert via the in-memory Transmit
      transport (`TRANSMIT_TRANSPORT=none`) capturing the broadcast; a rolled-back
      mutation broadcasts nothing.
  [ ] `GET /admin/sync/cursor` returns the current `MAX(id)` (or 0 on empty).
  [ ] `GET /admin/sync/delta?since=N` returns only actions with `id > N`, ordered, capped;
      `complete:false` when >5000 remain.
  [ ] `?channels=orders` filters to that channel only.
  [ ] `since` below the prune floor → 409 `resync_required` with `minimum_sync_id`.
  [ ] Non-admin token → 403 on delta/cursor AND on channel subscribe.
  [ ] Unauthenticated → 401.
  [ ] `node ace sync:prune` deletes rows older than the retention window and keeps newer.
Technical:
  [ ] api typecheck + test, `just lint`, `just docs-check`, sdk `codegen:check` green.
  [ ] `SyncAction`/`SyncDeltaResponse`/`SyncCursorResponse` are named, $ref'd schemas; SDK regenerated.
Flag OFF:
  [ ] delta/cursor 404; no broadcasts; existing specs unchanged.

----------------------------------------------------------------
8. EXECUTION ORDER
----------------------------------------------------------------

1. `sync_action_transformer.ts` (`SyncActionWire`) + extend recorder with the
   `trx.after('commit')` broadcast; functional test the commit-vs-rollback broadcast.
2. `start/transmit.ts` channels + authorize + gauges.
3. `sync_controller.ts` delta + cursor + validator + routes; functional tests.
4. OpenAPI schemas + paths + register + `codegen`; `docs-check`.
5. `sync:prune` command + scheduler wiring (STOP-and-ask if new scheduler infra needed).
6. Metrics + full DoD.

Push commits often in small logical scopes; the draft PR auto-refreshes.
