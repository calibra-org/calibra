# `Label`

Tier-2 form label. Always paired with a control via `htmlFor` — `peer-disabled` flips the label to disabled styling when the paired control is `disabled`.

```tsx
<Label htmlFor="sku" required>SKU</Label>
<Input id="sku" />

<Label htmlFor="notes" optional={t("optional")}>Notes</Label>
<Textarea id="notes" />
```

`required` adds a tone-coloured `*`; `optional` adds the caller-provided "(optional)" string (translated by the caller; this primitive stays domain-agnostic).
