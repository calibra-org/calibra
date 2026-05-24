import { Skeleton } from "#/components/ui/skeleton";

export default function Loading() {
    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-60" />
                    <Skeleton className="h-4 w-96" />
                </div>
            </header>
            <Skeleton className="h-10 w-full max-w-xl" />
            <Skeleton className="h-[28rem] w-full rounded-lg" />
        </section>
    );
}
