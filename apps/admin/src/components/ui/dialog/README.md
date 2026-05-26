# `Dialog`

Tier-2 modal primitive. Centred, backdrop-blurred, focus-trapped. Built on Base UI's `Dialog`.

## API

**Convenience (the 90% case):**

```tsx
<Dialog
    open={open}
    onOpenChange={setOpen}
    title={t("products.deleteTitle")}
    description={t("products.deleteBody", { name })}
    footer={
        <>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button tone="danger" isLoading={remove.isPending} onClick={confirm}>{t("common.delete")}</Button>
        </>
    }
>
    {t("products.deleteWarning")}
</Dialog>
```

**Compound (escape hatch):**

```tsx
<DialogRoot open={open} onOpenChange={setOpen}>
    <DialogContent size="lg">
        <DialogHeader>
            <DialogTitle>…</DialogTitle>
            <DialogDescription>…</DialogDescription>
        </DialogHeader>
        <DialogBody>…</DialogBody>
        <DialogFooter>…</DialogFooter>
    </DialogContent>
</DialogRoot>
```

## Sizes

| `size` | Max width |
|---|---|
| `sm` | 24rem (`max-w-sm`) |
| `md` (default) | 32rem (`max-w-lg`) |
| `lg` | 42rem (`max-w-2xl`) |
| `xl` | 56rem (`max-w-4xl`) |

## Loading state

The convenience wrapper takes `isLoading`. While true, `DialogBody` swaps for a `Skeleton` block — header + footer keep rendering so the open animation doesn't flash empty.

## Calendar-in-Dialog rule

Every date input flow in the admin opens the Calendar inside a `Dialog`, never inside a `Popover`. Owned by prompt 03 — see `DESIGN_SYSTEM.md` §3.8.
