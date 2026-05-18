---
name: polish-comments
description: Produce React-style SDK/API JSDoc from valuable comments. Converts `//` to `/** */` and polishes existing JSDoc so each block reads like a public TypeScript declaration — contract-defining first sentence, structured tags only when locally evidenced, `@see {@link …}` for URLs, deprecation/warning semantics preserved. Refuses weak comments by leaving them unchanged and reporting them. Preserves lint/TS pragmas and `TODO/FIXME/HACK/NOTE/XXX` tags as `//`. Never edits code. Commits and pushes the touched files when the run produced changes; refuses on `main`/`master` and never opens or updates a PR. Use when asked to polish comments, convert to JSDoc, tidy comments before committing, or via `/polish-comments`. Paired with the `comment-polisher` Sonnet agent.
---

# Polish Comments

Comments are the product. Reads every comment, decides whether it earns its place as **React-style SDK/API documentation**, reshapes the keepers into JSDoc that would belong on a public TypeScript declaration file, and flags or preserves the rest. Never deletes facts. Never invents rationale. Never touches code. Commits and pushes the touched files at the end on a non-`main` branch — never opens or updates a PR.

The target output is the quality, density, and tone of React's own `.d.ts` comments — precise, neutral, durable language; first sentence defines the contract; every clause backed by local evidence.

## When to use

- Before opening a PR, on touched files.
- When a reviewer flags inline `//` that should be JSDoc.
- As a one-shot sweep over a folder or the whole codebase (opt-in scope).

Don't use for code edits, non-comment style decisions, or generated files.

## The bar

A comment is valuable only when it documents something the code, identifiers, or types do not already carry. Before rewriting any comment, every claim must answer "yes" to all eight:

1. Documents a public contract, invariant, lifecycle boundary, runtime behavior, edge case, rationale, warning, type relationship, or usage obligation.
2. Every claim is supported by local evidence — the original comment text, nearby code, names/types/signatures, called APIs, existing pragmas, ticket IDs / URLs, or `AGENTS.md`. **Never invent.**
3. Every added word is backed by original comment text or local code evidence — no embellishment.
4. Improves what would appear in editor hover docs over the bare symbol name and signature.
5. Would still be useful in generated API documentation.
6. Acceptable in a public SDK in tone and precision.
7. Still useful in six months.
8. More useful than removing the comment entirely.

If any answer is "no": don't rewrite. Either leave it (load-bearing pragma, TODO tag), preserve it as a low-value restatement (report it), or flag it as `needs human rationale`.

### The hover-doc test

Every converted or polished JSDoc must pass this test before it is committed to disk:

> If this comment appeared alone in VS Code's hover popup, would it explain the symbol's contract better than the symbol name, type, and signature already do?

If not, do not upgrade. Leave the comment as-is and record it under `Hover-doc failures left unchanged` in the report.

## React-style API tone

Comments must read as if they belong in a public SDK. Use precise, neutral, durable language.

**Avoid casual phrases**: "just", "stuff", "thing", "helper", "make sure", "handle this", "deal with", "kind of", "sort of".

**Prefer contract verbs** when they match the target:

- `Lets you …` — for hooks / functions a consumer calls.
- `Represents …`, `Describes …`, `A value which …` — for types / interfaces.
- `Used to …` — for fields / props with a purpose.
- `Accepts …`, `Returns …` — for function signatures.
- `Called when …`, `Fires when …`, `Runs before/after …` — for callbacks / lifecycle.
- `Created by …`, `Wraps …`, `Indicates …`, `Defines …` — for derived values, wrappers, flags, declarations.

These verbs are tools, not templates — pick the one that fits the symbol's contract; don't paste any of them mechanically.

## Contract-defining first sentence

The first sentence of every JSDoc block must be self-contained and useful in hover docs. It defines the contract; any further detail follows it.

| Symbol kind | First-sentence pattern |
|---|---|
| Type / interface | `Represents …`, `Describes …`, `A value which …` |
| Function / hook | `Lets you …`, `Returns …`, `Accepts …` |
| Property / field | `The …`, `A …`, `Used to …` |
| Lifecycle / callback | `Called when …`, `Fires when …`, `Runs before/after …` |
| Constant / enum member | `The … used …`, `Indicates …` |

