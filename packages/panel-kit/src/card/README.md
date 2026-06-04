# `Card`

Tier-2 surface primitive. Bounded panel for sectioned content — used by dashboard tiles, detail-page sections, sheets-as-card-bodies, etc.

## API

**Convenience (the 90% case):**

```tsx
<Card title={t("dashboard.orders.title")} description={t("dashboard.orders.subtitle")} footer={<Button>{t("dashboard.viewAll")}</Button>}>
    <StatList items={stats} />
</Card>
```

**Compound (escape hatch for custom header layouts):**

```tsx
<CardRoot tone="warning">
    <CardHeader>
        <CardTitle tone="warning">{t("orders.locked.title")}</CardTitle>
        <CardDescription>{t("orders.locked.body")}</CardDescription>
        <CardAction><Button variant="ghost">{t("orders.locked.unlock")}</Button></CardAction>
    </CardHeader>
    <CardBody>…</CardBody>
    <CardFooter>…</CardFooter>
</CardRoot>
```

`tone`: `default` / `success` / `warning` / `danger` / `info`. Colours the border and (via `CardTitle`'s tone) the heading text.

## Loading state

The convenience wrapper takes `isLoading` — body becomes three `<Skeleton />` lines while header + footer keep rendering, so the card outline never flickers between mount and data-arrival. Use it on dashboard widgets that fetch independently.

```tsx
<Card title={t("orders.today")} isLoading={query.isPending}>
    {/* …rendered once `isLoading` flips false */}
</Card>
```

## Notes

- `CardContent` is an alias for `CardBody` — kept for shadcn-compat call sites.
- The header uses a CSS container query (`@container/card-header`) so consumers can write `@md:flex-row` inside `CardAction` without media-query gymnastics.
- `CardAction` aligns top-end via the `[has-[data-slot=card-action]:grid-cols-[1fr_auto]]` rule on the header.
