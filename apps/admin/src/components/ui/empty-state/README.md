# `EmptyState`

Tier-3 empty-state. The canonical "settled with zero rows" body. Used by DataGrid empty kinds, picker popups when search returns nothing, dashboard widgets with no data.

```tsx
<EmptyState icon={Inbox} title={t("orders.empty.title")} description={t("orders.empty.body")} action={<Button>{t("orders.create")}</Button>} />
```

Icon argument is `ComponentType<SVGProps<SVGSVGElement>>` so any icon from `#/icons` plugs straight in.
