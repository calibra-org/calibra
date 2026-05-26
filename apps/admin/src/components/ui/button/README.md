# `Button`

Tier-2 UI primitive. Canonical clickable affordance for the admin. **Every action that fires a callback or navigates uses this primitive** — no inline `<button>` tags in views.

## API

| Export | Purpose |
|---|---|
| `Button` (alias of `ButtonRoot`) | The 90% API: variant + tone + size + `isLoading` + `asChild`. |
| `ButtonRoot` | Identical to `Button` — exported for symmetry with other compound primitives. |
| `IconButton` | Square icon-only button with required `aria-label`. |
| `ToggleButton` | Binary on/off button with `pressed` / `onPressedChange`. |
| `buttonVariants` | Raw `tv()` slot — re-use to style something that needs to look like a button without being one. |

## Variants

| `variant` | `tone="default"` | `tone="success" / "warning" / "danger"` |
|---|---|---|
| `default` (filled) | brand primary fill | semantic tone fill |
| `secondary` (filled neutral) | secondary surface | (tone ignored — secondary is the only tone here) |
| `outline` | input-border outline | tone-coloured outline + tone text |
| `ghost` | transparent + hover accent | tone text + tone-tinted hover |
| `link` | primary-coloured underline | tone-coloured underline |
| `destructive` | shortcut for `default` + `danger` | (use `default` + `tone="danger"` instead) |

Sizes: `xs` (28px) / `sm` (32px) / `md` (36px, default) / `lg` (40px) / `icon` (36×36px square).

## Loading state

`isLoading` keeps the rendered width (children stay in the DOM but become `invisible`), overlays a centred `<Spinner />`, sets `aria-busy`, and disables pointer events. Use it for the button that triggers an async mutation — no parent loading shell needed.

```tsx
<Button variant="outline" tone="danger" isLoading={cancelOrder.isPending} onClick={() => cancelOrder.mutate(orderId)}>
    {t("orders.cancel")}
</Button>
```

## Accessibility

- Default `type="button"` — never accidentally submits a form. When `asChild` is true the rendered element controls its own `type`.
- `disabled` and `isLoading` both set the native `disabled` attribute, so keyboard activation + pointer events are blocked.
- `IconButton` requires `aria-label` at the type level — screen readers depend on it.
- `ToggleButton` sets `aria-pressed` and a `data-state="on" | "off"` attribute for downstream styling.

## Keyboard

| Key | Action |
|---|---|
| Space / Enter | Activate the button. |
| Tab | Move focus on / off (standard tab order). |
