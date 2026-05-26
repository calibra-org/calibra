# `Tabs`

Tier-2 tab strip. Wraps Base UI's `Tabs` parts; three visual variants.

```tsx
<Tabs variant="line" value={tab} onValueChange={setTab}>
    <TabsList>
        <TabsTrigger value="orders">{t("tabs.orders")}</TabsTrigger>
        <TabsTrigger value="refunds">{t("tabs.refunds")}</TabsTrigger>
        <TabsTrigger value="timeline">{t("tabs.timeline")}</TabsTrigger>
    </TabsList>
    <TabsContent value="orders">…</TabsContent>
    <TabsContent value="refunds">…</TabsContent>
    <TabsContent value="timeline">…</TabsContent>
</Tabs>
```

Variants: `default` (segmented pill on a muted track) / `line` (bare tabs + full-width bottom border + 2px primary underline) / `ghost` (bare with hover bg, no indicator).

The indicator reads `--active-tab-{left,top,width,height}` CSS variables Base UI sets, so it tweens automatically. Indicator positions with physical `left` / `right` rather than logical `start` / `end` because Base UI's offsets are already in pixels from the list's start / end edges — Tailwind's logical utilities would re-flip them under RTL.
