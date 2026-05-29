import { Skeleton } from "#/components/ui/skeleton";

/**
 * Server-side fallback. The page is mostly client-driven, but Next.js still shows this skeleton
 * while the route segment streams in. Keeps the layout shape stable.
 */
export default function Loading() {
    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-9 w-36" />
                </div>
            </header>
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-10 w-full" />
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center gap-4 border-border border-b px-4 py-3">
                    {["a", "b", "c", "d", "e"].map((k) => (
                        <Skeleton key={k} className="h-3.5 flex-1" />
                    ))}
                </div>
                {["1", "2", "3", "4", "5", "6", "7", "8"].map((r) => (
                    <div key={r} className="flex items-center gap-4 border-border border-b px-4 py-4 last:border-0">
                        <Skeleton className="size-10 shrink-0 rounded-md" />
                        <Skeleton className="h-4 flex-[3]" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 flex-1" />
                    </div>
                ))}
            </div>
        </section>
    );
}
