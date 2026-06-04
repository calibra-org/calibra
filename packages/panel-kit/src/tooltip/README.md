# `Tooltip`

Tier-2 hover/focus tooltip. Wraps Base UI's `Tooltip`. 150ms default delay (set on the provider).

```tsx
<TooltipProvider>
    <Tooltip>
        <TooltipTrigger render={<IconButton aria-label={t("refresh")}><Refresh /></IconButton>} />
        <TooltipContent>{t("refresh")}</TooltipContent>
    </Tooltip>
</TooltipProvider>
```

`TooltipProvider` is required somewhere up the tree. Wrap the authenticated shell once and every consumer inside it is covered.
