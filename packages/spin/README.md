# @calibra/spin

The developer-local stack orchestrator. One `pnpm spin <slug>` brings the whole Calibra stack up in an isolated, per-slug sandbox — datastores in Docker, the apps (api / queue / admin / web / platform) as host HMR processes — fronted by Caddy with local TLS, plus a web panel and an Ink terminal dashboard.

Spins never touch GitHub: a worktree spin creates a worktree and a branch, and stops there. Opening a PR is yours to do when the work is ready.

This package replaces the legacy `scripts/spin/*.mjs` + `scripts/spin-agent.mjs`. `pnpm spin` and every `just spin*` recipe route through it unchanged.

## Commands

```sh
pnpm spin <slug>                 # worktree spin: fresh worktree + branch + dedicated stack
pnpm spin <slug> --with-web      # also start the storefront (admin always starts)
pnpm spin <slug> --full          # start with observability + error tracking too
pnpm spin upgrade <slug>         # add observability to a running lite spin (keeps data + ports)
pnpm spin downgrade <slug>       # remove it again, back to lite
pnpm spin stop <slug>            # stop containers + host processes (volumes survive)
pnpm spin stop <slug> --purge --remove   # wipe volumes + drop the worktree/branch

just spin                        # in-place spin against the CURRENT checkout (slug = local)
just spin-upgrade                # promote the in-place spin to full
just spin-downgrade              # drop it back to lite
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
pnpm spin trust [--install]      # trust Caddy's local CA so https://*.calibra.localhost is green
just trust                       # the same thing, the short way (run once per machine)
```

Exit-code contract for agents: **0** ok, **2** down/scrape-failed (`doctor`/`status`/`metrics`/`alerts`), non-zero for command errors.

> For machine-readable output, use **`pnpm -s spin … --json`** (or the `just spin-*-json` recipes). Without `-s`, pnpm prints its run banner to stdout ahead of the JSON. Run from the package directly — `node packages/spin/dist/cli.js … --json` — is also clean.


## Profiles: lite (default) and full

A spin is **lite** unless you ask for more. Lite runs only what the product itself needs to serve a
request, so a bring-up is fast and a spin sitting idle in the background costs little:

| | lite (default) | full (`--full` / `spin upgrade`) |
| --- | --- | --- |
| Datastores | Postgres, Redis, Meilisearch | same |
| Mail + edge | Mailpit, Caddy | same |
| Browsers | pgAdmin, Adminer, RedisInsight | same |
| Observability | — | Prometheus, Grafana, Loki, Promtail, Tempo, Alertmanager, Uptime Kuma |
| Error tracking | — | GlitchTip (+ worker) |
| Containers | 9 | 18 |

Full roughly doubles the container count, and GlitchTip's health gate alone can hold a cold
bring-up for three minutes — which is the whole reason lite is the default. Reach for full when you
are actually working on dashboards, traces, alert rules, or error reporting.

Upgrading is in-place and non-destructive — the database, the seeded tenants and the allocated ports
all survive, because `upgrade` just flips the persisted profile and re-runs the (idempotent)
pipeline: the extra compose files come into scope, only the missing containers get created, and the
api restarts with its OTLP exporter switched on.

```sh
just spin              # lite, ~9 containers
just spin-upgrade      # → full, same data, same ports
just spin-downgrade    # → lite again, observability containers + volumes removed
```

The split is driven by `category: "observability"` in `src/core/catalog.ts`, so adding a service
there automatically keeps it out of lite spins — the compose file set, the Caddyfile routes, the
health gates, and the status/doctor output all read from the same table.

Metas written before profiles existed migrate to **full**, not lite: they were already running the
whole estate, and silently demoting them would strand those containers outside the compose file set
where nothing could clean them up. Run `spin downgrade` to move one to lite deliberately.

## Trusting the local CA

Caddy mints a root CA on first boot and the compose file mounts `~/.calibra/caddy-ca` into its `pki/authorities/local`, so **one root signs every spin on the host**. Trust it once and every current and future spin is covered; it also survives `spin stop --purge`, which only drops per-spin volumes.

```sh
just trust          # the whole thing
just trust-linux    # additionally add it to the Linux system store (sudo)
```

**On WSL the Windows store is the one that matters.** The stack runs in WSL but the browser is a Windows process reading the Windows certificate store, so trusting the CA inside WSL alone leaves Chrome and Edge at `ERR_CERT_AUTHORITY_INVALID`. `just trust` imports into `Cert:\CurrentUser\Root`, which needs no elevation, verifies the import by SHA-1 thumbprint, and no-ops when the cert is already there. Restart the browser afterwards — it caches the store.

Two details worth knowing if it ever misbehaves:

- Caddy writes the CA as root *inside the container*, so on the host it is `-rw------- root` and a plain read fails with `EACCES`. `trust` reads it back through a throwaway container that mounts the same directory, which is why it needs no `sudo`.
- `wslpath -w` yields a `\\wsl.localhost\…` UNC path that `certutil` frequently cannot read, so the cert is staged into the Windows `%TEMP%` before importing.

## Surfaces

- **CLI** — `commander`, with a `pnpm spin <slug>` → `start` bare-slug alias.
- **Web panel** — served at `https://<slug>.calibra.localhost` (the dashboard). React 19 is **bundled** into `dist/agent/client.js` (no CDN — works under sanctioned-cloud / offline networks). Shows the service grid, per-tenant shop cards, live SSE logs, and confirm-gated actions (restart / reseed / migrate). Bound to `127.0.0.1`.
- **TUI** — `pnpm spin term`, an Ink (k9s-style) dashboard: sandbox picker → services + tenants + live log pane; `r` restart, `l` logs, `o` open URL, `?` help.

All three render the **same** `buildSnapshot()` contract.

## Multi-tenant

A shop's admin/storefront is per-tenant. The canonical operator URL is the Caddy-TLS scheme:

```
https://aurora.admin.<slug>.calibra.localhost   (admin for shop "aurora")
https://aurora.web.<slug>.calibra.localhost     (storefront for shop "aurora")
https://console.<slug>.calibra.localhost        (platform control plane)
```

The bare `admin.<slug>` / `web.<slug>` apex is the platform "unknown shop" page by design. Seeded shops (`aurora`, `mehr`, `kasra`) get explicit Caddy blocks; ad-hoc tenants are issued on-demand certs (authorized by the panel's `/api/caddy/ask`). Run `just trust` once per machine so the local CA is trusted (untrusted TLS is the usual cause of "multi-tenant looks broken"). `doctor` probes each tenant host through Caddy, so a broken tenant route fails loudly.

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
