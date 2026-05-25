# `pnpm spin`

One-shot bootstrap for an isolated dev environment per task. Hands you a worktree on its own branch, its own Postgres + pgAdmin containers, its own API + admin ports, seeded data, and a draft PR. Idempotent — re-running with the same slug resumes from wherever the last run stopped.

Tracking issue: [#21](https://github.com/calibra-org/calibra/issues/21).

## Quick start

```sh
pnpm spin tags-workbench
# … 30–90 seconds later …
#
# ready
#   admin   http://localhost:13332
#   api     http://localhost:13331
#   pgadmin http://localhost:13333
#   pr      https://github.com/calibra-org/calibra/pull/N
#   login   admin@bulk.calibra.dev / Passw0rd1!
#   stop    pnpm spin stop tags-workbench
```

That's the entire workflow. Open the admin URL, log in, start coding inside `.claude/worktrees/tags-workbench/`.

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

Each spin gets a stable 10-port block in the 13xxx range, derived from `sha256(slug)`. The mapping is deterministic — the same slug always lands on the same ports across reboots, so bookmarks stick. Collisions (two slugs hashing to the same block) trigger a nudge until a free slot is found, and the resolved ports are persisted in `.claude/worktrees/<slug>/.spin.json` so subsequent starts reuse them.

```
db             +0
pgadmin        +1
api            +2
admin          +3
web            +4
mailpit SMTP   +5
mailpit web    +6
redis          +7
redisinsight   +8
adminer        +9
```

Isolation comes from `COMPOSE_PROJECT_NAME=calibra-spin-<slug>` — every container in the table above runs under that project name. Two spins running side by side get fully independent dev-ui state: separate Mailpit inboxes, separate Redis (no shared cache / pub-sub / queue), separate Adminer, separate volumes.

Spins created before this layout (no per-spin dev-ui ports in their meta file) keep talking to the legacy shared `calibra-dev-ui` containers on the original fixed ports (mailpit 18025, redis 16379, redisinsight 15540, adminer 18080). They migrate to per-spin layout on the next `pnpm spin stop <slug> && pnpm spin <slug>` cycle.

## State files

Everything lives under the worktree:

```
.claude/worktrees/<slug>/
  .spin.json              # ports, branch, PR number, APP_KEY, seeded flag
  .spin/
    api.pid               # background server PIDs (used by `stop`)
    admin.pid
    web.pid               # only when --with-web
    logs/
      api.log
      admin.log
      web.log
  apps/admin/.env.local   # generated, overwritten on every start
  apps/api/.env           # generated, overwritten on every start
```

Tail `.spin/logs/*.log` for live server output.

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
- No PR template — the draft body lists ports + seed creds + a placeholder `## Tasks` section, but it doesn't pull from `.github/PULL_REQUEST_TEMPLATE.md` (we don't have one).
- Slug name is also the branch name (`spin/<slug>`). Pick something descriptive.

See [#21](https://github.com/calibra-org/calibra/issues/21) for the broader design rationale and the items currently parked.