Comments must explain what the symbol **means**, not restate its **spelling**:

- Bad: `/** The id prop. */ id: string;`
- Better: `/** Identifies which Profiler tree committed. */ id: string;`
- Bad: `/** Returns a string. */ function useId(): string;`
- Better: `/** Returns a stable unique ID that can be passed to accessibility attributes. */`

If only the spelling is restateable from local evidence, classify the comment as a **low-value restatement** and leave it.

## Structured JSDoc tags

For exported / public declarations, use structured tags **only when the original comment or surrounding code supports every claim the tag carries**:

| Tag | When to add |
|---|---|
| `@template T` | Generic parameter exists; description names its role |
| `@param name` | Parameter exists; description adds non-obvious meaning |
| `@returns` | Return value exists; describe what — not the type |
| `@throws` | Code visibly throws or awaits a throwing call |
| `@see {@link …}` | URL, doc reference, or related symbol present in source |
| `@example` | Original comment or nearby code already contains a usage pattern |
| `@deprecated` | Source comment says deprecated, removed, replaced, sunset |
| `@version` | Existing version reference present in source |
| `@default` | Default value visible in destructuring, signature, or comment |

Existing tags and their content are facts. Preserve them across reshapes — only adjust whitespace, wrapping, and code-fence form.

Never add a tag mechanically. Adding `@returns` to every function or `@param` to every parameter without earning the description is bloat.

## Examples are first-class

- Existing `@example` blocks must be preserved, including code-fence form.
- The skill may **create** an `@example` only when the original comment, surrounding code, or a nearby test already contains the usage pattern. Copy it verbatim — never invent values, flows, return shapes, or behavioral guarantees.
- Inside `@example`, keep the code fences (` ```tsx `, ` ```ts `).

## URL handling — `@see {@link …}`

Existing URLs become `@see {@link …}`. Existing references to docs, specs, issues, or RFCs remain. Never invent links.

If a URL is the entire comment:

```ts
// https://example.com/spec
```

becomes:

```ts
/**
 * @see {@link https://example.com/spec}
 */
```

When a title for the URL is already present in the source, render `@see {@link https://… Title}`. Never invent a title.

## Warning / deprecation semantics

If the source comment says deprecated, unsafe, ignored, internal, experimental, or contains a warning, **keep that semantic force**. Never soften.

Prefer React-style phrasing when reshaping:

- `@deprecated Use X instead.`
- `Warning: …`
- `For internal usage only.`
- `Only available in …`

The deprecated message — including the recommended replacement and any version reference — is a fact. Preserve it.

## React-style documentation shapes

Patterns for the four most common targets. Each pattern is a **shape**, not a template — only fill in slots backed by local evidence.

```ts
/**
 * Represents a value …
 *
 * @template T The type parameter — describe its role.
 */
interface Example<T> {}

/**
 * Lets you …
 *
 * @param value The …
 * @returns …
 *
 * @example
 *
 * ```tsx
 * const x = example("…");
 * ```
 */
function example(value: string): string;

/**
 * The …
 *
 * @see {@link https://… React Docs}
 */
property?: string;

/**
 * Called when …
 *
 * @param step The step selected by the orchestrator.
 */
onStepResolved?: (step: DepositStateName) => void;
```

