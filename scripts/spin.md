# `pnpm spin`

One-shot bootstrap for an isolated, **prod-parity** dev environment per task. Hands you a worktree on its own branch, its own Postgres + pgAdmin containers, its own API + admin ports, **its own observability stack (Grafana / Prometheus / Loki / Tempo / GlitchTip / Uptime Kuma)**, its own Caddy reverse-proxy with internal-CA TLS, its own Meilisearch instance, seeded data, and a draft PR. Idempotent — re-running with the same slug resumes from wherever the last run stopped.

Tracking issue: [#21](https://github.com/calibra-org/calibra/issues/21).

## Prerequisites (one-time)

The spin uses Caddy's internal CA so every service UI gets real TLS at `https://<service>.<slug>.spin.localhost`. Install Caddy once and trust its root cert system-wide:

```sh
# macOS
brew install caddy
sudo caddy trust

# Debian / Ubuntu
sudo apt install -y caddy
sudo caddy trust

# Arch / WSL2 Arch
sudo pacman -S caddy
sudo caddy trust
```

`caddy trust` requires `sudo` — the spin script never invokes it automatically (silent sudo prompts in a bootstrap are exactly the footgun we avoid). Without it browsers show "untrusted" pages; `curl --insecure` and the spin's doctor still work.

Docker Desktop / docker-engine and the `gh` CLI are the other dependencies — same as before this change.

## Quick start

```sh
pnpm spin tags-workbench
# … 60–120 seconds later (first boot of GlitchTip runs Django migrations) …
#
# ready
#   app
#     admin   https://admin.tags-workbench.spin.localhost  (host :13xx3)
#     api     https://api.tags-workbench.spin.localhost    (host :13xx2)
#   observability
#     grafana https://grafana.tags-workbench.spin.localhost  (anonymous editor)
#     errors  https://errors.tags-workbench.spin.localhost   (DSN pending — see setup blurb)
#     uptime  https://uptime.tags-workbench.spin.localhost
#     prom    https://prom.tags-workbench.spin.localhost
#     alerts  https://alerts.tags-workbench.spin.localhost
#   search
#     meili   https://search.tags-workbench.spin.localhost
#   data + dev
#     mail    https://mail.tags-workbench.spin.localhost
#     redis   https://redis.tags-workbench.spin.localhost
#     db      https://db.tags-workbench.spin.localhost
#     pgadmin http://localhost:13xx1
#   pr      https://github.com/calibra-org/calibra/pull/N
#   login   admin@bulk.calibra.dev / Passw0rd1!
#   stop    pnpm spin stop tags-workbench
```

That's the entire workflow. Open the admin URL, log in, start coding inside `.claude/worktrees/tags-workbench/`. The observability stack lights up automatically — by the time you hit a route, Grafana already has metrics, Loki already has logs, Tempo already has traces.

## Subcommands

| Command | What it does |
| --- | --- |
| `pnpm spin <slug>` | Shorthand for `pnpm spin start <slug>`. |
| `pnpm spin start <slug> [--with-web] [--no-pr]` | Bootstrap (or resume) a spin. `--with-web` also runs the storefront on the allocated web port. `--no-pr` skips the draft-PR step — call `pnpm spin pr <slug>` later. |
| `pnpm spin stop <slug> [--purge] [--remove] [--force]` | Stop the dev servers + containers. `--purge` also deletes the docker volume (wipes the seeded DB). `--remove` deletes the worktree dir + branch (refuses if there's uncommitted work; bypass with `--force`). |
| `pnpm spin list` | List every spin with status (running / partial / stopped) and ports. |
| `pnpm spin doctor <slug>` | Per-spin status: each port up/down, container project name, PR number. |
| `pnpm spin pr <slug>` | Open the draft PR for a spin that was started with `--no-pr`. |

## What gets allocated

Each spin gets a stable **20-port block** in the 13xxx range, derived from `sha256(slug)`. The mapping is deterministic — the same slug always lands on the same ports across reboots, so bookmarks stick. Collisions (two slugs hashing to the same block) trigger a nudge until a free slot is found, and the resolved ports are persisted in `.claude/spin/<slug>.json` so subsequent starts reuse them. 50 slots × 20 ports = the full 13000-13999 range.

```
db             +0    host-bound (postgres)
pgadmin        +1    host-bound
api            +2    host-bound (HMR runs on host)
admin          +3    host-bound
web            +4    host-bound
mailpit SMTP   +5    host-bound + caddy-fronted
mailpit web    +6    host-bound + caddy-fronted
redis          +7    host-bound + caddy-fronted
redisinsight   +8    host-bound + caddy-fronted
adminer        +9    host-bound + caddy-fronted
caddy HTTP     +10   host-bound (escape hatch — TLS is the main entry)
caddy HTTPS    +11   host-bound (main entry point for every service UI)
meilisearch    +12   host-bound (api on host indexes/searches here)
prometheus     +13   reserved offset; container-only, fronted by Caddy
grafana        +14   reserved offset; container-only, fronted by Caddy
loki           +15   reserved offset; container-only, fronted by Caddy
tempo          +16   host-bound (OTLP/HTTP receiver, 4318) — HTTP API caddy-fronted
alertmanager   +17   reserved offset; container-only, fronted by Caddy
glitchtip      +18   reserved offset; container-only, fronted by Caddy
uptime kuma    +19   reserved offset; container-only, fronted by Caddy
```

Isolation comes from `COMPOSE_PROJECT_NAME=calibra-spin-<slug>` — every container above runs under that project name. Two spins running side by side get fully independent state: separate Mailpit inboxes, separate Redis, separate Adminer, separate Grafana dashboards, separate Meilisearch indexes, separate volumes. Two spins also never collide on Caddy hostnames because the slug is in the hostname (`grafana.<slug>.spin.localhost`).

### Backwards-compat for older spins

Two layout breaks have shipped:

1. **Pre-per-spin dev-ui layout** (no `redis` / `mailpit` / `adminer` / `redisinsight` ports in the meta) — these spins fall back to the legacy shared `calibra-dev-ui` containers on the original fixed ports (mailpit 18025, redis 16379, redisinsight 15540, adminer 18080).
2. **Pre-prod-parity layout** (no `caddyHttps` / `meilisearch` / `prometheus` / `grafana` / `loki` / `tempo` / `alertmanager` / `glitchtip` / `uptimeKuma` ports in the meta) — these spins keep working without the observability stack. `pnpm spin doctor <slug>` reports those services as `n/a (legacy spin — re-spin to migrate)`. `pnpm spin start` skips the new compose files.

Both migrate on the next `pnpm spin stop <slug> --remove --force && pnpm spin <slug>` cycle. There's no in-place migration: the port-allocation deltas mean the meta has to be regenerated from scratch.

## Observability

Every spin ships with a full prod-parity observability stack. None of it requires configuration — by the time the handoff card prints, the dashboards already have data.

- **Grafana** (`grafana.<slug>.spin.localhost`) — anonymous editor login, no password. Starter dashboard "Calibra api — request overview" auto-loads with panels for request rate, latency (p50/p95/p99), error rate, recent error logs, and an active-spin tile. Add a new dashboard by committing JSON to `docker/observability/grafana/dashboards/` — clickops dashboards aren't reproducible.
- **GlitchTip** (`errors.<slug>.spin.localhost`) — Sentry-protocol error tracking. First boot prints a one-time setup blurb on the handoff card: register `spin@calibra.dev`, create org `spin` + project `api`, paste the DSN into `apps/api/.env` as `GLITCHTIP_DSN=…`, restart the api. After that every thrown exception ships here. Auto-DSN provisioning is on the roadmap.
- **Prometheus** (`prom.<slug>.spin.localhost`) — scrapes the api's `/metrics` endpoint every 15s. Metric names follow Prometheus conventions: `http_requests_total{method,route,status}`, `http_request_duration_seconds{method,route,status}` (histogram, standard buckets).
- **Loki** (`loki.<slug>.spin.localhost`) — log aggregation. The api logs ndjson to `<worktree>/.spin/logs/api.ndjson` (toggled by `DEV_OBSERVABILITY=true`); Promtail ships every line. Query via Grafana → Explore → Loki → `{service="calibra-api"}`. 7-day retention.
- **Tempo** (`tempo.<slug>.spin.localhost`) — distributed tracing. The api ships OTLP traces directly to the published port (4318); Grafana queries Tempo's HTTP API container-to-container. 7-day retention.
- **Alertmanager** (`alerts.<slug>.spin.localhost`) — no rules ship in this PR; the receiver is the no-op `null` route. Rule authoring + Telegram/email wireup lands in a follow-up.
- **Uptime Kuma** (`uptime.<slug>.spin.localhost`) — external prober. Configure probes against `/health/ready` via the UI; the config is per-spin and survives `stop` but not `stop --purge`.
- **Meilisearch** (`search.<slug>.spin.localhost`) — full-text + faceted search. The master key is generated per-spin and lives in `.claude/spin/<slug>.json`. The api reads `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` from its env. Indexing wireup lands in the follow-up PR.

### Direct-port escape hatches

In addition to the Caddy routes, the following ports are published directly to the host for `curl` / `redis-cli` / `psql` / HMR:

```
api          localhost:<api>
pgadmin      localhost:<pgadmin>
mailpit web  localhost:<mailpitWeb>
mailpit smtp localhost:<mailpitSmtp>
redis        localhost:<redis>
redisinsight localhost:<redisinsight>
adminer      localhost:<adminer>
caddy http   localhost:<caddyHttp>
caddy https  localhost:<caddyHttps>
meilisearch  localhost:<meilisearch>
tempo otlp   localhost:<tempo>     (4318 — OTLP/HTTP receiver only)
```

Other UIs (Grafana, GlitchTip, Prometheus, Loki, Alertmanager, Uptime Kuma) are intentionally Caddy-only — go through the hostname so what you exercise in dev matches what you'll hit in prod behind Cloudflare/Arvan.

### Browser cert warnings

After `caddy trust`, most browsers accept the certs immediately. If a browser still complains, wipe the site data for `*.spin.localhost` in browser settings — some browsers cache the prior rejection in HSTS / cert error state. Chrome: `chrome://net-internals/#hsts` → "Delete domain security policies" for `<slug>.spin.localhost`.

## State files

Everything lives under or alongside the worktree:

```
.claude/worktrees/<slug>/
  .spin/
    api.pid               # background server PIDs (used by `stop`)
    admin.pid
    queue.pid
    web.pid               # only when --with-web
    logs/
      api.log             # combined stdout/stderr (HMR + Pino pretty)
      api.ndjson          # ndjson tee for Promtail (DEV_OBSERVABILITY=true)
      admin.log
      queue.log
      web.log
    config/               # generated per spin, mounted into containers
      Caddyfile
      prometheus.yml
      promtail.yml
      grafana/provisioning/
    data/
      promtail/           # promtail's position file (scrape offsets)
  apps/admin/.env.local   # generated, overwritten on every start
  apps/api/.env           # generated, overwritten on every start

.claude/spin/<slug>.json  # ports, branch, PR number, APP_KEY, MEILI_MASTER_KEY,
                          # GLITCHTIP_SECRET_KEY, GLITCHTIP_DSN, seeded flag
```

Tail `.spin/logs/*.log` for live server output. Tail `.spin/logs/api.ndjson` and pipe to `jq` if you want machine-readable api logs (it's the same content Loki sees).

## Idempotency

Every step in `start` checks before doing work:

- Worktree exists? Skip.
- DB + pgAdmin ports already listening? Skip `docker compose up`.
- `node_modules/` present? Skip install.
- `packages/sdk/dist/` present? Skip SDK build.
- Seeded once? Skip seed.
- Server PID file points at a live process? Skip start.
- PR number recorded in meta? Skip `gh pr create`.

So a half-finished bootstrap (Ctrl-C, daemon crash, network blip) resumes cleanly on the next invocation. To force a full rebuild, run `pnpm spin stop <slug> --purge --remove` first.

## What this does not do (yet)

- No `web` autoboot by default. Pass `--with-web` if your task touches the storefront.
- No auto-cleanup when the PR merges. Run `pnpm spin stop <slug> --remove` manually.
- No PR template — the draft body is a one-line link to the spin dashboard (`https://<slug>.spin.localhost:<caddyHttps>/`) plus the teardown command. Per-service URLs, seed credentials, and live health pills live on the dashboard itself; replicating them into every PR body just added noise. Rewrite the body with the actual scope as your first non-bootstrap commit lands.
- Slug name is also the branch name (`spin/<slug>`). Pick something descriptive.

See [#21](https://github.com/calibra-org/calibra/issues/21) for the broader design rationale and the items currently parked.
