# `Popover`

Tier-2 floating popup primitive. Wraps Base UI's `Popover` parts (`Portal` + `Positioner` + `Popup`) with the admin's shared animation, colour tokens, and `collisionPadding` defaults.

## API

```tsx
<Popover>
    <PopoverTrigger asChild><Button variant="outline">{t("filters.more")}</Button></PopoverTrigger>
    <PopoverContent align="start" sideOffset={6}>
        <FilterPanel filters={filters} />
    </PopoverContent>
</Popover>
```

`PopoverContent` props:

| Prop | Default | Notes |
|---|---|---|
| `side` | `bottom` | One of `top` / `right` / `bottom` / `left`. RTL flips `right` / `left` automatically through Base UI. |
| `align` | `start` | One of `start` / `end` / `center`. |
| `sideOffset` | `6` | Pixels between the trigger and the popup. |
| `collisionPadding` | `8` | Pixels of viewport breathing room. Bump to 16+ when the trigger sits inside a Sheet. |

## Notes

- The popup is portaled — it lifts above any parent `overflow: hidden`.
- Animation matches `Dropdown` / `Select` / `HoverCard` (`scale-95` + opacity, 150ms cubic-out, `motion-reduce` aware).
- For modal "this dialog blocks the page" semantics use `Dialog`, not `Popover`. **For Calendar pickers always use `Dialog`** (see `DESIGN_SYSTEM.md` §3.8 — Calendar-in-Dialog only).
