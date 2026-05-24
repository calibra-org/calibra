# Refactor prompt — CSV importer + exporter to Adonis 7 first-party primitives

> Paste this as the opening message in a fresh Claude Code session. The prompt assumes the agent has access to `/home/inf1nite-lo0p/keshavarz20-com/keshavarz20/.claude/worktrees/csv-product-importer/` (spin slug `csv-product-importer`, draft PR #29 on `spin/csv-product-importer`) and the Adonis v7 docs cache at `/home/inf1nite-lo0p/adonis-v7-docs/content/`.

---

================================================================
TASK — replace hand-rolled infrastructure in the importer + exporter
with AdonisJS 7 first-party primitives, in the SAME spin / branch / PR
================================================================

Context. PR #29 (`spin/csv-product-importer`, draft) ships the CSV
product importer + exporter. The shape is right but several pieces were
hand-rolled before the team checked Adonis 7's first-party surface. This
pass replaces those with the canonical Adonis APIs and removes the
custom code. **No user-visible feature change is in scope** — the
wizards must keep working exactly as they do today.

Same spin, same branch, same PR. Verify before starting:

    pnpm spin doctor csv-product-importer

If anything is down, run `pnpm spin start csv-product-importer`. After
each logical chunk: typecheck → lint → small commit → push. The draft PR
refreshes on each push.

----------------------------------------------------------------
READ FIRST (load-bearing — all paths inside the worktree unless noted)
----------------------------------------------------------------

Open these in this order and internalise what's there before editing:

1. The PR's own contract docs:
   - `apps/api/AGENTS.md` — controller / transformer / validator conventions
   - `apps/admin/AGENTS.md` — proxy + locale + UI conventions
   - `.check-api-docs-known-drift.json` — what's currently acknowledged drift

2. The files this refactor touches (every one is in scope):
   - `apps/api/app/services/product_import/event_bus.ts`
   - `apps/api/app/services/product_export/event_bus.ts`
   - `apps/api/app/services/product_import/storage.ts`
   - `apps/api/app/services/product_export/export_storage.ts`
   - `apps/api/app/services/product_export/export_signed_url.ts`
   - `apps/api/app/services/product_import/import_runner.ts`
   - `apps/api/app/services/product_export/export_runner.ts`
   - `apps/api/app/controllers/admin/catalog/product_imports_controller.ts`
   - `apps/api/app/controllers/admin/catalog/product_exports_controller.ts`
   - `apps/api/start/routes/admin_product_imports.ts`
   - `apps/api/start/routes/admin_product_exports.ts`
   - `apps/admin/src/lib/imports/api.ts` (`streamImport` may need to
     swap from raw EventSource to `@adonisjs/transmit-client`)
   - `apps/admin/src/lib/exports/api.ts` (same — `streamExport`)
   - `apps/admin/src/app/api/admin/[...path]/route.ts` (proxy may need
     to bypass Transmit's path because the client library hits the
     origin directly)

3. Adonis v7 first-party docs at `/home/inf1nite-lo0p/adonis-v7-docs/content/`:
   - `guides/digging_deeper/drive.md`              — file storage
   - `guides/digging_deeper/cache.md`              — typed cache
   - `guides/digging_deeper/queues.md`             — job queue
   - `guides/digging_deeper/server_sent_events.md` — `@adonisjs/transmit`
   - `guides/digging_deeper/mail.md`               — transactional email
   - `guides/digging_deeper/emitter.md`            — typed events
   - `guides/security/encryption.md`               — `encryption.verifier`
   - `guides/basics/response.md`                   — `response.download`
   - `guides/basics/file_uploads.md`               — `file.moveToDisk`
   - `guides/basics/url_builder.md`                — `signedUrlFor`

The dependency rules in `AGENTS.md` still apply: **every new package
needs explicit user approval before you touch a `package.json`.** The
items below mark which Adonis packages each step needs.

----------------------------------------------------------------
WHAT TO REPLACE — priority order
----------------------------------------------------------------

Do these in order. Stop at each numbered checkpoint, push, and verify
the wizard still works in the browser (manual smoke on the spin) before
moving to the next.

================================================================
1. Storage → `@adonisjs/drive`  (HIGH IMPACT / LOW EFFORT)
================================================================

What's there today:
  - `apps/api/app/services/product_import/storage.ts` and
    `apps/api/app/services/product_export/export_storage.ts` hand-roll
    `app.makePath("storage", "imports")` / `"exports"` and read/write
    via `node:fs/promises` (`writeFile`, `readFile`, `unlink`, `mkdir`,
    `stat`, plus `createWriteStream` / `createGzip` / `pipeline` for
    the runner).
  - Controllers call `storage.ts`'s helpers directly — `writeSnapshot`,
    `readSnapshot`, `errorReportPath`, `uploadedFilePath`,
    `exportFilePath`, `openExportWriter`, `gzipFile`, `removeImportFile`.
  - The importer uses `rename(file.tmpPath, finalPath)` instead of
    `file.moveToDisk(key)` (see `product_imports_controller.ts::upload`).
  - The exporter's download endpoint takes the raw FS path stored on
    the row and streams it via `response.stream(createReadStream(path))`.

What to do:
  - Get user approval to add `@adonisjs/drive` to `apps/api/package.json`.
  - Run `node ace configure @adonisjs/drive --services=fs` (local-only
    is fine — we have no S3 credentials in this repo).
  - Add two disks in `config/drive.ts`: `imports` and `exports`. Both
    rooted under `app.makePath("storage", "imports")` /
    `"exports"`. Both `visibility: "private"`.
  - Replace `storage.ts` and `export_storage.ts` with `drive.ts` modules
    that delegate to `drive.use("imports")` / `drive.use("exports")`.
    Keys are deterministic strings (`${importId}-upload.csv`,
    `${importId}-snapshot.json`, `${importId}-errors.csv`,
    `${exportId}-export.csv`, `${exportId}-export.csv.gz`).
  - Importer `upload` controller: replace
    `rename(file.tmpPath, finalPath)` with
    `await file.moveToDisk(`${row.id}-upload.csv`, "imports")`. Store
    the **key** (not the absolute path) on `row.filePath`.
  - Runner reads via `disk.getStream(key)` and pipes into `parseFile`
    (need a small adapter — `parseFile` currently takes a path; either
    extend it to accept a stream OR read into memory for small files).
  - Exporter `download` controller: replace
    `response.stream(createReadStream(row.filePath))` with the Drive
    equivalent — `response.stream(await disk.getStream(row.filePath))`
    OR — better — keep a thin shim that downloads via `response.stream`
    because Drive's `getUrl()` returns a public URL that defeats our
    signed-token model.
  - `removeExportFile` / `removeImportFile` → `disk.delete(key)`.
  - Gzip step: keep `createGzip` + `pipeline`, but write to Drive after
    via `disk.put(`${id}-export.csv.gz`, buffer)` — OR keep using the
    underlying filesystem disk's raw path for the compression step
    (Drive exposes it via `fsDisk.makePath(key)`).

Acceptance: import + export + download flow end-to-end in the browser,
file bytes identical to before, runtime `storage/` artifacts still
gitignored, Japa tests green.

Commit: `refactor(api): swap hand-rolled storage paths for @adonisjs/drive`

================================================================
2. Signed-URL → `encryption.verifier`  (HIGH IMPACT / LOW EFFORT)
================================================================

What's there today:
  - `apps/api/app/services/product_export/export_signed_url.ts` —
    custom HMAC-SHA256 with a nonce + timing-safe compare, plus DB-side
    hash storage (`product_exports.download_token_hash` +
    `download_expires_at`).
  - Controller calls `mintSignedUrl({ userId, exportId, expiresAt })`
    on /show and on runner complete, stores the hash, then
    `verifySignedUrl(...)` in the download endpoint.

What to do:
  - Replace `mintSignedUrl` / `verifySignedUrl` with
    `encryption.verifier.sign(payload, ttl, purpose)` /
    `encryption.verifier.unsign(token, purpose)`. Purpose binding:
    `"export_download"`.
  - **Keep** the `download_token_hash` column + the DB-side check.
    Storing a hash on the row means a leaked DB dump can't reuse old
    URLs — that's a security property the bare Adonis verifier doesn't
    provide. Store `sha256(token)` on the row at mint time, compare on
    verify. This is the one place where the hand-rolled design is
    intentionally tighter than the default Adonis pattern; preserve it.
  - Drop the `nonce` from our custom impl (the Adonis verifier embeds
    its own randomness).
  - `export_signed_url.ts` becomes a 30-line wrapper around
    `encryption.verifier` + the DB hash check. Delete the HMAC
    plumbing.

Acceptance: download still works; forged + expired tokens still 403/410;
Japa test "download with wrong token returns 403" still green.

Commit: `refactor(api): replace custom HMAC signed URLs with encryption.verifier (DB hash kept for leaked-dump defense)`

================================================================
3. SSE → `@adonisjs/transmit`  (HIGH IMPACT / MEDIUM EFFORT)
================================================================

What's there today:
  - Both controllers hand-roll the SSE handler with
    `ctx.response.response.write("event: …\ndata: …\n\n")` +
    `setInterval(... 15_000)` heartbeat + `request.request.on("close",
    ...)` cleanup. ~70 lines each, ~140 LOC total.
  - In-memory `event_bus.ts` modules (one for imports, one for exports)
    keep a `Map<number, EventEmitter>` keyed by job id, publish on
    runner chunk boundaries, terminal events drop the bus after 30s.
  - Frontend `streamImport` / `streamExport` in
    `apps/admin/src/lib/imports/api.ts` /
    `apps/admin/src/lib/exports/api.ts` wrap `new EventSource(...)`
    against the same-origin proxy.

What to do:
  - Get user approval to add `@adonisjs/transmit` (API side) and
    `@adonisjs/transmit-client` (admin side) to the catalog + the
    consuming `package.json`s.
  - Run `node ace add @adonisjs/transmit` on the API. Wire the
    `transmit.authorize` middleware so only the owner can subscribe to
    a given job's channel.
  - Replace `publishImportEvent({ type, importId, ... })` with
    `transmit.broadcast(`imports/${importId}`, event)`. Same for
    exports under `exports/${exportId}`. Delete both
    `event_bus.ts` files entirely.
  - Replace the controllers' `stream(ctx)` methods with the Transmit
    subscribe authorizer + a single line — `transmit.authorize<{
    importId: string }>("imports/:importId", (ctx, { importId }) => /*
    ownership check */)`.
  - Frontend: replace `streamImport` / `streamExport` with the
    `transmit-client` library:

        const subscription = transmit.subscription(`imports/${id}`)
        await subscription.create()
        subscription.onMessage((event) => { ... })

    Both libs keep the same call-site shape so the wizard components
    don't need to change beyond the import statement.
  - The same-origin proxy at `apps/admin/src/app/api/admin/[...path]/route.ts`
    must forward Transmit's subscribe handshake. Read
    `guides/digging_deeper/server_sent_events.md` carefully — Transmit
    has its own routes (`/__transmit/events`, `/__transmit/subscribe`)
    that need to be reachable from the browser. Either proxy them or
    point the client at the API origin directly (the bearer token is
    on the session cookie; Transmit's authorize callback validates).

Gotcha: the docs explicitly call out that gzip compression on
`text/event-stream` breaks streaming — make sure no compression
middleware is in front of the API.

Acceptance: live progress in Step 2/3 of each wizard still flows;
slow-chunk indicator still kicks in after 5s; cancel still terminates
the stream cleanly; background-mode badge still works.

Commit: `refactor(api,admin): swap hand-rolled SSE for @adonisjs/transmit`

================================================================
4. Cache for distinct-meta-keys + field catalog  (LOW EFFORT)
================================================================

What's there today:
  - `GET /api/v1/admin/products/distinct-meta-keys` runs a Postgres
    `jsonb_object_keys` query against the filtered product set every
    call. The wizard's meta-key multi-select calls it on every filter
    change.
  - `IMPORT_FIELDS` is a static const, no caching needed there.

What to do:
  - Get user approval to add `@adonisjs/cache`.
  - Run `node ace add @adonisjs/cache --providers=memory`.
  - Wrap the distinct-meta-keys handler with `cache.getOrSet({ key:
    `meta-keys:${hash(filters)}`, ttl: "60s", factory: ... })`.
  - Hash the filter envelope into the cache key (sorted JSON →
    SHA-256). Don't include `show_hidden` or `search` in the key — let
    those filter in-memory on the returned full set.

Acceptance: hitting the endpoint twice in a row returns the second call
in <5ms (verifiable via the spin's api log or a curl `-w "%{time_total}"`).

Commit: `feat(api): cache distinct-meta-keys per filter shape (60s)`

================================================================
5. Email for long exports + import failures  (LOW EFFORT)
================================================================

What's there today:
  - The brief originally called for "email when export > 60s OR
    fails". We deferred it because `@adonisjs/mail` wasn't installed.

What to do:
  - Get user approval to add `@adonisjs/mail --transports=smtp`.
  - Add SMTP env vars to `.env.example` (do NOT add a real password
    anywhere). The spin can leave SMTP_HOST=localhost and the test can
    use the in-memory transport.
  - Pattern the email content after Persian SaaS norms — no
    WordPress translations. Subject lines:
        - Export ready: "خروجی محصولات شما آماده شد"
        - Import done: "وارد کردن محصولات با موفقیت انجام شد"
        - Import failed: "وارد کردن با خطا متوقف شد"
  - In the runner, capture the `started_at` → on terminal event,
    compute duration. If `>60_000ms` OR status is `failed` /
    `completed_with_errors`, queue the email via `mail.sendLater(...)`.
  - Email body must include the signed download URL for export
    completions (mint a fresh `encryption.verifier.sign(...)` per email,
    24h TTL).
  - Add a feature flag env var `MAIL_NOTIFICATIONS_ENABLED=false` so
    the spin can opt out without an SMTP server.

Acceptance: with the flag on + a local SMTP catcher (mailpit), an
export that takes >60s yields one email in the catcher's inbox with a
working download link.

Commit: `feat(api): email operators when exports finish or imports fail`

================================================================
6. Move the runners under `@adonisjs/queue`  (OPTIONAL — defer if scope creeps)
================================================================

What's there today:
  - Controllers do `void runImport(...).catch(...)` /
    `void runExport(...).catch(...)`. Fire-and-forget. Restarting the
    api process loses any in-flight runs.

What to do:
  - **Only do this step if the team explicitly wants horizontal
    scaling.** Single-process Adonis with the current fire-and-forget
    works for moderate volumes; the cost of introducing a Redis-backed
    queue is operational (one more process to run, monitor, deploy).
  - Get user approval for `@adonisjs/queue` + Redis (the latter is a
    big infra ask).
  - Create `apps/api/app/jobs/run_import_job.ts` +
    `run_export_job.ts`. Each calls into the existing
    `runImport(...)` / `runExport(...)` so the business logic stays in
    one place.
  - Controllers switch from `void runImport(...).catch(...)` to
    `await RunImportJob.dispatch({ importId, locale })`.
  - Add `node ace queue:work` to the spin's docker compose / pm2
    config as a separate process.

Acceptance: kill the api mid-run and restart — the job resumes
automatically. Without that, this step doesn't earn its operational
cost; skip it.

Commit (if shipped): `feat(api): move import/export runners to @adonisjs/queue jobs`

================================================================
DO NOT REFACTOR (keep as-is)
================================================================

- `event_bus.ts` survives if Transmit isn't adopted (step 3 not done).
  The per-id `Map<number, EventEmitter>` is a deliberate namespace —
  the Adonis emitter is global and doesn't model "subscribe to one job"
  cleanly. Don't replace it with the bare Adonis emitter.
- `response.download()` vs `response.stream()` — we already use
  `response.stream()` after switching off the broken `return
  createReadStream(...)`. `download()` would add ETag support but
  signed-URL downloads have no benefit from browser caching (each
  download is one-shot, the URL expires). Keep `stream()`.
- The file upload validation pattern in
  `product_imports_controller.ts::upload` is already on the Adonis
  best-practice path (`request.file(...)` + `extnames` + size). Only
  swap `rename(...)` → `file.moveToDisk(...)` per step 1; leave the
  validation alone.

================================================================
NON-NEGOTIABLES (re-stated)
================================================================

- Same branch (`spin/csv-product-importer`), same PR (#29). Push often.
- Every new dep needs explicit user approval before editing any
  `package.json` — the `check-pnpm-add-catalog.sh` hook will block
  off-catalog adds, but ask first to be polite.
- Adonis deps go inline in `apps/api/package.json` with pinned versions
  (catalog exception per the repo's AGENTS.md).
- Frontend deps go via `pnpm-workspace.yaml` catalog.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` all green at every push.
- The CSV import + export wizards must keep working — manual smoke
  through `localhost:13738/products/import` and `/products/export` on
  the spin, with admin@bulk.calibra.dev / Passw0rd1!, after every step.

================================================================
SUGGESTED EXECUTION ORDER
================================================================

1. `pnpm spin doctor csv-product-importer` — confirm spin alive.
2. Read each Adonis doc listed above. Don't skim — the patterns matter.
3. Step 1 (Drive) — most invasive surface area, do it first while
   context on the storage files is fresh. One commit.
4. Step 2 (encryption.verifier) — small, focused. One commit.
5. Step 3 (Transmit) — biggest UX risk, do it after the small wins so
   you can validate the wizard flow end-to-end without other changes
   in flight. One commit per side (api / admin) is fine.
6. Step 4 (cache) — bolt-on, one commit.
7. Step 5 (mail) — bolt-on, one commit. Flag-gate.
8. Step 6 (queues) — **only if the team agrees to the Redis ops cost**.
9. Update the PR description with a "Refactor pass" section listing
   the replaced primitives and the operational requirements (SMTP for
   email, Redis if queues land).

Push commits often. End by re-running the manual smoke + the Japa
suite. The draft PR auto-refreshes at #29 with every push.
