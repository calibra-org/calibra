---
title: Code Quality and Best Practices
impact: HIGH
tags: quality, utilities, hooks, effects, readability
---

# Code Quality and Best Practices

## 1. Reuse Existing Utilities and Hooks First

Before creating custom hooks or adding packages, check your project's existing shared libraries and established community packages (e.g., `@react-hookz/web`).

Common utilities to look for before reinventing:
- Class merging: a `cn()` or `clsx()` utility
- Clipboard: `useCopyToClipboard()`
- Timers: `useIntervalEffect()` / `useTimeoutEffect()`
- Debounce/throttle: `useDebounce()` / `useThrottle()`

Flag custom implementations that duplicate established utilities.

## 2. Rethink `useEffect`

Avoid effects for:
- Data transformation used only for rendering
- Event handling that belongs in event callbacks
- State derivation from props/state that can be computed during render

Prefer render-time derivation or `useMemo` when expensive.

## 3. Variables and Constants

- Use meaningful names
- Replace magic numbers with named constants
- Use domain terms, not single-letter aliases except trivial local iterators

## 4. Function Design

- Prefer single-purpose functions
- Avoid flag-parameter branching APIs when separate functions are clearer
- Use typed object parameters for high-arity functions

## 5. Conditionals

For complex conditional trees, prefer `ts-pattern` over nested ternaries.

## 6. Comments and Documentation

- Use JSDoc for public API documentation and domain-critical fields
- Comment why, not what
- Do not leave commented-out code

## Review Output Severity

### Critical Issues (Must Fix)
- Type-safety regressions and dangerous runtime assumptions
- Severe maintainability issues in core paths

### Important Issues (Should Fix)
- Missing type contracts
- Hook misuse that increases complexity
- Repeated custom utilities where standard internal utilities exist

### Suggestions (Nice to Have)
- Minor naming improvements
- Readability and organization polish

For each issue provide:
1. File and line reference
2. The specific issue
3. Concrete fix recommendation
