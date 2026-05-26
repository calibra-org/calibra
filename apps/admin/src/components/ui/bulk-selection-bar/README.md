# `BulkSelectionBar`

Tier-3 composite. Wraps `StickyActionBar` with the shared "count badge + cancel + delete + optional extra actions" cluster. Used by every list-page workbench that supports row selection (products, orders, customers, coupons, reviews).

```tsx
<BulkSelectionBar
    count={selected.size}
    locale={locale}
    labels={{ selected: t("selected", { count: selected.size }), cancel: t("cancel"), delete: t("deleteForever") }}
    onCancel={clearSelection}
    onDelete={() => openDeleteConfirm(Array.from(selected))}
    extraActions={<BulkStatusMenu selectedIds={Array.from(selected)} />}
/>
```

The locale-aware count uses `formatNumber` from `#/lib/format` so Persian digits render under `fa`. Icons (`Trash2`, `X`) sourced from `#/icons`.
