# `AlertDialog` / `ConfirmDialog`

Tier-3 confirm dialog. Wraps Base UI's `AlertDialog` (`role="alertdialog"`, no dismiss-on-outside-click). Use for any action where mis-clicking the backdrop must NOT cancel — destructive operations, irreversible state changes, anything legal/compliance-sensitive.

Two exports:

- `AlertDialog` — root passthrough; the entry point for the **compound** API (kept for backwards-compat with the existing view call sites that use `<AlertDialog open><Content>…</Content></AlertDialog>`).
- `ConfirmDialog` — convenience wrapper for the 90% confirm pattern.

**Convenience (the 90% case):**

```tsx
<ConfirmDialog
    open={confirmOpen}
    onOpenChange={setConfirmOpen}
    title={t("orders.cancelTitle")}
    description={t("orders.cancelBody")}
    confirmLabel={t("orders.confirmCancel")}
    cancelLabel={t("common.keepEditing")}
    tone="danger"
    isConfirming={cancel.isPending}
    onConfirm={() => cancel.mutate(orderId)}
/>
```

**Compound (escape hatch — for richer body content):**

```tsx
<AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>…</AlertDialogTitle>
            <AlertDialogDescription>…</AlertDialogDescription>
        </AlertDialogHeader>
        <CustomBody />
        <AlertDialogFooter>…</AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
```

`tone="danger"` / `tone="warning"` / `tone="default"` on `ConfirmDialog` colours the confirm button via the same compound-variant table as the `Button` primitive. `isConfirming` flows through to the confirm `Button`'s `isLoading` — width preserved, spinner overlay, pointer events disabled.
