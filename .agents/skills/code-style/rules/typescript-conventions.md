---
title: TypeScript Conventions
impact: HIGH
tags: typescript, type-safety, interfaces, generics
---

# TypeScript Conventions

Apply this rule for `.ts` and `.tsx` files, especially where data models, props, and async flows are involved.

## Key Rules

1. Type safety first
- Do not use `any` without strict justification.
- Prefer `unknown` and explicit narrowing when input shape is uncertain.

2. Keep types explicit at boundaries
- Public functions, hooks, and component props should have clear types.
- API responses should be transformed from DTOs to domain models where applicable.

3. Model intent with TypeScript utilities
- Use `Pick`, `Omit`, `Partial`, discriminated unions, and mapped types when they simplify correctness.

4. Prefer object parameters for complex function signatures
- Replace long positional argument lists with typed parameter objects.

5. Avoid over-assertion
- Minimize unsafe `as` assertions.
- Prefer type guards and validation-based narrowing.

6. Keep React typing ergonomic
- Type component props explicitly.
- Type hook return values when inference is unclear.
- Avoid ambiguous union states without discriminators.

## High-Priority Findings

- `any` in core paths
- Unsafely asserted API payloads
- Missing prop or return type definitions at module boundaries
- Union states that allow impossible runtime branches

## Output Expectations

For each finding:
- `file:line`
- Type safety risk
- Concrete type-safe rewrite suggestion
