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

Each spin gets a stable 5-port block in the 13xxx range, derived from `sha256(slug)`. The mapping is deterministic — the same slug always lands on the same ports across reboots, so bookmarks stick. Collisions (two slugs hashing to the same block) trigger a nudge until a free slot is found, and the resolved ports are persisted in `.claude/worktrees/<slug>/.spin.json` so subsequent starts reuse them.

```
db        +0
pgadmin   +1
api       +2
admin     +3
web       +4
```

Isolation comes from `COMPOSE_PROJECT_NAME=calibra-spin-<slug>` — each spin gets its own docker network, its own volume, its own container names. Two spins running side by side never see each other's data.

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
