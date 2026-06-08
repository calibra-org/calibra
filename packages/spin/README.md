# @calibra/spin

The developer-local stack orchestrator. One `pnpm spin <slug>` brings the whole Calibra stack up in an isolated, per-slug sandbox — datastores + observability in Docker, the apps (api / queue / admin / web / platform) as host HMR processes — fronted by Caddy with local TLS, plus a web panel and an Ink terminal dashboard.

This package replaces the legacy `scripts/spin/*.mjs` + `scripts/spin-agent.mjs`. `pnpm spin` and every `just spin*` recipe route through it unchanged.

## Commands

```sh
pnpm spin <slug>                 # worktree spin: fresh branch + dedicated stack + draft PR
pnpm spin <slug> --with-web      # also start the storefront (admin always starts)
pnpm spin <slug> --no-pr         # skip the draft PR
pnpm spin stop <slug>            # stop containers + host processes (volumes survive)
pnpm spin stop <slug> --purge --remove   # wipe volumes + drop the worktree/branch
pnpm spin pr <slug>              # create/recreate the draft PR

just spin                        # in-place spin against the CURRENT checkout (slug = local)
just spin-down                   # tear the in-place spin down (--purge to wipe volumes)

pnpm spin list --json            # every spin + status (starting/running/stopped/failed)
pnpm spin doctor <slug> --json   # probe every service + each tenant (exit 2 if any down)
pnpm spin status <slug>          # concise status
pnpm spin url <slug> [service]   # one URL to stdout (dashboard, grafana, smtp, …)
pnpm spin logs <slug> [stream]   # print a log path, or stream with -f
pnpm spin metrics <slug>         # api /metrics to stdout (exit 2 if down)
pnpm spin alerts <slug>          # Prometheus alerts via Caddy (exit 2 if down)
pnpm spin seed <slug>            # re-run the demo-tenant seeder
pnpm spin term [slug]            # interactive Ink terminal dashboard
pnpm spin trust [--install]      # trust Caddy's local CA so https://*.spin.localhost is green
```

Exit-code contract for agents: **0** ok, **2** down/scrape-failed (`doctor`/`status`/`metrics`/`alerts`), non-zero for command errors.

> For machine-readable output, use **`pnpm -s spin … --json`** (or the `just spin-*-json` recipes). Without `-s`, pnpm prints its run banner to stdout ahead of the JSON. Run from the package directly — `node packages/spin/dist/cli.js … --json` — is also clean.

## Surfaces

- **CLI** — `commander`, with a `pnpm spin <slug>` → `start` bare-slug alias.
- **Web panel** — served at `https://<slug>.spin.localhost` (the dashboard). React 19 is **bundled** into `dist/agent/client.js` (no CDN — works under sanctioned-cloud / offline networks). Shows the service grid, per-tenant shop cards, live SSE logs, and confirm-gated actions (restart / reseed / migrate). Bound to `127.0.0.1`.
- **TUI** — `pnpm spin term`, an Ink (k9s-style) dashboard: sandbox picker → services + tenants + live log pane; `r` restart, `l` logs, `o` open URL, `?` help.

All three render the **same** `buildSnapshot()` contract.

## Multi-tenant

A shop's admin/storefront is per-tenant. The canonical operator URL is the Caddy-TLS scheme:

```
https://aurora.admin.<slug>.spin.localhost   (admin for shop "aurora")
https://aurora.web.<slug>.spin.localhost     (storefront for shop "aurora")
https://console.<slug>.spin.localhost        (platform control plane)
```

The bare `admin.<slug>` / `web.<slug>` apex is the platform "unknown shop" page by design. Seeded shops (`aurora`, `mehr`, `kasra`) get explicit Caddy blocks; ad-hoc tenants are issued on-demand certs (authorized by the panel's `/api/caddy/ask`). Run `pnpm spin trust --install` once so the local CA is trusted (untrusted TLS is the usual cause of "multi-tenant looks broken"). `doctor` probes each tenant host through Caddy, so a broken tenant route fails loudly.

## Isolation

Each spin gets a deterministic 22-role port block in 13xxx (`sha256(slug)` → slot), its own `calibra-spin-<slug>` compose project, its own `.env` files, and per-spin secrets. State lives **in-repo** at `.claude/spin/<slug>.json` (survives `--remove`; readable from any worktree). The role/offset table is **append-only** — never reorder it (see `ports.test.ts`).

## Develop

```sh
pnpm --filter @calibra/spin build       # tsdown two-build (node CLI/TUI/server + browser panel)
pnpm --filter @calibra/spin dev         # tsdown --watch
pnpm --filter @calibra/spin typecheck
pnpm --filter @calibra/spin test        # vitest
```

`prepare` builds `dist/` on `pnpm install`, so a fresh clone runs `pnpm spin` with no manual build.
