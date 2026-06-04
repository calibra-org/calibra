import type { ComponentType } from "react";

/**
 * Showcase demo loaders — keyed by primitive name. Pure data; importable from server and client.
 * Adding a demo: append the lazy-import here AND create the `<name>.demo.tsx` in the primitive's
 * folder. `hasDemo()` (in `./has-demo.ts`) reads the keys to answer "does this primitive ship a
 * live demo yet?" without pulling the client renderer.
 */
export const DEMO_LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {
    button: () => import("@calibra/panel-kit/button/button.demo").then((mod) => ({ default: mod.ButtonDemo })),
    badge: () => import("@calibra/panel-kit/badge/badge.demo").then((mod) => ({ default: mod.BadgeDemo })),
    spinner: () => import("@calibra/panel-kit/spinner/spinner.demo").then((mod) => ({ default: mod.SpinnerDemo })),
    skeleton: () => import("@calibra/panel-kit/skeleton/skeleton.demo").then((mod) => ({ default: mod.SkeletonDemo })),
    card: () => import("@calibra/panel-kit/card/card.demo").then((mod) => ({ default: mod.CardDemo })),
    dialog: () => import("@calibra/panel-kit/dialog/dialog.demo").then((mod) => ({ default: mod.DialogDemo })),
    toast: () => import("@calibra/panel-kit/toast/toast.demo").then((mod) => ({ default: mod.ToastDemo })),
    input: () => import("@calibra/panel-kit/input/input.demo").then((mod) => ({ default: mod.InputDemo })),
    checkbox: () => import("@calibra/panel-kit/checkbox/checkbox.demo").then((mod) => ({ default: mod.CheckboxDemo })),
    switch: () => import("@calibra/panel-kit/switch/switch.demo").then((mod) => ({ default: mod.SwitchDemo })),
};
