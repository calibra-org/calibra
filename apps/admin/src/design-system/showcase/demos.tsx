"use client";

/**
 * Showcase demo registry. Each entry maps a primitive's registry name to a lazy-loaded demo
 * component from the primitive's own `<name>.demo.tsx` file. Adding a demo for a new primitive
 * is a single-line append here + the demo file itself.
 *
 * Lazy loading keeps the showcase shell light — each demo's bundle only ships when the operator
 * navigates to that primitive's page.
 */
import { type ComponentType, lazy, Suspense } from "react";

import { Spinner } from "#/components/ui/spinner";

const DEMO_LOADERS: Record<string, () => Promise<{ default: ComponentType }>> = {
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

export function hasDemo(name: string): boolean {
    return name in DEMO_LOADERS;
}

export function PrimitiveDemo({ name }: { name: string }) {
    const loader = DEMO_LOADERS[name];
    if (loader === undefined) {
        return (
            <p className="text-muted-foreground text-sm">
                No live demo for this primitive yet. The shell loads{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">{name}.demo.tsx</code> automatically as soon as its file
                lands; in the meantime, see the primitive's README for the contract + a code-only sample above.
            </p>
        );
    }
    const Lazy = lazy(loader);
    return (
        <Suspense
            fallback={
                <div className="flex h-32 items-center justify-center">
                    <Spinner size="lg" />
                </div>
            }
        >
            <Lazy />
        </Suspense>
    );
}
