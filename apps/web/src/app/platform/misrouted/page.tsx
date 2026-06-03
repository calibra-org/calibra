import { TEMPLATE_KEY } from "#/lib/tenant/constants";

interface PageProps {
    searchParams: Promise<{ got?: string }>;
}

/**
 * Shown when a tenant whose `template_key` ≠ this deployment's {@link TEMPLATE_KEY} is routed here
 * (RULE C). In production Caddy routes each tenant to the deployment that implements its template
 * (Phase 6), so this should never appear — it fails loudly to catch a misconfigured route rather
 * than silently rendering the wrong template.
 */
export default async function MisroutedTemplatePage({ searchParams }: PageProps) {
    const { got } = await searchParams;
    return (
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-widest">Calibra · Template seam</p>
            <h1 className="mt-3 font-bold text-2xl tracking-tight">Misrouted template</h1>
            <p className="mt-3 text-muted-foreground leading-relaxed">
                This deployment serves the <code className="rounded bg-muted px-1.5 py-0.5">{TEMPLATE_KEY}</code> template, but
                this shop requests <code className="rounded bg-muted px-1.5 py-0.5">{got ?? "another"}</code>. In production,
                routing sends each shop to the deployment that implements its template.
            </p>
        </main>
    );
}
