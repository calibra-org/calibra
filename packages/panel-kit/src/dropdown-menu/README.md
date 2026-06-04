# `DropdownMenu`

Tier-2 menu primitive (Base UI `Menu`). Used for row-actions, app-bar menus, contextual options.

```tsx
<DropdownMenu>
    <DropdownMenuTrigger render={<IconButton aria-label={t("rowActions")}><MoreHorizontal /></IconButton>} />
    <DropdownMenuContent>
        <DropdownMenuItem onClick={edit}>{t("common.edit")}</DropdownMenuItem>
        <DropdownMenuItem onClick={duplicate}>{t("common.duplicate")}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={remove} className="text-danger">{t("common.delete")}</DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>
```

`DropdownMenuLabel` is a plain `<div>` heading — Base UI's `Menu.GroupLabel` throws unless wrapped in `Menu.Group`. Wrap with `<DropdownMenuGroup>` + use `<Menu.GroupLabel>` directly when you need an a11y-grouped label.

Icons in menu items go through `#/icons` — never `lucide-react` directly.
