import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Badge } from "#/components/ui/badge";
import { Card } from "#/components/ui/card";
import { CodeBlock } from "#/components/ui/code-block";
import { getByName, PRIMITIVES } from "#/design-system/showcase/registry";
import { Link } from "#/lib/i18n/navigation";

export async function generateStaticParams() {
    return PRIMITIVES.map((p) => ({ primitive: p.name }));
}

interface PrimitivePageProps {
    params: Promise<{ locale: string; primitive: string }>;
}

/**
 * Per-primitive showcase landing page. Renders the primitive's metadata + a sample import snippet
 * (rendered through `CodeBlock` for the syntax highlighting). Per-primitive variants / states /
 * async-surface demos land in follow-up commits per `*.demo.tsx` in each primitive folder.
 */
export default async function PrimitivePage({ params }: PrimitivePageProps) {
    const { locale, primitive } = await params;
    setRequestLocale(locale);
    const meta = getByName(primitive);
    if (meta === undefined) notFound();

    const sample = `import { /* the primitive's exports */ } from "${meta.importPath}";

// See ${meta.importPath.replace("#/", "apps/admin/src/")}/README.md for the full API.
`;

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-3">
                <Link href="/dev/ds" className="text-muted-foreground text-xs hover:underline">
                    ← Design System
                </Link>
                <div className="flex items-center gap-3">
                    <h1 className="font-semibold text-3xl">{meta.label}</h1>
                    <Badge variant="outline">Tier {meta.tier === "ui" ? "2" : meta.tier === "composite" ? "3" : "4"}</Badge>
                    {meta.asyncAware && <Badge tone="info">async-aware</Badge>}
                </div>
                <p className="max-w-2xl text-muted-foreground">{meta.description}</p>
            </header>

            <Card title="Import">
                <CodeBlock code={sample} language="tsx" />
            </Card>

            <Card title="Documentation">
                <p className="text-muted-foreground text-sm">
                    Per-primitive demos (variants / states / async surface / props table / accessibility notes) land in the
                    primitive's own
                    <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">{meta.name}.demo.tsx</code> file. The showcase
                    shell consumes those exports automatically; until each primitive ships its demo file, this page documents the
                    import surface and points readers at the in-folder README.
                </p>
                <p className="mt-3 text-muted-foreground text-sm">
                    See <code className="rounded bg-muted px-1 py-0.5 text-xs">{meta.importPath}/README.md</code> for the full
                    contract, props summary, and a11y notes.
                </p>
            </Card>

            {meta.asyncAware && (
                <Card title="Async surface">
                    <p className="text-muted-foreground text-sm">
                        This primitive supports the loading / empty / error trio per DESIGN_SYSTEM.md §3.7. The full live demo
                        using <code className="rounded bg-muted px-1 py-0.5 text-xs">#/design-system/lab/mock</code> latency
                        helpers + fixtures lands in the primitive's
                        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">{meta.name}.demo.tsx</code>.
                    </p>
                </Card>
            )}
        </div>
    );
}
