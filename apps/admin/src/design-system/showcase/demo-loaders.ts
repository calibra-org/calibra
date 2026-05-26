import type { ComponentType } from "react";

/**
 * Showcase demo loaders — keyed by primitive name. Pure data; importable from server and client.
 * Adding a demo: append the lazy-import here AND create the `<name>.demo.tsx` in the primitive's
 * folder. `hasDemo()` (in `./has-demo.ts`) reads the keys to answer "does this primitive ship a
 * live demo yet?" without pulling the client renderer.
 */
export const DEMO_LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {
    button: () => import("#/components/ui/button/button.demo").then((mod) => ({ default: mod.ButtonDemo })),
    badge: () => import("#/components/ui/badge/badge.demo").then((mod) => ({ default: mod.BadgeDemo })),
    spinner: () => import("#/components/ui/spinner/spinner.demo").then((mod) => ({ default: mod.SpinnerDemo })),
    skeleton: () => import("#/components/ui/skeleton/skeleton.demo").then((mod) => ({ default: mod.SkeletonDemo })),
    card: () => import("#/components/ui/card/card.demo").then((mod) => ({ default: mod.CardDemo })),
    dialog: () => import("#/components/ui/dialog/dialog.demo").then((mod) => ({ default: mod.DialogDemo })),
    toast: () => import("#/components/ui/toast/toast.demo").then((mod) => ({ default: mod.ToastDemo })),
    input: () => import("#/components/ui/input/input.demo").then((mod) => ({ default: mod.InputDemo })),
    checkbox: () => import("#/components/ui/checkbox/checkbox.demo").then((mod) => ({ default: mod.CheckboxDemo })),
    switch: () => import("#/components/ui/switch/switch.demo").then((mod) => ({ default: mod.SwitchDemo })),
};
