---
name: headless-code-style
description: Portable React and Next.js TypeScript code-style reviewer that automatically selects applicable rule sets (clean code, styling patterns, TypeScript conventions, SVG guidelines, and code quality practices) based on changed files and task context. Self-contained with inline examples — no external project dependencies required.
metadata:
  version: "1.0.0"
---

# Headless Code Style

Use this skill when writing, reviewing, or refactoring React/Next.js frontend code where maintainability, naming clarity, and style consistency matter.

This is a **self-contained** skill — all reference examples are inlined. It can be used in any React/Next.js TypeScript project without access to a specific codebase.

## Auto Rule Selection Workflow

0. Load relevant inline examples first:
- Read `references/inline-good-code-examples.md`.
- Pick examples that match the reviewed domain and use them as style baselines.

1. Determine review scope:
- If user provided files, use those.
- Otherwise inspect `git diff --name-only` and focus on changed files.

2. Apply baseline rules to all frontend code:
- `rules/clean-code.md`
- `rules/code-quality.md`

3. Add specialized rules only when relevant signals are present:
- `rules/typescript-conventions.md` when files are `.ts`/`.tsx` or contain `interface`, `type`, `any`, `unknown`, `satisfies`, generics, or schema validation.
- `rules/styling-patterns.md` when files contain `className`, Tailwind classes, `cva`, `tv`, CSS modules, styled components, or visual component composition.
- `rules/svg-guidelines.md` when files are `.svg` or contain `<svg`, `path`, icon components, SVGR output, or SVG animation.

4. Prioritize findings by impact:
- `Critical`: safety, correctness, severe maintainability, unbounded `any`, broken SVG accessibility.
- `Important`: naming quality, modularity issues, missing typing, style architecture drift.
- `Suggestion`: polish, consistency, minor organization improvements.

5. Output only actionable findings with code references:
- Include file + line reference
- Explain the issue
- Provide concrete fix guidance

## Rule Files

- `rules/clean-code.md`
- `rules/styling-patterns.md`
- `rules/typescript-conventions.md`
- `rules/svg-guidelines.md`
- `rules/code-quality.md`

## Inline Good Code References

- `references/inline-good-code-examples.md`

## Output Format

Use this structure:

### Critical Issues (Must Fix)
- `file:line` — problem + concrete fix

### Important Issues (Should Fix)
- `file:line` — problem + concrete fix

### Suggestions (Nice to Have)
- `file:line` — improvement + concrete fix

If no issues are found, explicitly say so and mention any residual risk (for example: unreviewed files, no runtime validation, or lack of tests).
