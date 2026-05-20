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
            <Skeleton className="h-[28rem] w-full rounded-lg" />
        </section>
    );
}
