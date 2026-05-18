---
title: Styling Patterns
impact: MEDIUM-HIGH
tags: styling, tailwind, class-architecture, component-design
---

# Styling Patterns

Apply this rule when reviewing component styling architecture, Tailwind usage, and visual consistency.

## Key Rules

1. Reuse established styling primitives first
- Prefer existing design-system components and shared UI primitives over custom one-off styling.
- Reuse `cn()` utilities for class composition.

2. Keep class composition maintainable
- Avoid very long inline class strings when variants exist.
- Extract variants using `cva`/`tv` patterns for reusable components.
- Keep variant names semantic (`size`, `tone`, `intent`).
- Use `cn()` instead of template literals for dynamic or conditional classes.
- For conditional classes, use the object syntax: `cn("base", { "text-red": isError })` not ternaries inside template literals.
- For composing variables with static classes: `cn(variable, "static-class")` not `` `${variable} static-class` ``.

3. Avoid style leakage
- Avoid broad global CSS for component-specific behavior.
- Scope styles to component boundaries.

4. Keep responsive + state styles explicit
- Include hover/focus/disabled/active states intentionally.
- Prefer explicit responsive tokens over ad hoc overrides.

5. Avoid brittle inline styles
- Use inline style only when dynamic numeric values are genuinely required.
- Prefer class-based styling for theme consistency and easier refactors.

## Common Findings to Flag

- Repeated class groups that should be extracted
- Inconsistent spacing scale usage in adjacent components
- State styles missing for interactive UI
- Visual behavior duplicated across files instead of shared component variants

## Output Expectations

For each finding, include:
- `file:line`
- Why the current pattern is hard to maintain
- A concrete refactor path (extract variant, reuse shared component, or move styles)
