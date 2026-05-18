# AGENTS.md

Single source of truth for AI coding agents (Codex, Claude Code, Cursor, Aider, …) working anywhere in this repository. Rules here are repo-wide. Rules that are only true inside one package or app live in that scope's own `AGENTS.md` and are loaded automatically when an agent works in that directory.

This is **Calibra's commerce baseline** — the agency clones this repo as the starting point for each client's e-commerce build. Brand strings (`Site.name`, taglines, theme palette) are placeholders the agency fork-and-renames per client.

## Monorepo map

- `apps/web/` — Next.js 16 storefront (App Router, Tailwind v4, next-intl with Persian default + English RTL toggle).
- `apps/admin/` — Next.js 16 admin panel (App Router, Tailwind v4, next-intl with Persian default + English). Port 3001. Intentionally different design language from `web`.
- `apps/api/` — AdonisJS 6 backend (Lucid ORM on Postgres, VineJS validators, Japa tests, `@adonisjs/i18n`). Source of truth for products / orders / customers / auth. Run via Docker.
- `packages/sdk/` — framework-agnostic TypeScript client for `apps/api`. Used by both `web` and `admin`.
- `packages/shared/` — shared **utilities and types only** (cn helper, locale registry). **Not** UI components — the storefront and admin use different design languages by design.
- `toolings/typescript/` — shared `tsconfig` presets.

Scope-specific contracts (read these before authoring inside the scope):

- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) — Next.js App Router, `src/` layering, `#/*` alias, Tailwind-only styling, i18n + RTL, locale-forwarding API client.
- [`apps/admin/AGENTS.md`](apps/admin/AGENTS.md) — Next.js admin panel, dense design language, KPI tiles + data tables, locale switcher, locale-forwarding API client.
- [`apps/api/AGENTS.md`](apps/api/AGENTS.md) — AdonisJS layout, `#namespace/*` subpath imports, versioned routes, money in minor units, Accept-Language → i18n flow.
- [`packages/sdk/AGENTS.md`](packages/sdk/AGENTS.md) — framework-agnostic HTTP client, `BackendError` fallback chain, header sanitization, response envelopes (`Resource<T>` / `Paginated<T>`), locale forwarding.
- [`packages/shared/AGENTS.md`](packages/shared/AGENTS.md) — utilities only; no UI components.

## Don't reinvent the wheel

Before generating code, search for existing solutions first. Rephrase the request as: "I am looking for code that does [requested functionality], is there existing code that can do this?" If existing code is close but doesn't fully meet the need, prefer extending it (a prop, a variant, a configuration) over reimplementing. Only generate new code when no suitable solution exists and extending is not feasible.

## Share duplicated patterns — carefully

When **logic** or **types** duplicate across `apps/web` and `apps/admin`, extract them to `packages/shared` (or `packages/sdk` if API-shaped).

When **UI components** look similar across `web` and `admin`, **do not** extract — the two surfaces deliberately use different design languages. The storefront is warm + marketing-grade; the admin is dense + data-first. Sharing a `Button` would force both into the lowest common denominator. Each app keeps its own components even at the cost of duplication.

## Sub-agents: read-parallel, write-serial

Parallel sub-agents are **allowed** for codebase research, multi-file audits, and read-heavy analysis.

Parallel sub-agents are **forbidden** for writes that touch shared modules, shared types, or shared style files — sequential edits in the main thread only. Map-reduce writes across genuinely independent files are allowed.

## Dependencies

Never add a dependency to any workspace's `package.json` (`apps/web`, `apps/admin`, `apps/api`, `packages/sdk`, `packages/shared`, `toolings/*`) without explicit user confirmation first — even when the dep is already in the pnpm catalog or already hoisted into `node_modules`. The user wants final say on every package's surface.

Once a dep is approved, install it via the pnpm catalog:

1. Edit `pnpm-workspace.yaml` → `catalogs.default` and add `"pkg-name": "x.y.z"` (match the style used by neighbours — exact pins for most, `^` ranges for the handful that use them).
2. In the consuming `package.json`, reference it as `"pkg-name": "catalog:"`.
3. Run `pnpm install` at the repo root.

Exception: **AdonisJS app dependencies live directly in `apps/api/package.json` with explicit version pins**, not the catalog — they're consumed by only one app and Adonis pins move together. Add new Adonis-ecosystem deps inline there.

