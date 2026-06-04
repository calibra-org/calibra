# `HelperTooltip`

Tier-3 composite. The "?" icon you see next to every WordPress form label, with three improvements: typed copy instead of `title` attribute, keyboard-reachable button trigger, and a Popover variant for "learn more" links.

```tsx
{/* Inline hint */}
<Label htmlFor="sku">
    SKU <HelperTooltip>Unique identifier used in inventory exports and POS lookups.</HelperTooltip>
</Label>

{/* Hint with learn-more link */}
<HelperTooltip learnMore={{ href: "/docs/sku", label: t("docs.learnMore") }}>
    SKU is required for products synced with POS systems.
</HelperTooltip>
```

Tier 3 — composes `Tooltip` + `Popover` + the `Info` icon from `#/icons`. Locale strings come from `useTranslations("Common")` for the trigger's `aria-label`.
