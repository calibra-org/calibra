"use client";

/**
 * Showcase demo renderer. Lazy-loads the primitive's `<name>.demo.tsx` so each demo's bundle
 * only ships when its page is visited. Pair with `hasDemo()` from `./has-demo.ts` (a server-safe
 * helper) when a server component needs to know whether a demo exists.
 */
import { type ComponentType, lazy, Suspense } from "react";

import { Spinner } from "#/components/ui/spinner";

import { DEMO_LOADERS } from "./demo-loaders";

export function PrimitiveDemo({ name }: { name: string }) {
    const loader = (DEMO_LOADERS as Record<string, () => Promise<{ default: ComponentType }>>)[name];
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