The fourth example is illustrative — only produce that JSDoc when the surrounding code (the orchestrator's step resolution, the `DepositStateName` type, the firing site) supports every clause.

## Scope

Default: branch diff vs `main`, lines added or changed only.

```bash
git diff main...HEAD --name-only -- '*.ts' '*.tsx'
git diff main...HEAD -- <file>
```

Overrides, in order:

1. Path argument → that path only.
2. "Whole file" / "this folder" / "whole codebase" → expand as asked.
3. `--all` → every `.ts`/`.tsx` under `apps/`, `packages/`, `toolings/`.

Always exclude: `node_modules/`, `dist/`, `.next/`, `.turbo/`, `coverage/`, `*.gen.ts`, `*.generated.ts`, anything under a folder named `generated/`.

When more than 5 files are in scope, the orchestrator partitions into ≤5-file batches and calls `comment-polisher` subagents in parallel.

## Five buckets

Walk every comment in scope. Classify into exactly one bucket.

### 1. Skip — leave as `//`

| Pattern | Why |
|---|---|
| `// biome-ignore lint/...` | Biome only honors line-form pragmas |
| `// eslint-disable*` | ESLint pragma syntax |
| `// @ts-expect-error`, `// @ts-ignore`, `// @ts-nocheck` | TS escape hatches require `//` |
| `/// <reference ... />` | Triple-slash TS directive |
| `// TODO\|FIXME\|HACK\|NOTE\|XXX` (any case) | Greppable convention |
| `{/* ... */}` JSX comments | Not `//`; JSDoc doesn't fit |
| Shebang `#!/usr/bin/env ...` | Not a JSDoc-form comment |

A comment is a TODO-class tag if its first word after `//` matches `/^(TODO|FIXME|HACK|NOTE|XXX)\b/i`.

### 2. Convert — `//` → `/** */`

Eligible when the comment passes **the bar** and the **hover-doc test**.

| Source | Target |
|---|---|
| Single `//` above a declaration / statement | `/** ... */` block above the same target |
| Multi-line contiguous `//` run | One merged `/** ... */` block |
| `//` runs separated by a blank line | Two separate `/** */` blocks — never merge across blanks |
| Single-line non-JSDoc `/* ... */` | `/** ... */` |
| URL-only `// https://...` | `/** @see {@link https://...} */` |

Reshape the prose to React-style: contract-defining first sentence, supported tags, no embellishment.

Rewrites may **anchor to local evidence** — e.g. "called when promo happens" can become "Called when a promotion code is detected from URL parameters or launch payload" only if the surrounding code shows that. Added precision must come from the code, never from imagination.

### 3. Polish in place — existing `/** */`

- Force multi-line form (`/**\n * ...\n */`) even for single sentences.
- Apply React-style framing only where the original comment supports it.
- Light compression (below). Re-wrap to ≤ 130 chars.
- Keep `@param`, `@returns`, `@throws`, `@example`, `@see`, `@deprecated` and their content intact.
- Convert URL-only references inside the block to `@see {@link …}` form.

### 4. Low-value restatement — leave unchanged, report

A `//` comment that is true but merely restates the symbol's name, type, or signature. The bar fails on the hover-doc and API-docs tests; the skill **must not** delete it (deletion is forbidden) and **must not** upgrade it (the hover-doc test fails).

Leave the comment exactly as written. Record file path + line under `Low-value restatements preserved` in the report.

Examples — _without_ any anchoring detail in nearby code:

- `// id prop`
- `// returns a string`
- `// the click handler`
- `// renders the list`

If the surrounding code adds meaning the spelling does not (e.g. the `id` is a Profiler tree commit identifier, the click handler dispatches a redux action), it is no longer a restatement — it becomes eligible for conversion.

### 5. Needs human rationale — leave unchanged, report

A `//` comment that *attempts* a rationale but cannot be safely upgraded from local evidence — typically a **reject phrase** with no anchoring code. Leave the comment as written, list it in the final report.

**Reject phrases** signal the original author had no documentable claim. Convert only when surrounding code supports a real contract / lifecycle / rationale; otherwise flag.

- "increment counter" / "loop over items" — restating the next line of code (also Low-value restatement candidate)
- "helper for x" / "helper for params"
- "do this here" / "handle this" / "manage that"
- "weird workaround" / "weird thing"
- "just make sure" / "just ensure" / "just to be safe"
- "probably needed" / "might be needed"
- "temporary fix" with no ticket reference
- "call callback" / "fire callback"
- "set flag" / "toggle flag"
- "start once" — must say which phase
- "cleanup async stuff" — must name the cancellation / race concern

The list is a trigger to look harder, not a death sentence: when the code names the phase or the race, the upgrade is allowed.

When a comment could fall into both bucket 4 and bucket 5: pick the more **precise** category. Bucket 4 is for "the comment restates the code". Bucket 5 is for "the comment gestures at a reason but no evidence supports it".

## Compression vs paraphrase

Read this carefully — the skill polishes prose **and** preserves meaning, and the two are not in conflict once the boundary is named.

**Allowed (compression / API-doc framing):**

- Drop filler that adds no information.
- Adjust grammar, punctuation, line-wrapping.
- Re-shape prose into React-style (contract-defining first sentence, supported tags) when local evidence backs every claim.
- Convert a URL into `@see {@link …}`.
- Promote an inline rationale into a structured tag where the rationale fits the tag's meaning exactly.

**Forbidden (semantic paraphrase):**

- Changing **scope** (which case the comment applies to).
- Changing **certainty** ("must" → "should", "always" → "usually").
- Changing **timing** (when something fires / runs).
- Changing **actor** (who triggers it).
- Changing **condition** (under what circumstances).
- Changing **consequence** (what happens as a result).
- Reordering claims within a comment.
- Merging non-contiguous comment runs.
- Dropping a clause that names a fact, race, regression, ticket, URL, RFC, migration, or warning.

If a polish would change scope/certainty/timing/actor/condition/consequence — stop. The comment goes to bucket 4 or 5 instead.

### Light compression

**Drop**: hedge words ("basically", "just", "really", "actually", "simply"); self-reference ("this function", "this hook", "we"); signature restatement (`// Returns a string` on a `: string` function); throat-clearing prefixes ("Note that", "Keep in mind that"); trailing thanks / inline author tags.

**Keep verbatim**: facts, edge cases, regressions, race conditions, runtime/browser quirks, ticket numbers (`STR-123`), issue links, RFC refs, spec URLs, migration notes ("previously did X"), rationale ("because", "to avoid"), tradeoffs, warnings, deprecation messages.

## Formatting

- Force multi-line JSDoc blocks (`/**\n * …\n */`), even for one sentence.
- Wrap to ≤ 130 chars (matches `biome.json` + `AGENTS.md`).
- Preserve blank lines inside comments when they separate concepts.
- Keep code fences inside `@example` blocks intact.
- Order: one short summary paragraph, then a blank line, then tags / examples.
- Comments must be precise, not bloated. React's declaration comments are short — the polish target is the same.

## Hard guardrails

Absolute. Violating any one is a bug.

1. Never delete a fact or clause.
2. Never invent or infer content. Evidence rule is non-negotiable.
3. Never change code.
4. Never re-order claims within a comment.
5. Never merge non-contiguous `//` runs.
6. Never change types, imports, signatures, callback behavior, lint directives, or `@ts-*` pragmas.
7. Never soften a warning, deprecation, or `internal-only` notice.
8. Idempotent: a second run on the same files produces zero changes — including no new commit.
9. Never commit on `main` or `master`. Never `--no-verify`, never amend, never force-push.
10. Never open or update a PR. The skill never runs `gh pr create`, `gh pr edit`, `gh pr ready`, or any equivalent.

## Pipeline

```
1. Resolve scope          → filtered list of target files
2. Pre-grep skip          → drop files with no //, /*, or /**
3. Per-file: classify     → {skip | convert | polish | low-value-restatement | needs-human-rationale}
4. Per-file: rewrite      → one Edit per comment, exact-string replacement
5. Format                 → pnpm biome check --write <touched files>
6. Conditional typecheck  → pnpm typecheck (only if @-tags touched)
7. Commit and push        → see "Commit and push" below (skipped if no edits)
8. Report                 → see block below
9. Stop                   → hand back to user
```

Step 4 uses targeted `Edit` calls per comment — no AST parser. Preserve indentation exactly. `skip`, `low-value-restatement`, and `needs-human-rationale` are no-ops on disk; record file path + line for the report.

Step 6 only runs when JSDoc `@`-tags were added, removed, or modified. Plain prose JSDoc cannot break TypeScript; tag changes can.

Step 7 runs only when at least one file was edited on disk. A run that classifies every comment as `skip`, `low-value-restatement`, or `needs-human-rationale` produces no edits and therefore no commit.

## Commit and push

Runs after format and typecheck pass, before the final report. The skill commits only the files it touched and pushes them to the current branch's upstream. The PR-opening guardrail still holds — the skill never runs `gh pr create`, `gh pr edit`, or `gh pr ready`.

### Preconditions

The skill aborts the commit-and-push step (and surfaces the reason in the report) when any of the following is true:

- The branch is `main` or `master` — refuse, never auto-commit there.
- Format (`pnpm biome check --write`) reported errors that the write did not resolve.
- Typecheck (`pnpm typecheck`) reported errors (when it ran).
- `git diff --quiet` against HEAD on the touched files reports no changes — nothing to commit.
- `git status --porcelain` shows files outside the skill's touched-files list — refuse to mix unrelated edits into the commit.

### Steps

1. Check branch: `git rev-parse --abbrev-ref HEAD`. Refuse on `main` / `master`.
2. Stage only the files the skill touched: `git add <file> [<file> ...]`. Never `git add -A` / `git add .`.
3. Compose a Conventional Commits message:
   - Subject: `docs(comments): polish JSDoc on N file(s)` when the run was a mix of convert + polish.
   - Subject: `docs(comments): convert // to JSDoc on N file(s)` when the run was conversion-heavy (≥ 80% convert).
   - Subject: `docs(comments): polish JSDoc on N file(s)` is the safe default.
   - No body; the report carries the detail.
4. Commit: `git commit -m "<subject>"`. Never `--no-verify`. Never `--amend`.
5. Push:
   - If `git rev-parse --abbrev-ref --symbolic-full-name @{u}` succeeds → `git push`.
   - Otherwise → `git push -u origin HEAD`.
   - Never `--force` / `--force-with-lease`.

### What does **not** change

- The skill still never opens, edits, or marks-ready a PR.
- The skill still never edits code, only comments.
- The skill still produces the report — the commit hash and push result are appended to it, not substituted for it.

## Report

```
polish-comments report
======================
Scope: branch diff vs main (12 files)
Skipped (no comments): 3 files
Skipped (generated):    1 file (apps/demo/src/api.gen.ts)
Processed:              8 files

React-style API docs produced:     24
JSDoc polished in place:           11
Pragmas / TODOs preserved:         6 (left as //)
Low-value restatements preserved:  2 (left as //, see list)
Hover-doc failures left unchanged: 1 (left as //, see list)
Needs human rationale:             3 (left as //, see list)

Format check: pnpm biome check --write — clean
Typecheck:    skipped (no JSDoc tag changes)
Commit:       a1b2c3d  docs(comments): polish JSDoc on 8 file(s)
Push:         origin/feat/my-branch (up to date)

Files touched:
  packages/kit/src/foo.tsx
  packages/kit/src/bar.ts

Low-value restatements preserved:
  packages/kit/src/baz.ts:14   // the id prop

Hover-doc failures left unchanged:
  packages/kit/src/baz.ts:88   // returns a string

Needs human rationale:
  packages/kit/src/baz.ts:42   // weird workaround for lint
  packages/kit/src/qux.tsx:18  // start once

Hand-off: review the pushed commit, rewrite flagged comments by hand if you have the rationale.
```

Always include all four "preserved / unchanged / rationale" lines, even when the count is zero. The `Needs human rationale` line must always remain.

When the commit-and-push step is skipped (no edits, refused on `main`/`master`, format/typecheck failed, or a precondition refused the run), the `Commit:` and `Push:` lines name the reason instead of a hash — for example `Commit: skipped (no edits)`, `Commit: refused (current branch is main)`, or `Push: skipped (commit step did not run)`.

## Bash allowlist

The paired `comment-polisher` agent and this skill use only these:

- `git diff main...HEAD --name-only -- '*.ts' '*.tsx'`
- `git diff main...HEAD -- <file>`
- `git diff --quiet -- <files>` — to detect "nothing to commit"
- `git status --porcelain` — to detect unrelated edits before staging
- `git status -s`
- `git rev-parse --abbrev-ref HEAD` — to refuse `main`/`master`
- `git rev-parse --abbrev-ref --symbolic-full-name @{u}` — to detect missing upstream
- `git add <file> [<file> ...]` — only the skill's touched files
- `git commit -m <subject>` — never `--no-verify`, never `--amend`
- `git push`
- `git push -u origin HEAD` — only when no upstream exists
- `pnpm biome check --write <files>`
- `pnpm typecheck`

Any other Bash invocation is a bug. `git push --force` / `--force-with-lease`, `gh pr *`, and `git add -A` / `git add .` are explicitly out of scope.

## Examples

See [examples.md](./examples.md) for worked before/after cases — conversions, skips, JSDoc polish, evidence-driven upgrades, low-value restatements, URL → `@see`, deprecation preservation, and `needs human rationale` flags.
