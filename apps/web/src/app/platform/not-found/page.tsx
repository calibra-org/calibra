/**
 * Shown when a `Host` resolves to no active shop (unknown subdomain, unmapped custom domain, the
 * apex/platform host). Not tenant-branded — a shop owner has no presence on an address that isn't
 * theirs.
 */
export default function ShopNotFoundPage() {
    return (
        <main className="mx-auto max-w-md px-6 py-16 text-center">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-widest">Calibra</p>
            <h1 className="mt-3 font-bold text-2xl tracking-tight">Shop not found</h1>
            <p className="mt-3 text-muted-foreground leading-relaxed">
                This address isn’t connected to a Calibra shop. Check the URL, or reach out to the shop owner if you expected a
                store here.
            </p>
        </main>
    );
}
