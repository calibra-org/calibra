# `Checkbox`

Tier-2 boolean toggle. Wraps Base UI's `Checkbox.Root` + `Indicator`. Tri-state via the `indeterminate` prop (Base UI emits `data-[indeterminate]` → primitive applies the same primary fill as checked, with the indicator hidden by the consumer).

```tsx
<Checkbox checked={selected} onCheckedChange={setSelected} aria-label={t("selectAll")} />
```

Sizing is locked (`size-4`, `min-h-4 min-w-4`, `shrink-0`) so a flex parent can't squash the box to a sliver. `aria-invalid` is supported via the Base UI root.
