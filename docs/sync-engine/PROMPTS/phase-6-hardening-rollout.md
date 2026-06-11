================================================================
TASK — Sync Engine Phase 6: hardening, observability, adoption completion & rollout
================================================================

Make the engine operationally real and turn it on. Finish adoption (counts via push, kill
polling intervals, extend the persisted cache to the working set), add the observability
the dossier mandates, run the stress/soak, and flip the flags. This is the phase that
earns the "ship it" decision; nothing is removed until the engine is proven.

READ THE FOUNDATION DOC FIRST: `00-foundation.md` (§4 goodies, §5
phase map, §7 conventions). Depends on Phases 1–4 (and 5 if shipped).

Start the phase on the **parallel `sync-engine` track** — do NOT land on `main`:

    pnpm spin sync-engine-phase-6
    cd <worktree-from-spin-handoff>
    git fetch origin && git merge origin/sync-engine   # fold in 00-foundation + Phases 1–5

`pnpm spin` cuts the branch from `origin/main` and opens a draft PR targeting `main`;
retarget it: `gh pr edit <PR#> --base sync-engine`. Verify with
`pnpm spin doctor sync-engine-phase-6 --json`. Commit + push; merge the phase PR **into
`sync-engine`**. PROMOTING `sync-engine` → `main` is the SINGLE final integration PR, done
AFTER this phase's pilot soak (a STOP-and-ask gate, §6 below). Draft PR refreshes on push.

----------------------------------------------------------------
1. READ FIRST (verified paths)
----------------------------------------------------------------

- `apps/api/app/services/metrics/domain_metrics.ts` — the Prometheus registry +
  `setSseClients`. Phase 2 added `sync_action_fanout_total` / `sync_delta_*`; you add the
  remaining sync signals here. The api exposes `/metrics` already.
- `docker/observability/grafana/dashboards/` — commit a new dashboard JSON here (the repo
  rule: "clickops dashboards aren't reproducible").
- `apps/admin/src/lib/queries/orders.ts` → `useOrderCounts` (`refetchInterval: 15_000`) and
  any other polling intervals — these get replaced by the Phase-2 `counts` channel.
- `apps/admin/src/lib/queries/QueryProvider.tsx` — `dehydrateOptions.shouldDehydrateQuery`
  currently persists only `["dashboard", …]`; extend to persist the loaded working set
  (lists/details) so a reload is instant and the Phase-3 watermark reconciles the gap.
- `apps/api/start/env.ts` + `apps/admin` env — `SYNC_ENGINE_ENABLED` /
  `NEXT_PUBLIC_SYNC_ENGINE_ENABLED` flags from Phases 1–4.
- `docs/sync-engine/PROMPTS/` (this set) + `docs/sync-engine/RESEARCH.md` (retained
  field notes) — the canonical plan; reference `PROMPTS/` from `apps/admin/AGENTS.md` +
  `apps/api/AGENTS.md`.
- `scripts/` + `just` recipes — where a load-test script + a `just` target should live
  (mirror existing tooling conventions).

----------------------------------------------------------------
2. SCOPE
----------------------------------------------------------------

**A. Adoption completion.**
- Replace polling with the push `counts` channel: delete `refetchInterval` on
  `useOrderCounts` (and any sibling counts hooks); the Phase-3 applier already invalidates
  `["admin", res, "counts"]` on relevant deltas. Verify badges stay live without polling.
- Audit every admin list/detail to confirm it benefits from the engine (subscribed channel
  + optimistic mutations). List any surface still on plain invalidate-then-refetch and
  either migrate it or document why (e.g. file-upload / export endpoints stay REST-only).

**B. Persisted working-set cache (goodie).** Extend the QueryProvider dehydrate filter to
persist `["admin", …]` list/detail queries (not just dashboard), bump the persist `buster`
("v2" → "v3"), and confirm rehydrate + Phase-3 `reconcileOnConnect` produces a correct,
non-stale view after a full reload (cursor → delta → apply). Respect the 24h max-age +
quota eviction already in place.

**C. Observability (per dossier § Observability, adapted).**
Server (`domain_metrics.ts`, exposed on `/metrics`):
  - `sync_action_lag_ms` — commit→broadcast latency (histogram).
  - `sync_action_fanout_total{channel}` (Phase 2) — confirm wired.
  - `sync_sse_clients{channel}` gauge (Phase 2) — confirm wired.
  - `sync_delta_requests_total` / `sync_delta_duration_seconds` (Phase 2).
Client (sampled, posted to a new `POST /api/v1/admin/sync/telemetry` OR folded into the
existing client metrics path — pick one, do not invent a second telemetry pipe):
  - `sync.transaction.queue_depth`, `sync.apply.duration_ms`, `sync.reconnect.count`.
Grafana: commit `docker/observability/grafana/dashboards/sync-engine.json` with panels for
action lag, fanout, SSE client count, delta latency, client queue depth. Alerts:
action-lag p99 > 1s, SSE client count > 90% capacity.

**D. Resilience drills (tests + scripts).**
- Reconnect storm: a script that opens N SSE clients, drops them, reconnects with jittered
  backoff; assert no missed deltas (each client's post-reconnect `delta?since=` closes the
  gap). The Transmit client handles reconnect; verify the watermark reconcile is correct.
