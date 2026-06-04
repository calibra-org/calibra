# `Skeleton`

Tier-2 placeholder block. Use to occupy the visual space where async content will land — keeps card / dialog / sheet bodies from collapsing while the data arrives, and prevents layout shift on settle.

## API

```tsx
<Skeleton className="h-4 w-32" />                         {/* line-height block */}
<Skeleton className="h-32 w-full" animation="shimmer" />  {/* wide block with shimmer */}
<Skeleton className="h-9 w-24 rounded-md" />              {/* button-shaped placeholder */}
```

`animation`: `pulse` (default — soft `animate-pulse`) or `shimmer` (overlay gradient pass; better for wide blocks).

## Notes

- Renders an empty `<div>` — sizing is the caller's responsibility (pass width + height via utility classes).
- Honours `prefers-reduced-motion`: animation suppressed.
- Common composition: skeleton rows in a `<DataGrid.Skeleton />` body, skeleton card body in a `<Dialog isLoading>`, skeleton text lines in a `<Card isLoading>`.

## Adding `@keyframes shimmer`

The `shimmer` variant references a `@keyframes shimmer` rule. If it isn't already in `globals.css`, add:

```css
@keyframes shimmer { to { transform: translateX(100%); } }
```
