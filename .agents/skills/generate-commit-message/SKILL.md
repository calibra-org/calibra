---
name: generate-commit-message
description: Generate git commit messages following Conventional Commits v1.0.0. Outputs plain copy-pasteable commit message text by default.
---

# Generate Commit Message

Generate commit messages following the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Message Structure

```
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

## Output Format

Plain text commit message in a code block with NO language tag.

The user should be able to copy the entire content directly. Do NOT include:
- `git commit -m` wrapper
- `EOF` or HEREDOC syntax
- `bash` language tag on the code block
- Extra commentary outside the code block

### Short Example

```
feat(demo): add input validation to form components
```

### Detailed Example (rare — only when the WHY isn't obvious from subject + diff)

```
fix(kit): move @floating-ui/* to dependencies

Promoting from `devDependencies` — the published dist imports these
packages from production source, so consumers need them resolved
transitively at install time.
```

### Breaking Change Example

```
feat(ui)!: replace positional args with options object in `createUser`

The `createUser` function now accepts a single `CreateUserOptions`
object instead of positional parameters. This aligns the API with
the rest of the SDK and enables future extensibility.

BREAKING CHANGE: `createUser(name, email)` is now `createUser({ name, email })`
```

## Types

Use the full set from [@commitlint/config-conventional](https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-conventional):

| Type | When to use |
|------|-------------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, semicolons (no logic change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or external dependencies (e.g. npm, turbo) |
| `ci` | CI configuration and scripts |
| `chore` | Maintenance tasks that don't fit other types |

### AI Agent Files (`docs` vs `chore`)

| File | Type | Reason |
|------|------|--------|
| `SKILL.md` content (rules, guidelines, references) | `docs` | Documents conventions and processes |
| `AGENTS.md`, `CLAUDE.md` | `chore` | Configures agent behavior |
| `skills-lock.json` | `chore` | Tooling lockfile |

When a commit mixes both (e.g. a new skill + lockfile update), prefer `chore`.

## Scopes

Derive the scope from the file paths in the staged diff:

| Path pattern | Scope |
|--------------|-------|
| `apps/<name>/*` | App name (e.g. `demo`) |
| `packages/<name>/*` | Package name (e.g. `ui`, `utils`) |
| Root config files only | Omit scope |
| Mixed across multiple apps/packages | Omit scope |

Examples: `feat(demo): add login page`, `fix(ui): correct button alignment`, `ci: add lint step to pipeline`

## Format: Short is the Default

**Default to subject-only.** Almost every commit should be one line. The subject already names the change, the scope locates it, and the diff shows WHAT — a body is extra weight that has to earn its place.

Add a body **only** when at least one of these is true:

- The **WHY is non-obvious** and cannot fit in the subject — a hidden constraint, a subtle invariant, a workaround for a specific upstream bug, a decision that would surprise a future reader
- A **breaking change** requires migration guidance
- A **non-obvious consequence** exists that a reviewer would otherwise miss (e.g. "this unblocks X", "requires follow-up Y")

Reasons that are **NOT** sufficient to add a body:
- The change touches multiple files (the diff shows that)
- The change is a "big" refactor (size doesn't imply explanation is needed)
- You want to enumerate what was done (that's the diff's job)
- You want to record verification steps or CLI output (belongs in the PR, not the commit)
- You want to list every file touched (belongs in the diff, not the commit)

### Body length cap

When a body **is** justified, keep it to **2–4 short lines**, wrapped at 72 chars. One tight paragraph. No bullet changelogs of files, no `Verification:` blocks with command output, no multi-paragraph essays. If you need more than 4 lines to explain WHY, the subject is probably wrong — sharpen the subject first.

Decide autonomously. Ask the user only if you're genuinely unsure a body is required.

## Workflow

1. Run `git diff --staged --stat` to see staged changes
2. If nothing is staged, ask the user to stage files
3. Analyze `git diff --staged`
4. Determine the correct type from the change
5. Derive scope from file paths
6. Check for breaking changes (see below)
7. Generate the commit message based only on staged changes
8. Output the plain commit message in a code block (no language tag)

## Commit Message Rules

1. **Subject line ≤72 chars** (includes type, scope, colon, and description)
2. **Lowercase description** after the colon: `feat: add validation` not `feat: Add validation`
3. **No period at end** of subject line
4. **Imperative mood**: "add feature" not "added feature" or "adds feature"
5. **Blank line** between subject and body (when a body exists)
6. **Body lines ≤72 chars**, wrap longer lines
7. **Body uses free-form paragraphs**, not bullet lists — and stays within 2–4 lines
8. **Backtick code identifiers**: wrap component names, hooks, props, functions, and other code references in backticks (e.g. `OrderForm`, `useContainerQuery`)

### Imperative Test

The description should complete: "If applied, this commit will [description]"

## Breaking Changes

Auto-detect breaking changes from the staged diff. Signals include:
- Removed or renamed public exports
- Changed function/method signatures (parameters added, removed, or reordered)
- Deleted or renamed props on public components
- Removed files that other packages import
- Major dependency version bumps that change behavior

When a breaking change is detected, use **both** the `!` shorthand and the `BREAKING CHANGE:` footer:

```
feat(ui)!: rename `size` prop to `variant` on `Button`

Update the `Button` component API to use `variant` instead of `size`
for better alignment with the design system token naming.

BREAKING CHANGE: the `size` prop on `Button` has been removed; use `variant` instead
```

The `!` ensures visibility in `git log --oneline`, and the footer provides the detailed migration note.

## Footers

Include footers when appropriate — the agent decides autonomously:

- `BREAKING CHANGE: <description>` — always pair with `!` in the subject
- `Refs: #<issue>` — when issue or ticket numbers are visible in branch name or diff context
- Other git-trailer-format footers as needed

## Context Detection

Infer context from file paths in the staged diff to pick the right type and scope:

- Test files (`*.test.*`, `*.spec.*`) → type `test`
- Documentation (`*.md`, `docs/*`) → type `docs`
- Config files (`.eslintrc`, `tsconfig.json`, `turbo.json`, etc.) → type `build` or `ci`
- Formatting-only changes (whitespace, semicolons) → type `style`

## Tips

- If the diff conforms to more than one type, suggest splitting into multiple commits
- Focus on WHAT and WHY, not HOW
- Bodies are rare. When you do add one, 2–4 lines max — never a changelog, never a verification log, never a file list
- If you catch yourself writing the words "Verification:", "Files changed:", or numbered step lists in the body — delete the body and sharpen the subject instead