- Gap recovery: force a `sync_actions` id beyond a client's watermark + prune below it →
  client gets `409 resync_required` → invalidates loaded queries → converges.
- Offline replay (from Phase 4) re-verified end-to-end.

**E. Stress / soak.**
- A load-test (`scripts/sync-stress.mjs` + `just sync-stress`) simulating the dossier's
  target: 200 concurrent operators, 10 mutations/sec sustained, 30 min. Assert p99
  commit→push latency ≤ 100 ms and zero lost transactions. Run against a spin or staging.
- Nightly CI job posting results (mirror how other perf checks report, if any).

**F. Rollout.**
- Staging: `SYNC_ENGINE_ENABLED=true` + `NEXT_PUBLIC_SYNC_ENGINE_ENABLED=true`; soak.
- Production: flip for one pilot client; soak two weeks behind the kill-switch (flag off =
  instant fallback to the React Query path, which still exists).
- Do NOT remove the React Query baseline or the `/api/admin` proxy in this phase — only
  after the pilot is rock-solid (a separate cleanup PR). The dossier's "tear-down" is
  explicitly deferred until then.

**G. Docs.** Add a one-paragraph "as-built" summary to
`docs/sync-engine/PROMPTS/00-foundation.md` (what actually shipped vs the plan) and a
dated addendum to `docs/sync-engine/RESEARCH.md` if any sourced claim changed. Reference
`docs/sync-engine/PROMPTS/` from `apps/admin/AGENTS.md` + the repo `AGENTS.md`.

----------------------------------------------------------------
3. FILE LAYOUT (after this PR)
----------------------------------------------------------------

```
apps/api/
├── app/services/metrics/domain_metrics.ts       ← EXTEND (sync_action_lag_ms, telemetry counters)
├── app/controllers/admin/sync_controller.ts     ← EXTEND (POST /sync/telemetry, optional)
└── start/routes/admin_sync.ts                    ← EXTEND (telemetry route)
apps/admin/src/
├── lib/queries/QueryProvider.tsx                ← EXTEND (persist working set, buster v3)
├── lib/queries/orders.ts (+ sibling counts)     ← EXTEND (drop refetchInterval)
└── lib/sync/telemetry.ts                         ← NEW (sampled client metrics)
docker/observability/grafana/dashboards/sync-engine.json ← NEW
scripts/sync-stress.mjs + justfile               ← NEW (+ just sync-stress)
docs/sync-engine/{README,IMPLEMENTATION}.md      ← EXTEND (as-built / superseded notes)
apps/admin/AGENTS.md, AGENTS.md                   ← EXTEND (reference the dossier)
```

----------------------------------------------------------------
4. NON-NEGOTIABLES
----------------------------------------------------------------

- The React Query path + `/api/admin` proxy STAY (kill-switch). No tear-down here.
- Grafana dashboards committed as JSON (no clickops).
- No new deps without approval; reuse the existing metrics/Transmit/queue infra.
- JSDoc only; commit scopes `feat(api):` / `feat(admin):` / `chore(agents):` as appropriate.
- Backend telemetry endpoint (if added) ships with a Japa test + OpenAPI + sdk regen like
  any other endpoint.

----------------------------------------------------------------
5. DEFINITION OF DONE
----------------------------------------------------------------

  [ ] Tab-count badges stay live with NO polling interval (push-driven).
  [ ] Two-tab demo: mutate in A → B repaints ≤1s, no full refetch flash.
  [ ] Flight-mode demo: offline → 3 mutations → online → all land once.
  [ ] Full reload: persisted working set rehydrates + reconciles via cursor/delta to a
      correct, non-stale view.
  [ ] Gap drill: client below the prune floor gets `resync_required` and converges.
  [ ] Stress: 200 operators / 10 mutations-sec / 30 min → p99 push ≤100ms, zero lost tx.
  [ ] Grafana board renders all sync panels from real `/metrics`; alerts defined.
  [ ] Flag OFF anywhere = instant fallback to React Query (kill-switch verified).
  [ ] api + admin typecheck/test, `just lint`, `just docs-check`, sdk `codegen:check` green.
  [ ] Dossier + AGENTS.md updated; React Query path + proxy still present (tear-down deferred).

----------------------------------------------------------------
6. EXECUTION ORDER
----------------------------------------------------------------

1. Observability (server signals + client telemetry + Grafana board) — you can't operate
   the rollout blind.
2. Adoption completion (counts-via-push, drop polling) + persisted working-set cache.
3. Resilience drills (reconnect / gap / offline) as tests.
4. Stress script + `just sync-stress`; tune until the latency budget holds.
5. Staging flag-on + soak; then pilot-client production flag-on behind the kill-switch.
6. Docs/AGENTS updates.

STOP-and-ask gates: flipping the PRODUCTION flag (shared-state, customer-facing) — confirm
with the owner before enabling beyond staging. Removing the React Query path / proxy — NOT
in this phase; a separate cleanup PR after the pilot soak.

Push commits often in small logical scopes; the draft PR auto-refreshes.
