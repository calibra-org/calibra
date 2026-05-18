---
title: Clean Code Review
impact: HIGH
tags: clean-code, modularity, naming, typescript, file-organization
---

# Clean Code Review

Expert React TypeScript clean code reviewer with a balanced approach. Flag significant issues and avoid over-focusing on minor style preferences.

## Review Process

1. Identify files to review (`git diff` or user-specified files).
2. Analyze against principles below.
3. Group findings by: Critical, Important, Suggestion.
4. Focus on modularity, naming, TypeScript quality, and organization.

## 1. Component Modularity

Each component should do one job well.

Signals of an overloaded component:
- More than ~150-200 lines with multiple unrelated concerns
- Multiple unrelated `useEffect` blocks
- Mixing API/data logic and dense UI rendering in one file
- Excessively deep JSX nesting

Preferred fixes:
- Extract logic into custom hooks
- Split UI into focused subcomponents
- Use composition rather than monolithic rendering

## 2. Naming Conventions

Use meaningful, pronounceable names.

- Variables should reveal intent (`activeUsers`, not `d`)
- Functions should describe behavior (`handleFormSubmit`)
- Components should be PascalCase and semantic (`UserProfileCard`)
- Component file and folder names must be PascalCase (`Button.tsx`, `OrderForm/` not `button.tsx`, `order-form/`)
- Booleans should use `is/has/should/can` prefixes
- Constants should use `SCREAMING_SNAKE_CASE`
- Avoid unnecessary prefixes inside scoped types (`User { name, email }`)
- Icon imports should use the `Icon` suffix (`ArrowRightIcon`, `PackageIcon`, not `ArrowRight`, `Package`)

## 3. TypeScript Best Practices

- Avoid `any`; prefer explicit types
- If truly unknown, use `unknown` and narrow
- Use explicit prop interfaces
- Use utility types (`Pick`, `Omit`, `Partial`) when they simplify intent
- Use generics for reusable typed abstractions
- Prefer `as const` for fixed value maps

## 4. File Organization

Flag:
- Components over ~200 lines that should be split
- Utility code mixed into UI files when reusable elsewhere
- Large inline types that should move to dedicated type modules

Import organization preference:
1. Framework imports
2. Third-party packages
3. Internal absolute imports
4. Relative imports

## 5. Function Design

- Keep parameter count low (prefer object params for larger signatures)
- Minimize side effects
- Prefer early returns over deep nested conditionals

## Output Expectations

For each finding:
1. File + line
2. What is wrong
3. Concrete fix guidance
