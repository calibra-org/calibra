# `Badge`

Tier-2 status / label pill. The visual primitive for every short labelled state in the admin — status columns, tag chips, count badges, "new" markers, etc. Tier-4 wrappers (`OrderStatusBadge`, `CouponStatusBadge`, `TimelineEventBadge`) map domain enums to `tone` so the same visual reads consistently across resources.

## API

```tsx
<Badge>Default</Badge>
<Badge tone="success">Active</Badge>
<Badge variant="outline" tone="danger">Cancelled</Badge>
<Badge variant="secondary" tone="warning" dot>Pending</Badge>
<Badge asChild><Link href="/orders/123">#10042</Link></Badge>
```

| `variant` | `tone="default"` | `tone="info" / "success" / "warning" / "danger"` |
|---|---|---|
| `default` | brand primary fill | tone fill + tone foreground |
| `secondary` | secondary surface | tone-tinted surface (`tone/15`) + tone text |
| `outline` | input-bordered, foreground text | tone-tinted border + tone text |
| `destructive` | shortcut for `default` + `danger` | (prefer `default` + `tone="danger"`) |

`dot`: when `true`, prepends a 6px coloured dot — kept the same hue regardless of variant so tone reads on the dot, not the badge fill.

## Notes

- `asChild` via Radix Slot — wrap a `<Link>` or `<button>` while inheriting badge styling.
- Tones never spill into `secondary` foreground colour for `variant="secondary" tone="default"` — the variant alone defines the foreground.
- For inline non-status counts (e.g. "3 unread"), use `<Badge variant="secondary">3</Badge>`.
