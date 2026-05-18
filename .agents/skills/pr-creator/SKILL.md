---
name: pr-creator
description:
  Use when creating a pull request. Drafts a dual-audience PR body — a
  PM-readable Summary/Why for product context and an Implementation section
  for engineers — and applies the correct GitHub label
  (`Type - Feature` / `Type - Fix` / `Type - Refactor`) based on the change.
---

# Pull Request Creator

Creates high-quality PRs with a **dual-audience body** (PM-readable on top,
dev-readable below) and the correct GitHub label.

## Workflow

1.  **Branch safety**. **CRITICAL:** never work on `main`.
    - Run `git branch --show-current`.
    - If on `main`, create a descriptive branch first:
      ```bash
      git checkout -b <new-branch-name>
      ```

2.  **Commit changes**. Verify everything intended is committed.
    - Run `git status`. Stage and commit any leftover changes with a
      descriptive message. NEVER commit to `main`.

3.  **Draft the body** following the [Body Contract](#body-contract) below.

4.  **Preflight check**. Run the workspace preflight before creating the PR:
    ```bash
    npm run preflight
    ```
    Fix any failures before continuing.

5.  **Push branch**. **CRITICAL:** double-check the branch is not `main`.
    ```bash
    git branch --show-current   # must NOT be main
    git push -u origin HEAD
    ```

6.  **Pick a label** following the [Labeling](#labeling) rules below. The
    chosen label (or "none") gets passed to `gh pr create` in the next step.
    Print the decision to the user before running it.

7.  **Create the PR**. Write the body to a temp file to avoid shell-escaping
    Markdown, then create the PR:
    ```bash
    # 1. Write drafted body to a temp file
    # 2. Create the PR (omit --label if no label applies)
    gh pr create \
      --title "type(scope): succinct description" \
      --body-file <temp_file_path> \
      --label "<chosen label>"
    # 3. Remove the temp file
    rm <temp_file_path>
    ```

## Body Contract

The PR body uses these sections, in this order. The two halves serve two
audiences: the **top half is read by PMs and stakeholders**, the **bottom
half is read by reviewers and future engineers**.

```
## Summary          (PM voice, required)
## Why              (PM voice, required)
## Preview          (conditional — visible UI changes only)
## Implementation   (dev voice, required unless trivial)
## Verification     (conditional — evidence only)
```

### Top half — `## Summary` and `## Why` (PM voice)

Together these two sections must read coherently to a non-technical PM.
A reader who doesn't know the codebase should learn **what shipped**, **what
changed for the user**, and **what problem it addresses** — without bouncing
off jargon.

**DO**
- Lead `## Summary` with the user-visible outcome ("Fixes broken social
  previews," "Adds a swap effect to the amount-entry hero").
- Name the affected surface in product terms ("the demo site," "the wallet
  sidebar disconnected state," "the dialog primitive").
- Use `## Why` for the problem or trigger in plain language. One paragraph,
  not a wall of context.
- Keep the two sections together to ≤ 4 sentences.

**DON'T**
- No env-var names, function names, type names, file paths, or package
  names in prose.
- No code blocks. (Code blocks belong in `## Implementation`.)
- No backticked identifiers. Naming a *product surface* without backticks
  is fine ("the dialog primitive"); `` `setMetadataBase` `` is not.
- No internal jargon without a one-word gloss ("OG cards" → "social-media
  link previews").

**Trivial-PR escape hatch.** For changes that are **single-file**,
**single-purpose**, and **mechanical** (typo fix, dep bump, import-only
refactor), `## Summary` may be terse and technical and `## Why` may be
omitted. The dual-audience rule applies to everything else.

### Bottom half — `## Implementation` (dev voice)

Required for any non-trivial PR. Answers three reviewer questions, in
order:

1. **What's the mechanism?** One paragraph: how does the change work?
2. **What's non-obvious?** Bullets for design decisions a reviewer would
   otherwise have to reverse-engineer from the diff: rejected alternatives,
   edge cases handled, intentional non-handling, breaking-change boundaries.
3. **Where do I look first?** Optional. Pointer to the 1–2 entry-point
   files when the diff spans many files.

**Hard rules**

- **No commit-by-commit recap.** GitHub already shows commits.
- **No file-by-file walkthrough.** The diff shows files. Mention a file
  only when its role is non-obvious.
- **Backticks for identifiers** — functions, types, env vars, package
  names, file paths. This is the section where backticks signal "you've
  crossed into the dev half."
- **Code blocks are for behavior, not source diffs** — show a curl
  response, a config snippet, or a before/after of rendered output;
  reviewers click "Files changed" for the diff itself.
- **Length cap: ≤ ~200 words for typical PRs.** If you need more, the PR
  is probably too big and should be split.

### `## Preview`

Include when the change has visible UI impact. Drop in a screenshot or
short GIF. No section header copy needed beyond the image.

### `## Verification`

Include ONLY when you have external evidence a reviewer can't get from CI:
curl output, before/after rendered HTML, screenshots of a fixed bug, a
reproduced-then-cleared error message.

Do **NOT** include preflight commands you ran (`pnpm typecheck`,
`pnpm lint`, `pnpm test`, `pnpm build`) — those run in CI and are noise in
the body. If you have nothing concrete to show, omit the section.

### Body-wide rules (apply to every section)

- **No manual Linear links.** Do NOT add `Fixes STR-XXX`, `Refs STR-XXX`,
  or any Linear issue link in the title or body. The Linear↔GitHub
  integration auto-attaches the PR to the matching ticket by parsing the
  branch name (`str-577-...` → `STR-577`). Manual links cause
  double-counting in Linear's PR widgets.
- **No private/local references.** Do NOT reference paths or resources
  that are gitignored or local-only (`opensrc/`, vendored upstream
  sources, scratch folders). Reviewers won't have access. Rephrase
  generically ("reviewed against the live Base UI source").
- **No cross-repo comparisons or benchmarks.** Keep the description
  scoped to this repository's changes. Generic ecosystem references that
  explain intent are fine ("matches the upstream Base UI Dialog
  behavior") as long as they don't link to local-only paths.

## Title

Use Conventional Commits format: `type(scope): description`. Keep titles
short and high-level — describe the overall goal, not the implementation.

- **All prose in the title is lowercase — including inside backticks.**
  Component and primitive names written in backticks are lowercased even
  when the underlying file/class is PascalCase: write `` `codeblock` ``,
  `` `select` ``, `` `dialog` ``, `` `button` ``, not `` `CodeBlock` ``.
  This applies to the verb after the colon and every prose word after it.
  Brand / tech / framework names used as prose (e.g. `shiki`, `stylex`,
  `react`, `next.js`) are also lowercased.
- **Narrow exceptions that keep original casing inside backticks:**
  scoped npm packages (`` `@stridgelabs/sdk` ``) and JSX-shape refs
  whose capitalization is required by the syntax itself
  (`` `<Button />` ``).
- No period at the end.
- Aim for ≤72 characters total.
- **Backtick code-like identifiers** in the title: route paths, package
  names, file names, component names, and other code references go in
  backticks. Plain prose terms (e.g. "deposit token system") do not.
- **Match the repo's existing PR title style**: before drafting the
  title, run `gh pr list --state all --limit 25` and skim the recent
  merged titles. Your title should sit naturally next to them in tone,
  length, and shape.
- Good: `feat(demo): setup demo project`
- Good: `feat(sdk): setup \`@stridgelabs/sdk\` package`
- Good: `feat(demo): add \`/playground\` page with responsive shell`
- Good: `feat(kit): add \`dialog\` primitive parts and modal behaviors`
- Bad: `feat(demo): set up shadcn/ui component playground with Button and theme`
  (too long, leaks implementation details)
- Bad: `feat(demo): add /playground page` (route path not backticked)
- Bad: `feat(demo): Add playground page` (capital after colon)
- Bad: `feat(demo): add Shiki-powered \`CodeBlock\``
  (brand name and component should be lowercase →
  `shiki-powered \`codeblock\``)

## Labeling

The repo has exactly three labels. Pick the **single** label that best
matches the change:

- **`Type - Feature`** — adds new behavior or surface area. The "user"
  can be a product end-user (a new `dialog` primitive in `@stridge/kit`)
  **or** an engineer using internal tooling (a new agent skill, a new
  capability added to an existing skill, a new CLI command). Capability
  additions count, regardless of the file kind.
- **`Type - Fix`** — corrects broken behavior.
- **`Type - Refactor`** — restructures code without behavior change
  (includes performance work that's structurally invisible).

**Title prefix and label are separate decisions.** The title prefix
describes the *file kind* changed (`docs(agents)` for `.agents/` files,
`feat(kit)` for kit code, etc.); the label describes the *impact* of the
change. A `docs(agents)` PR that adds new agent capability is still a
`Type - Feature`.

If the change is ambiguous, mixed, or genuinely has no behavior impact
(dep bumps, typo fixes, formatting-only edits, CI config tweaks,
test-only changes), **leave it unlabeled** — forcing a wrong label
pollutes the team's triage views.

Pass the chosen label to `gh pr create` via `--label "<label>"`. Omit the
flag when no label applies. Print the decision to the user before
running.

## Worked example

A `fix` PR for the demo app's broken social-media previews:

````markdown
## Summary

Fixes broken social-media link previews for the demo site. Sharing
`demo.stridge.com` on Twitter, Slack, Discord, or LinkedIn was rendering
as a blank link instead of the preview card we designed. After this PR,
previews work everywhere.

## Why

Social-media scrapers (Twitter, Slack, Discord, LinkedIn, iMessage)
cannot authenticate against Vercel's deployment protection. The
production HTML was emitting per-deploy preview URLs that scrapers got
401s on instead of the image — so every share looked broken.

## Implementation

Resolves `metadataBase` by checking `NEXT_PUBLIC_SITE_URL` first, then
falling back to the hardcoded production constant
(`https://demo.stridge.com`). The `VERCEL_URL` fallback is removed
because it always points at the protection-walled per-deploy URL.

- `NEXT_PUBLIC_SITE_URL` is preserved as an explicit override so preview
  environments that need a different host can still set it.
- The hardcoded constant matches the public domain, not a Vercel project
  alias — it's stable across deploys.

## Verification

After merging, fetching `https://demo.stridge.com/` shows:

```html
<meta property="og:image" content="https://demo.stridge.com/opengraph-image?…"/>
```

…which `curl -I` returns `200` publicly.
````

Label: `Type - Fix`.

Notice the contract:
- `## Summary` and `## Why` together are 4 sentences, no backticked
  identifiers, no env-var names, no code blocks. A PM can read them.
- `## Implementation` answers mechanism → non-obvious → (no "where to
  look" needed for a small PR), uses backticks freely, references the
  rejected alternative (`VERCEL_URL`).
- `## Verification` shows the *evidence* (rendered HTML, status code),
  not a checklist of preflight commands.

## Principles

- **Safety first.** Never push to `main`. Highest priority.
- **Two audiences, one body.** PM voice on top, dev voice below — the
  reader switches halfway down the page, on purpose.
- **Evidence over ceremony.** Verification shows artifacts, not
  command-line history. Implementation shows decisions, not file lists.
- **Accuracy.** Don't claim things you didn't do.
