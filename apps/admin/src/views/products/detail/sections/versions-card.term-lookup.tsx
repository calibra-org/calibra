"use client";

import type { VariationView } from "#/lib/products/queries";
import { useGlobalAttributeTerms } from "#/lib/products/queries";

interface VersionTermNamesProps {
    pins: VariationView["pins"];
    attributesIndex: { id: number; name: string }[];
    fallback: string;
}

/**
 * Renders the customer-facing display name for a sellable version by walking its pins and
 * resolving each `(attribute_id, term_id)` pair against the global terms cache. Each pin
 * renders as its own child component so that React's rules-of-hooks let us call
 * {@link useGlobalAttributeTerms} once per attribute without violating the loop / conditional
 * constraint. The terms query is heavily cached upstream (staleTime: 60s).
 */
export function VersionTermNames({ pins, attributesIndex, fallback }: VersionTermNamesProps) {
    if (pins.length === 0) return <span className="text-muted-foreground">{fallback}</span>;
    return (
        <span className="flex flex-wrap items-center gap-1 text-xs">
            {pins.map((pin, i) => (
                <span key={pin.attribute_id} className="inline-flex items-center gap-1">
                    {i > 0 ? <span className="text-muted-foreground">/</span> : null}
                    <PinTermName attributeId={pin.attribute_id} termId={pin.term_id} attributesIndex={attributesIndex} />
                </span>
            ))}
        </span>
    );
}

function PinTermName({
    attributeId,
    termId,
    attributesIndex,
}: {
    attributeId: number;
    termId: number | null;
    attributesIndex: { id: number; name: string }[];
}) {
    const terms = useGlobalAttributeTerms(attributeId);
    const attribute = attributesIndex.find((a) => a.id === attributeId);
    if (termId === null) {
        return <span className="text-muted-foreground">{attribute?.name ?? `#${attributeId}`}: —</span>;
    }
    const term = terms.data?.find((t) => t.id === termId);
    return <span className="font-medium text-foreground">{term?.name ?? `#${termId}`}</span>;
}
