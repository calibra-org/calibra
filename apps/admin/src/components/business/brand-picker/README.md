# `BrandPicker`

Tier-4 business primitive. Async multi-select for brands, mirrors `ProductPicker`'s shape — `apiGet("brands", ...)` for search + resolve.

```tsx
<BrandPicker
    selectedIds={includeBrandIds}
    onSelectionChange={setIncludeBrandIds}
    placeholder={t("placeholder")}
/>
```

Canonical brand picker. No other combobox allowed to back a brand list.
