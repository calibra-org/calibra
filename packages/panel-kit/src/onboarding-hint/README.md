# `OnboardingHint`

Tier-3 dismissable hint banner. Two variants:

- `inline` (default) — compact muted strip with an icon + title + description, dismiss `X` on the inline-end.
- `card` — hero card with primary CTA + larger icon.

Dismissal persists via localStorage under `calibra.hints.<id>`. Once dismissed the component renders nothing. Use `resetHint(id)` from this module to imperatively un-dismiss (admin "show hints again" toggle).

```tsx
<OnboardingHint
    id="orders-bulk-select-intro"
    icon={Sparkles}
    title={t("hints.bulkSelect.title")}
    description={t("hints.bulkSelect.body")}
    cta={{ label: t("hints.bulkSelect.cta"), onClick: openTutorial }}
/>
```

Icons go through `#/icons` (the `LucideIcon` type re-exports from there).
