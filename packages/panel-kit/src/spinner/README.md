# `Spinner`

Tier-2 inline loading indicator. The single canonical "this thing is loading" affordance — used internally by `Button isLoading`, `Combobox` search, `Toast` loading, `Pagination` fetching, and any view-level loading state.

## API

```tsx
<Spinner />                       {/* size="md" — 16px */}
<Spinner size="xs" />             {/* 12px — for `xs` buttons */}
<Spinner size="lg" />             {/* 20px — for `lg` buttons or standalone */}
<Spinner size="xl" className="text-muted-foreground" />
```

Sizes: `xs` (12px) / `sm` (14px) / `md` (16px, default) / `lg` (20px) / `xl` (24px).

## Notes

- Renders the `Loader2` lucide icon (aliased as `Spinner` in `#/icons`) with `animate-spin`.
- Tagged `aria-hidden` — the loading semantics belong to the surrounding element (`aria-busy` on the button, `role="status"` on a live region, etc.).
- Honours `prefers-reduced-motion` via `motion-reduce:animate-none`.
