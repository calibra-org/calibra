# `CategoryPicker`

Tier-4 business primitive. Async multi-select for categories. `apiGet("categories", ...)` for search + resolve.

```tsx
<CategoryPicker
    selectedIds={includeCategoryIds}
    onSelectionChange={setIncludeCategoryIds}
    placeholder={t("placeholder")}
/>
```

Canonical category picker. No other combobox allowed to back a category list. Tree-aware variant (parent-aware indenting + excludeIds for "this category and its descendants") is a follow-up.
