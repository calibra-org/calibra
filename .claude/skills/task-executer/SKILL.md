---
name: task-executer
description: Execute a plan, todo list, or task list step by step with automatic verification and git commits after each step. Use when the user says "execute this plan", "implement these tasks", "run through this todo", "execute step by step", or provides a multi-step plan/checklist to implement. Also triggers on "task-executer", "/task-executer". Each step is implemented, verified (lint, format, typecheck), and committed individually with smart file grouping.
---

# Task Executer

Step-by-step plan executor with per-step verification and atomic commits.

## Input Detection

Accept plans from any of these sources:

1. **Markdown file** — user provides a path to a `.md` plan file. Read and parse steps from it.
2. **Inline prompt** — user pastes steps directly in the message. Parse numbered/bulleted items as steps.
3. **Todo system** — if tasks exist in the todo list, iterate through pending tasks in ID order.

If the input format is ambiguous, ask the user which steps to execute.

## Execution Loop

For each step:

### 1. Implement

Read the step description. Before writing new code, follow `AGENTS.md`:

- Search for existing code that already solves the problem.
- Prefer extending existing code over reimplementing.
- Extract shared patterns to a common location instead of duplicating.

Then implement the code changes described, using existing codebase patterns.

### 2. Verify

Run verification on **only the files changed in this step**:

```bash
# 1. Fix lint issues on changed files (call biome directly for file-scoped runs)
pnpm exec biome lint --write <file1> <file2> ...

# 2. Fix formatting on changed files
pnpm exec biome format --write <file1> <file2> ...

# 3. Type-check (project-wide, faster than build)
pnpm typecheck
```

**NEVER run `pnpm build` to verify changes.**

Always scope lint and format to the specific files changed in the current step. Only use `pnpm typecheck` (not `pnpm build`) for type-checking.

### 3. Handle Errors

If verification fails:

1. Attempt to auto-fix the errors (read error output, apply corrections).
2. Re-run the failing verification command.
3. If still failing after 2 auto-fix attempts, stop and ask the user how to proceed.

### 4. Stage

Use **smart grouping** — only `git add` files directly relevant to the current step. Do not stage unrelated changes.

Identify relevant files by tracking which files were created or modified during step implementation. Run `git diff --name-only` and filter to only files touched by this step.

### 5. Commit

Generate a commit message following Conventional Commits (see `generate-commit-message` skill for full rules):

1. Stage the relevant files with `git add <files>`.
2. Determine type, scope (from file paths), and description from the staged diff.
3. Commit with the generated message.

Auto-commit without asking — do not prompt for confirmation on each commit.

### 6. Next Step

Move to the next step. If using the todo system, mark the current task as `completed` and pick the next pending task.

## Safety Rules

- **NEVER run `git push`**. Do not push to remote under any circumstances.
- **NEVER run `pnpm build`**. Use `pnpm typecheck` instead.
- **NEVER amend previous commits**. Always create new commits.
- **NEVER use `git add .` or `git add -A`**. Always stage specific files.

## Completion

After all steps are done, output a summary table:

| Step | Files | Commit | Status |
|------|-------|--------|--------|
| 1. Short description | count | short hash | pass/fail |
| ... | ... | ... | ... |

If any step failed, note it clearly in the summary.
