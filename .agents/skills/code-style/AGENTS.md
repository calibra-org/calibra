# Headless Code Style Best Practices

Version 1.0.0

Portable React/Next.js TypeScript code-style guide for AI-assisted review. Self-contained with inline examples — no external codebase dependencies. This document is a compiled index over the `rules/` directory and is optimized for automated review workflows.

## Rule Sets

1. Clean code: `rules/clean-code.md`
2. Styling patterns: `rules/styling-patterns.md`
3. TypeScript conventions: `rules/typescript-conventions.md`
4. SVG guidelines: `rules/svg-guidelines.md`
5. Code quality: `rules/code-quality.md`

## Inline Good Code Examples

All canonical examples are embedded directly in:
- `references/inline-good-code-examples.md`

These examples demonstrate hook composition, type architecture, side-effect isolation, factory patterns, and barrel export hygiene.

## Auto-Selection Heuristics

Apply baseline rules to most frontend files:
- `rules/clean-code.md`
- `rules/code-quality.md`

Add conditional rule sets:
- TypeScript conventions when reviewing `.ts`/`.tsx` and typed APIs
- Styling patterns when reviewing UI classes, variants, and component styling
- SVG guidelines when reviewing SVG files or icon components

## Review Severity

- Critical: correctness, accessibility blockers, unsafe typing in core paths
- Important: maintainability and architectural consistency issues
- Suggestion: readability and style refinements

## Output Contract

For each finding include:
1. File and line reference
2. Problem summary
3. Concrete fix suggestion