Doesn't apply to removing deps, version bumps already discussed, or peer-dep metadata tweaks that don't change the published surface.

The `check-pnpm-add-catalog.sh` PreToolUse hook detects off-catalog `pnpm add` calls and prompts the developer for explicit approval (the AI cannot auto-confirm — a human has to acknowledge the override). Cancel and add the catalog entry first unless this is a deliberate one-off.

A second PreToolUse hook, `enforce-pnpm.sh`, blocks `npm install` / `npm i` / `npm add` (the commands that write a stray `package-lock.json` into this pnpm-managed repo). It is a hard block, not a prompt — swap the command to its pnpm equivalent (`pnpm install`, `pnpm --filter <pkg> add …`) and rerun. Other tools (`yarn`, `bun`, `npx`, unrelated `npm` subcommands) are unaffected.

## i18n across the stack

- **Storefront + admin frontends** default to Persian (`fa`), with English as a secondary toggle. Locale list is shared via `@calibra/shared/i18n`; each app sets its own `defaultLocale` in its `routing.ts`. RTL flips automatically through `<html dir>` + Tailwind v4 logical utilities (`ms-*` / `me-*` / `text-start`).
- **API backend** (AdonisJS) reads the active locale from the `Accept-Language` request header (set by the SDK from `useLocale()`). Translation catalogs live in `apps/api/resources/lang/{en,fa}/messages.json`. Code, logs, and schema stay in English; only user-facing strings are translated.
- **The SDK** (`@calibra/sdk`) forwards the locale automatically when the consuming app passes `locale: useLocale()` to `createApiClient`. Server-side wrappers (`apps/web/src/lib/api.ts`, `apps/admin/src/lib/api.ts`) do this already — use them instead of constructing the client manually.

## Commit messages

Follow Conventional Commits. Default every commit message to **subject-only**; a body must earn its place. See [`.agents/skills/generate-commit-message/SKILL.md`](.agents/skills/generate-commit-message/SKILL.md) for the full guide.

Add a body only when the WHY cannot fit in the subject (hidden constraint, subtle invariant, workaround for a specific bug), when a breaking change needs migration notes, or when a non-obvious consequence would otherwise be missed. Cap bodies at 2–4 short lines (or 1–3 bullets). Never include verification logs, CLI output, or full file lists — the diff shows that.

### Commit scopes match package names

Scopes must be one of the top-level package or app names — never a sub-route or feature folder:

- `apps/web` → `web`
- `apps/admin` → `admin`
- `apps/api` → `api`
- `packages/sdk` → `sdk`
- `packages/shared` → `ui`
- `.agents/` / `.claude/` (skills, hooks, settings) → `agents`

A change to `apps/web/src/views/cart/...` is still `web`, not `cart`. Confirm by running `git log --oneline -20` if in doubt.

## Pull requests

See [`.agents/skills/pr-creator/SKILL.md`](.agents/skills/pr-creator/SKILL.md) for title format, body sections, label application, and the `Type - Feature / Type - Fix / Type - Refactor` mapping.

## Code style (repo-wide)

- Never write inline `//` comments in code; use JSDoc (`/** … */`) blocks instead. See [`.agents/skills/polish-comments/SKILL.md`](.agents/skills/polish-comments/SKILL.md) for the full comment-style rules and the `comment-polisher` agent for automated polish.
- Don't write deeply-nested ternary chains. Two-level cascades (`a ? x : b ? y : z`) are fine inline. Three-level or deeper cascades go in a named helper with early-return `if`/`else` branches — the helper reads like a decision table and accepts new branches cleanly.
- Frontend styling is **Tailwind v4** across both apps. No CSS-in-JS, no Stylex. Compose classes with `cn()` from `@calibra/shared`. `lucide-react` is allowed for icons.
- **Storefront (`apps/web`) stays pure Tailwind** — no shadcn, no Radix, no class-variance-authority. Components are written by hand.
- **Admin (`apps/admin`) uses shadcn/ui** (New York style) for primitives. Class-variance-authority + `@radix-ui/*` ship as a result. The admin and storefront are intentionally different design languages — this asymmetry is the rule, not a temporary state.

Scope-specific style rules live in each scope's own `AGENTS.md`. Read those before authoring inside the scope.
