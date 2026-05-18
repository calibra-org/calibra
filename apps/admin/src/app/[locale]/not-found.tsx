import { Link } from "#/lib/i18n/navigation";

export default function NotFound() {
    return (
        <main className="grid min-h-dvh place-items-center px-6">
            <section className="flex max-w-md flex-col items-start gap-4">
                <h1 className="font-bold text-5xl tracking-tight">404</h1>
                <p className="text-muted-foreground">The page you were looking for does not exist.</p>
                <Link href="/dashboard" className="rounded-md border border-border px-4 py-2 text-sm transition hover:bg-muted">
                    Back to dashboard
                </Link>
            </section>
        </main>
    );
}
