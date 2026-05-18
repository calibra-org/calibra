---
title: SVG Guidelines
impact: MEDIUM
tags: svg, icons, accessibility, rendering-performance
---

# SVG Guidelines

Apply this rule whenever SVG files or inline icon components are present.

## Key Rules

1. Accessibility semantics
- Decorative SVGs should be hidden from assistive tech (`aria-hidden="true"`).
- Informative SVGs should expose accessible labels (`role="img"` + `title`/`aria-label`).

2. Color and theming
- Prefer `currentColor` for icon fills/strokes unless fixed branding is required.
- Avoid hardcoded colors in reusable icon components.

3. Sizing consistency
- Normalize icon dimensions (`viewBox` + controllable width/height via props/classes).
- Avoid mixing px hardcoding with utility-class sizing.

4. Rendering performance
- Keep path precision reasonable (avoid excessive decimal precision).
- Remove unused groups/defs/metadata from exported SVGs.
- Prefer animating wrappers instead of raw SVG nodes for smoother composition when applicable.

5. Reusability
- Keep icon components pure and deterministic.
- Do not embed unrelated business logic in SVG wrappers.

## Common Findings to Flag

- Missing accessibility attributes
- Hardcoded fill/stroke values in shared icon components
- Bloated SVG markup from design exports
- Inconsistent sizing APIs across icon components

## Output Expectations

For each finding:
- `file:line`
- Accessibility or maintainability issue
- Specific remediation (attribute changes, optimization, or API normalization)
