import { Link } from "#/lib/i18n/navigation";

export default function NotFound() {
    return (
        <section className="flex flex-col items-start gap-4 py-24">
            <h1 className="text-4xl font-bold tracking-tight">404</h1>
            <p className="text-muted-foreground">The page you were looking for does not exist.</p>
            <Link href="/" className="rounded-md border border-border px-4 py-2 transition hover:bg-muted">
                Home
            </Link>
        </section>
    );
}
