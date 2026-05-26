# `Select`

Tier-2 single-select dropdown. Wraps Base UI's `Select` parts (Root / Trigger / Value / Content / Item / Icon / ItemIndicator).

```tsx
<Select value={status} onValueChange={setStatus}>
    <SelectTrigger loading={isFetching}>
        <SelectValue placeholder={t("placeholder")} />
    </SelectTrigger>
    <SelectContent>
        <SelectItem value="draft">{t("status.draft")}</SelectItem>
        <SelectItem value="published">{t("status.published")}</SelectItem>
    </SelectContent>
</Select>
```

`SelectTrigger` accepts `loading={true}` to swap the chevron for a `<Spinner />` — use it while the parent's options are being fetched.

When the options come from an async search (typing → server filter), reach for `Combobox` instead — `Select` is for fixed enum-shaped lists.
