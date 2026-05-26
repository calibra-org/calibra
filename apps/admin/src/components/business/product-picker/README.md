# `ProductPicker`

Tier-4 business primitive. Async multi-select for products, wired to `apiGet("products", ...)` for search + resolve, with per-locale label resolution baked in.

```tsx
<ProductPicker
    selectedIds={includeIds}
    onSelectionChange={setIncludeIds}
    onAdd={(option) => captureProductPickedAnalytics(option)}
    placeholder={t("placeholder")}
/>
```

Composes `EntityPicker` (tier 3, lives under `components/shared/entity-picker/`) under the hood; that wrapper sits on top of `MultiCombobox` and enforces the "do not pass `items`" rule documented in `components/ui/combobox/README.md`.

**This is the canonical product picker.** No other combobox in the admin is allowed to back a product list — view-level code imports from `#/components/business/product-picker` and the picker handles search + chip resolution.
