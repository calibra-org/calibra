import { setRequestLocale } from "next-intl/server";

import { Card } from "#/components/ui/card";

interface SwatchSpec {
    label: string;
    classes: string;
    note: string;
}

const SURFACE_SWATCHES: SwatchSpec[] = [
    { label: "background", classes: "bg-background text-foreground border border-border", note: "Page background" },
    { label: "card", classes: "bg-card text-card-foreground border border-border", note: "Card surface" },
    { label: "popover", classes: "bg-popover text-popover-foreground border border-border", note: "Floating popover" },
    { label: "muted", classes: "bg-muted text-muted-foreground border border-border", note: "Secondary surface" },
    { label: "accent", classes: "bg-accent text-accent-foreground border border-border", note: "Hover surface" },
    { label: "primary", classes: "bg-primary text-primary-foreground", note: "Brand action" },
    { label: "secondary", classes: "bg-secondary text-secondary-foreground", note: "Neutral action" },
];

const STATUS_SWATCHES: SwatchSpec[] = [
    { label: "success", classes: "bg-success text-success-foreground", note: "Positive states" },
    { label: "warning", classes: "bg-warning text-warning-foreground", note: "Attention states" },
    { label: "danger", classes: "bg-danger text-danger-foreground", note: "Destructive states" },
    { label: "info", classes: "bg-info text-info-foreground", note: "Informational states" },
    {
        label: "destructive (alias of danger)",
        classes: "bg-destructive text-destructive-foreground",
        note: "shadcn-compat alias",
    },
];

const TINT_SWATCHES: SwatchSpec[] = [
    { label: "success/10", classes: "bg-success/10 text-success border border-success/40", note: "Light tint over background" },
    { label: "warning/10", classes: "bg-warning/10 text-warning border border-warning/40", note: "" },
    { label: "danger/10", classes: "bg-danger/10 text-danger border border-danger/40", note: "" },
    { label: "info/10", classes: "bg-info/10 text-info border border-info/40", note: "" },
];

const TYPE_SCALE = [
    { class: "text-xs", label: "text-xs (0.75rem)" },
    { class: "text-sm", label: "text-sm (0.875rem)" },
    { class: "text-base", label: "text-base (1rem)" },
    { class: "text-lg", label: "text-lg (1.125rem)" },
    { class: "text-xl", label: "text-xl (1.25rem)" },
    { class: "text-2xl", label: "text-2xl (1.5rem)" },
    { class: "text-3xl", label: "text-3xl (1.875rem)" },
];

const RADIUS_SCALE = [
    { class: "rounded-sm", label: "sm" },
    { class: "rounded-md", label: "md (default)" },
    { class: "rounded-lg", label: "lg" },
    { class: "rounded-xl", label: "xl" },
    { class: "rounded-full", label: "full" },
];

export default async function TokensPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    return (
        <div className="flex flex-col gap-8">
            <header>
                <h1 className="font-semibold text-3xl">Tokens</h1>
                <p className="mt-1 text-muted-foreground">
                    Every semantic Tailwind utility the admin uses. Per DESIGN_SYSTEM.md §3.1, code references colours through
                    these utilities only — never the raw palette steps.
                </p>
            </header>

            <SwatchGrid title="Surfaces" swatches={SURFACE_SWATCHES} />
            <SwatchGrid title="Status tones" swatches={STATUS_SWATCHES} />
            <SwatchGrid title="Tone tints (10% surface + matching foreground)" swatches={TINT_SWATCHES} />

            <Card title="Type scale">
                <div className="flex flex-col gap-3">
                    {TYPE_SCALE.map((t) => (
                        <div key={t.class} className="flex items-baseline gap-4 border-border border-b pb-2 last:border-0">
                            <code className="w-32 shrink-0 text-muted-foreground text-xs">{t.class}</code>
                            <span className={t.class}>The quick brown fox · متن آزمایشی</span>
                            <span className="ms-auto text-muted-foreground text-xs">{t.label}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Radius scale">
                <div className="flex flex-wrap items-end gap-4">
                    {RADIUS_SCALE.map((r) => (
                        <div key={r.class} className="flex flex-col items-center gap-1">
                            <div className={`size-16 bg-primary ${r.class}`} />
                            <code className="text-muted-foreground text-xs">{r.class}</code>
                            <span className="text-muted-foreground text-xs">{r.label}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Shadows">
                <div className="flex flex-wrap items-center gap-6 p-4">
                    {["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl", "shadow-2xl"].map((s) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div className={`size-20 rounded-md bg-card ${s}`} />
                            <code className="text-muted-foreground text-xs">{s}</code>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function SwatchGrid({ title, swatches }: { title: string; swatches: SwatchSpec[] }) {
    return (
        <Card title={title}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {swatches.map((s) => (
                    <div key={s.label} className={`flex flex-col gap-1 rounded-md p-4 ${s.classes}`}>
                        <code className="text-xs opacity-80">{s.label}</code>
                        <span className="text-sm">{s.note || "—"}</span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
