# `Switch`

Tier-2 binary on/off switch. Wraps Base UI's `Switch.Root` + `Thumb`.

```tsx
<Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("notifications.enable")} />
```

RTL-aware: the thumb translates 4 units to the inline-end edge — `rtl:data-[checked]:-translate-x-4` swaps direction so the thumb always lands on the inline-end side regardless of writing direction.

For the "settle-then-persist" mutation pattern (write only after the operator stops fiddling), pair with `useSettleMutation` from `#/lib/queries/use-settle-mutation`.
