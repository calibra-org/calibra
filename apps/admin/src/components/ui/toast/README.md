# `Toast` / `Toaster` / `toastPromise`

Tier-2 ephemeral notification primitive. Mount `<Toaster />` once at the authenticated-shell root; fire from anywhere via the shared `toast` manager.

## API

```tsx
import { toast, toastPromise, Toaster } from "#/components/ui/toast";

// somewhere in the app shell
<Toaster />

// fire ad-hoc
toast.add({ title: t("orders.saved"), data: { tone: "success" } });
toast.add({ description: t("orders.failed", { reason }), data: { tone: "error" } });

// fire around a promise
await toastPromise(saveProduct(payload), {
    loading: t("products.saving"),
    success: (product) => t("products.savedSuccessfully", { name: product.name }),
    error: (err) => t("products.saveFailed", { reason: err.message }),
});
```

## Tones

`success` (semantic success icon), `error` (semantic danger icon), `warning` (semantic warning icon), `info` (default — semantic info icon), `loading` (spinner). Set via `data: { tone: ... }` on `toast.add` or via `toastPromise`.

## Behaviour

- Stacks up to 3 visible at once; older ones peek behind, full stack expands on hover.
- Swipe to dismiss (down / left / right depending on which way the operator drags).
- Auto-dismiss after 5s except `tone: "loading"` (timeout `0`); `toastPromise` clears the loading toast on settle.
- Viewport sits at `z-[1090]`, above the Dialog backdrop (`z-50`), so toasts emitted from inside a modal stay visible.
