import { Skeleton } from "#/components/ui/skeleton";

export default function Loading() {
    return (
        <section className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-7 w-60" />
                <Skeleton className="h-4 w-96" />
            </header>
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-[28rem] w-full rounded-lg" />
        </section>
    );
}
