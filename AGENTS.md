# AGENTS.md

Single source of truth for AI coding agents (Codex, Claude Code, Cursor, Aider, …) working anywhere in this repository. Rules here are repo-wide. Rules that are only true inside one package or app live in that scope's own `AGENTS.md` and are loaded automatically when an agent works in that directory.

## Monorepo map

- `apps/web/` — Next.js 16 storefront (App Router, Tailwind v4, next-intl with English default + Persian RTL).
- `apps/cms/` — WordPress + WooCommerce + Polylang backend, run via Docker. Source of truth for products / orders / translated content.
- `packages/sdk/` — framework-agnostic TypeScript client for the WooCommerce Store API + REST API.
- `toolings/typescript/` — shared `tsconfig` presets.

Scope-specific contracts (read these before authoring inside the scope):

- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) — Next.js App Router conventions, `src/` layering, `#/*` alias, Tailwind-only styling, i18n + RTL.
- [`apps/cms/AGENTS.md`](apps/cms/AGENTS.md) — Docker compose layout, theme + MU-plugin invariants, wp-cli sidecar.
- [`packages/sdk/AGENTS.md`](packages/sdk/AGENTS.md) — framework-agnostic HTTP client, `BackendError` fallback chain, query-string null/undefined drop, header sanitization.

## Don't reinvent the wheel

Before generating code, search for existing solutions first. Rephrase the request as: "I am looking for code that does [requested functionality], is there existing code that can do this?" If existing code is close but doesn't fully meet the need, prefer extending it (a prop, a variant, a configuration) over reimplementing. Only generate new code when no suitable solution exists and extending is not feasible.

## Share duplicated patterns

When building features that duplicate logic or styling from elsewhere, extract the shared piece to a common location rather than copy-pasting. When uncertain, suggest the sharing opportunity before proceeding.

## Sub-agents: read-parallel, write-serial

Parallel sub-agents are **allowed** for codebase research, multi-file audits, and read-heavy analysis.

Parallel sub-agents are **forbidden** for writes that touch shared modules, shared types, or shared style files — sequential edits in the main thread only. Map-reduce writes across genuinely independent files are allowed.

## Dependencies

Never add a dependency to any workspace's `package.json` (`apps/web`, `apps/cms`, `packages/sdk`, `toolings/*`) without explicit user confirmation first — even when the dep is already in the pnpm catalog or already hoisted into `node_modules`. The user wants final say on every package's surface.

Once a dep is approved, install it via the pnpm catalog:

1. Edit `pnpm-workspace.yaml` → `catalogs.default` and add `"pkg-name": "x.y.z"` (match the style used by neighbours — exact pins for most, `^` ranges for the handful that use them).
2. In the consuming `package.json`, reference it as `"pkg-name": "catalog:"`.
3. Run `pnpm install` at the repo root.

Doesn't apply to removing deps, version bumps already discussed, or peer-dep metadata tweaks that don't change the published surface.

The `check-pnpm-add-catalog.sh` PreToolUse hook detects off-catalog `pnpm add` calls and prompts the developer for explicit approval (the AI cannot auto-confirm — a human has to acknowledge the override). Cancel and add the catalog entry first unless this is a deliberate one-off.

A second PreToolUse hook, `enforce-pnpm.sh`, blocks `npm install` / `npm i` / `npm add` (the commands that write a stray `package-lock.json` into this pnpm-managed repo). It is a hard block, not a prompt — swap the command to its pnpm equivalent (`pnpm install`, `pnpm --filter <pkg> add …`) and rerun. Other tools (`yarn`, `bun`, `npx`, unrelated `npm` subcommands) are unaffected.

## Commit messages

Follow Conventional Commits. Default every commit message to **subject-only**; a body must earn its place. See [`.agents/skills/generate-commit-message/SKILL.md`](.agents/skills/generate-commit-message/SKILL.md) for the full guide.

Add a body only when the WHY cannot fit in the subject (hidden constraint, subtle invariant, workaround for a specific bug), when a breaking change needs migration notes, or when a non-obvious consequence would otherwise be missed. Cap bodies at 2–4 short lines (or 1–3 bullets). Never include verification logs, CLI output, or full file lists — the diff shows that.

### Commit scopes match package names

Scopes must be one of the top-level package or app names — never a sub-route or feature folder:

- `apps/web` → `web`
- `apps/cms` → `cms`
- `packages/sdk` → `sdk`
- `.agents/` / `.claude/` (skills, hooks, settings) → `agents`

A change to `apps/web/src/views/cart/...` is still `web`, not `cart`. Confirm by running `git log --oneline -20` if in doubt.

## Pull requests

See [`.agents/skills/pr-creator/SKILL.md`](.agents/skills/pr-creator/SKILL.md) for title format, body sections, label application, and the `Type - Feature / Type - Fix / Type - Refactor` mapping.

## Code style (repo-wide)

- Never write inline `//` comments in code; use JSDoc (`/** … */`) blocks instead. See [`.agents/skills/polish-comments/SKILL.md`](.agents/skills/polish-comments/SKILL.md) for the full comment-style rules and the `comment-polisher` agent for automated polish.
- Don't write deeply-nested ternary chains. Two-level cascades (`a ? x : b ? y : z`) are fine inline. Three-level or deeper cascades go in a named helper with early-return `if`/`else` branches — the helper reads like a decision table and accepts new branches cleanly.
- Styling is **Tailwind v4 only**. No CSS-in-JS, no Stylex, no shadcn/Radix dependency, no class-variance-authority. Compose classes with the `cn()` helper (clsx + tailwind-merge).

Scope-specific style rules live in each scope's own `AGENTS.md`. Read those before authoring inside the scope.
