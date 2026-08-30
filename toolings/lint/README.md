# `@calibra/lint`

Custom oxlint rules that enforce the repo invariants [`AGENTS.md`](../../AGENTS.md) states in prose.

The rules are plain ESLint-compatible modules. oxlint loads them through the `jsPlugins` entry in [`.oxlintrc.json`](../../.oxlintrc.json); the same modules run under ESLint's `RuleTester` in `tests/`, so a rule can be unit-tested without booting a linter over the whole repo.

## Rules

| Rule | Enforces | Severity today |
|--- |--- |--- |
| `calibra/semantic-tokens` | No raw Tailwind palette utilities (`text-red-600`) outside `globals.css` — use semantic roles. | `error` in `apps/{admin,platform,web}/src` |
| `calibra/logical-utilities` | RTL-safe logical utilities (`ms-*`, `me-*`, `text-start`) over direction-locked ones. | `warn` |
| `calibra/icons-via-proxy` | Icons come from the `#/icons` proxy, never `lucide-react` directly. | `warn` — see below |
| `calibra/no-panel-kit-in-web` | `apps/web` never imports `@calibra/panel-kit`. | `error` in `apps/web/src` |
| `calibra/no-direct-sdk-imports` | SDK client factories are called only in an app's `lib/api.ts`. | `warn` |

Severities and per-directory scoping live in `.oxlintrc.json` `overrides`, not in the rules — a rule never inspects its own file path, which keeps it portable and keeps every exemption visible in one file.

`icons-via-proxy` stays at `warn` because ~145 call sites predate it; that was Biome's severity for the same rule too. Flip it to `error` once the sweep lands.

## Why these are rules and not review

Each one fails silently and late:

- A raw palette utility looks correct until the theme changes under it.
- A physical utility renders fine in English and mirrors wrongly in Persian — the default locale.
- A hand-built SDK client drops `Accept-Language`, so the API answers in the wrong language while the page around it looks right.

None of those throw. They ship.

## Adding a rule

1. Write `rules/<name>.js` exporting `{ meta, create }`. Report through `messageId`, never a raw string.
2. Register it in `index.js`.
3. Add `tests/<name>.test.js` with `valid` and `invalid` cases — cover the near-miss that should *not* fire, not just the hit.
4. Scope it in `.oxlintrc.json` `overrides` with an explicit severity.

```sh
pnpm --filter @calibra/lint test
```

Prefer `lib/match.js` for anything that scans class strings or import specifiers: `stringScanner` visits real string values (so a match inside a comment cannot fire) and `importScanner` covers static imports, re-exports, and dynamic `import()` in one pass.
