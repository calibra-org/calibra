import { Skeleton } from "./index";

/** Showcase demo for the Skeleton primitive. */
export function SkeletonDemo() {
    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Pulse (default)</h3>
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Shimmer (overlay gradient pass)</h3>
                <Skeleton className="h-32 w-full" animation="shimmer" />
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Common compositions</h3>
                <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex flex-1 flex-col gap-1">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            </section>
        </div>
    );
}
