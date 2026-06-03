/**
 * Shown when the resolved tenant exists but is suspended/archived (the API answers 503). Minimal and
 * neutral — the shop is real but currently switched off, so we acknowledge it without exposing its
 * catalog or branding.
 */
export default function ShopUnavailablePage() {
    return (
        <main className="mx-auto max-w-md px-6 py-16 text-center">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-widest">Calibra</p>
            <h1 className="mt-3 font-bold text-2xl tracking-tight">This shop is temporarily unavailable</h1>
            <p className="mt-3 text-muted-foreground leading-relaxed">
                The store you’re looking for is paused right now. Please check back a little later.
            </p>
        </main>
    );
}
