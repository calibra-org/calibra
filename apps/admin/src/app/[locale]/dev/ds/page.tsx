import { setRequestLocale } from "next-intl/server";

import { Badge } from "#/components/ui/badge";
import { Card } from "#/components/ui/card";
import { getByTier, PRIMITIVES } from "#/design-system/showcase/registry";
import { Link } from "#/lib/i18n/navigation";

export default async function DesignSystemOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    const tiers = [
        {
            name: "ui" as const,
            label: "Tier 2 — UI primitives",
            description: "Pure visual + behavioural primitives wrapping Base UI / raw HTML. Zero domain knowledge.",
        },
        {
            name: "composite" as const,
            label: "Tier 3 — Composite primitives",
            description: "Built from tier-2 + structural composition. No domain logic.",
        },
        {
            name: "business" as const,
            label: "Tier 4 — Business primitives",
            description: "Composes UI primitives + wires to an API query/mutation. Domain-aware.",
        },
    ];

    return (
        <div className="flex flex-col gap-8">
            <header className="flex flex-col gap-2">
                <h1 className="font-semibold text-3xl">Calibra Admin Design System</h1>
                <p className="max-w-2xl text-muted-foreground">
                    Every primitive in the admin lives behind one of {PRIMITIVES.length} entries below. Tier 2 primitives wrap
                    Base UI parts directly; tier 3 composes them into reusable structural patterns; tier 4 ties primitives to API
                    queries so business surfaces compose at a high level. Click any primitive to see its variants, states, code
                    samples, and props.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Badge variant="secondary">Dev-only — gated behind NODE_ENV !== "production"</Badge>
                    <Badge variant="outline">
                        <Link href="/dev/ds/tokens" className="hover:underline">
                            View tokens →
                        </Link>
                    </Badge>
                </div>
            </header>

            {tiers.map((tier) => {
                const primitives = getByTier(tier.name);
                return (
                    <section key={tier.name} className="flex flex-col gap-3">
                        <header className="flex items-baseline justify-between gap-4">
                            <div>
                                <h2 className="font-semibold text-xl">{tier.label}</h2>
                                <p className="text-muted-foreground text-sm">{tier.description}</p>
                            </div>
                            <span className="text-muted-foreground text-xs">{primitives.length} primitives</span>
                        </header>
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {primitives.map((p) => (
                                <li key={p.name}>
                                    <Link href={`/dev/ds/${p.name}` as never} className="block">
                                        <Card title={p.label} className="h-full transition-colors hover:border-ring/40">
                                            <p className="text-muted-foreground text-sm">{p.description}</p>
                                            <code className="mt-2 block text-muted-foreground text-xs">{p.importPath}</code>
                                        </Card>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
