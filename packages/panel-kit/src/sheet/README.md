# `Sheet`

Tier-2 edge-anchored modal primitive. Built on Base UI's `Dialog` — there's no swipe / drag dismissal; the sheet closes via Esc, backdrop click, or explicit Close. Visual language is heavier than `Dialog` (full-bleed edges, larger close button, `bg-card`) so the sheet reads as a workspace column rather than a floating card.

## API

**Convenience (the 90% case):**

```tsx
<Sheet
    open={open}
    onOpenChange={setOpen}
    side="end"
    title={t("orders.editOrder")}
    description={t("orders.editOrderSubtitle")}
    footer={<Button onClick={save} isLoading={save.isPending}>{t("common.save")}</Button>}
    isLoading={query.isPending}
>
    <OrderEditForm orderId={id} />
</Sheet>
```

**Compound (escape hatch):**

```tsx
<SheetRoot open={open} onOpenChange={setOpen}>
    <SheetContent side="start">
        <SheetHeader>
            <SheetTitle>…</SheetTitle>
        </SheetHeader>
        <SheetBody>…</SheetBody>
        <SheetFooter>…</SheetFooter>
    </SheetContent>
</SheetRoot>
```

## Sides

| `side` | Anchor | RTL behaviour |
|---|---|---|
| `start` (default for the compound parts; convenience defaults to `end`) | inline-start edge | flips to physical right under RTL |
| `end` | inline-end edge | flips to physical left under RTL |
| `top` / `bottom` | viewport top / bottom | unchanged under RTL |

Aliases `left` / `right` accepted for shadcn-compat call sites — they normalise to `start` / `end`.

## Loading state

The convenience wrapper takes `isLoading`. While true, `SheetBody` swaps its contents for a `Skeleton` block (three text lines + one tall shimmer block sized to typical card content). Header + footer keep rendering so the slide-in animation doesn't flash to empty.

## Notes

- Anchored using logical CSS properties (`inset-y-0 end-0`, `[border-inline-start-width:1px]`) so RTL flips correctly without per-direction code.
- Close button is a 9×9 muted icon with `focus-visible:ring-[3px]` — matches the rest of the admin's focus language.
- Backdrop blur falls back to opaque `bg-black/70` on browsers without `backdrop-filter`.
