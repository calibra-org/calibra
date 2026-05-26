"use client";

import { CircleDashed, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { MoneyInput } from "#/components/ui/money-input";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { toast } from "#/components/ui/toast";
import { useBatchVariations, useDeleteVariation, useUpdateVariation } from "#/lib/products/mutations";
import { useGlobalAttributes, useGlobalAttributeTerms, useProductVariations, type VariationView } from "#/lib/products/queries";
import { type AttributeAxis, cartesianPins, diffCartesian, type VariationPin } from "#/lib/products/variations-cartesian";

import type { ProductDetailFormValues } from "../schema";

interface VariationsBodyProps {
    productId: number | null;
    productType: "simple" | "variable" | "grouped" | "external";
}

/**
 * Variations card body. Three states:
 *  1. No attributes ready for variations → onboarding hint pointing at the Attributes card.
 *  2. Attributes ready, no variations yet → "Create your first variations" hint + Generate.
 *  3. Variations exist → list with per-row edit + delete + default-radio.
 *
 * Cartesian generation is client-side (`variations-cartesian.ts`); persistence is server-side
 * batch via `POST /admin/products/:id/variations/batch`. The generate dialog previews
 * `{create, unchanged, outdated}` before committing so the operator never gets surprised by a
 * silent delete.
 */
export function VariationsBody({ productId, productType }: VariationsBodyProps) {
    const t = useTranslations("Products.detail.variations");
    const { watch, setValue } = useFormContext<ProductDetailFormValues>();
    const attributes = useGlobalAttributes();
    const variations = useProductVariations(productId);
    const attributeLinks = watch("attributeLinks");
    const variationAttributes = useMemo(
        () => attributeLinks.filter((link) => link.usedForVariation && link.termIds.length > 0),
        [attributeLinks],
    );

    const batch = useBatchVariations(productId ?? 0);
    const updateVariation = useUpdateVariation(productId ?? 0);
    const deleteVariation = useDeleteVariation(productId ?? 0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [deleteOutdated, setDeleteOutdated] = useState(false);

    if (productType !== "variable") {
        return (
            <div className="flex items-center gap-2 rounded-md border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
                <CircleDashed className="size-3.5" aria-hidden="true" />
                {t("notVariableHint")}
            </div>
        );
    }

    if (variationAttributes.length === 0) {
        return (
            <OnboardingHint
                variant="card"
                id="variations.no-attributes"
                icon={Sparkles}
                title={t("empty.noAttributesTitle")}
                description={t("empty.noAttributesDescription")}
            />
        );
    }

    const axes: AttributeAxis[] = variationAttributes.map((link) => ({
        attribute_id: link.attributeId,
        term_ids: link.termIds,
    }));
    const target = cartesianPins(axes);
    const diff = diffCartesian(
        axes,
        (variations.data ?? []).map((v) => ({ id: v.id, pins: v.pins })),
    );

    const onGenerate = async () => {
        if (productId === null) return;
        try {
            await batch.mutateAsync({
                create: diff.create.map((pins) => ({
                    attribute_pins: pins.map((p) => ({ attribute_id: p.attribute_id, term_id: p.term_id })),
                })),
                ...(deleteOutdated ? { delete: diff.outdated.map((v) => v.id) } : {}),
            });
            toast.add({ title: t("toasts.generated"), data: { tone: "success" } });
        } catch (error) {
            toast.add({ title: t("toasts.generateFailed"), description: String(error), data: { tone: "error" } });
        } finally {
            setPreviewOpen(false);
            setDeleteOutdated(false);
        }
    };

    const defaultVariationId = watch("defaultVariationId");
    const setDefault = (variationId: number) => setValue("defaultVariationId", variationId, { shouldDirty: true });

    if ((variations.data ?? []).length === 0) {
        return (
            <div className="flex flex-col gap-3">
                <OnboardingHint
                    variant="card"
                    id="variations.empty"
                    icon={Sparkles}
                    title={t("empty.attributesReadyTitle")}
                    description={t("empty.attributesReadyDescription", { count: target.length })}
                    cta={{ label: t("empty.generate"), onClick: () => setPreviewOpen(true) }}
                />
                <GeneratePreviewDialog
                    open={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                    onConfirm={onGenerate}
                    diff={diff}
                    deleteOutdated={deleteOutdated}
                    onToggleDeleteOutdated={setDeleteOutdated}
                    busy={batch.isPending}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                <span>{t("count", { count: (variations.data ?? []).length })}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {t("regenerate")}
                </Button>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
                {(variations.data ?? []).map((variation) => (
                    <VariationRow
                        key={variation.id}
                        variation={variation}
                        attributesIndex={attributes.data ?? []}
                        isDefault={defaultVariationId === variation.id}
                        onSetDefault={() => setDefault(variation.id)}
                        onPriceChange={async (next) => {
                            try {
                                await updateVariation.mutateAsync({
                                    variationId: variation.id,
                                    body: { regular_price: next === null ? null : Math.round(next) },
                                });
                            } catch (error) {
                                toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                            }
                        }}
                        onSkuChange={async (next) => {
                            try {
                                await updateVariation.mutateAsync({
                                    variationId: variation.id,
                                    body: { sku: next.length === 0 ? null : next },
                                });
                            } catch (error) {
                                toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                            }
                        }}
                        onDelete={async () => {
                            if (!window.confirm(t("row.deleteConfirm"))) return;
                            try {
                                await deleteVariation.mutateAsync({ variationId: variation.id });
                                toast.add({ title: t("toasts.deleted"), data: { tone: "success" } });
                            } catch (error) {
                                toast.add({ title: t("toasts.saveFailed"), description: String(error), data: { tone: "error" } });
                            }
                        }}
                    />
                ))}
            </ul>
            <GeneratePreviewDialog
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                onConfirm={onGenerate}
                diff={diff}
                deleteOutdated={deleteOutdated}
                onToggleDeleteOutdated={setDeleteOutdated}
                busy={batch.isPending}
            />
        </div>
    );
}

function VariationRow({
    variation,
    attributesIndex,
    isDefault,
    onSetDefault,
    onPriceChange,
    onSkuChange,
    onDelete,
}: {
    variation: VariationView;
    attributesIndex: { id: number; name: string }[];
    isDefault: boolean;
    onSetDefault: () => void;
    onPriceChange: (next: number | null) => Promise<void>;
    onSkuChange: (next: string) => Promise<void>;
    onDelete: () => Promise<void>;
}) {
    const t = useTranslations("Products.detail.variations");
    const [sku, setSku] = useState(variation.sku ?? "");
    const pinSummary = variation.pins.map((pin) => {
        const attribute = attributesIndex.find((a) => a.id === pin.attribute_id);
        const label = attribute?.name ?? `#${pin.attribute_id}`;
        const value = pin.term_id === null ? t("row.any") : <PinTermName attributeId={pin.attribute_id} termId={pin.term_id} />;
        return (
            <span key={pin.attribute_id} className="inline-flex items-center gap-1">
                <span className="text-muted-foreground">{label}:</span>
                <span className="font-medium text-foreground">{value}</span>
            </span>
        );
    });
    return (
        <li className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs">
            <div className="col-span-1 flex items-center justify-center">
                <input
                    type="radio"
                    name="defaultVariation"
                    checked={isDefault}
                    onChange={onSetDefault}
                    aria-label={t("row.default")}
                />
            </div>
            <div className="col-span-4 flex flex-wrap items-center gap-2">{pinSummary}</div>
            <div className="col-span-3">
                <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    onBlur={() => sku !== (variation.sku ?? "") && void onSkuChange(sku)}
                    dir="ltr"
                    className="h-7 font-mono text-xs"
                    placeholder={t("columns.sku")}
                />
            </div>
            <div className="col-span-3">
                <MoneyInput
                    valueMinor={variation.regularPriceMinor}
                    onChangeMinor={(next) => void onPriceChange(next)}
                    min={0}
                    step={1000}
                />
            </div>
            <div className="col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onDelete}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
            </div>
        </li>
    );
}

function PinTermName({ attributeId, termId }: { attributeId: number; termId: number }) {
    const terms = useGlobalAttributeTerms(attributeId);
    const term = terms.data?.find((t) => t.id === termId);
    return <>{term?.name ?? `#${termId}`}</>;
}

function GeneratePreviewDialog({
    open,
    onClose,
    onConfirm,
    diff,
    deleteOutdated,
    onToggleDeleteOutdated,
    busy,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    diff: { create: VariationPin[][]; unchanged: { id: number }[]; outdated: { id: number }[] };
    deleteOutdated: boolean;
    onToggleDeleteOutdated: (next: boolean) => void;
    busy: boolean;
}) {
    const t = useTranslations("Products.detail.variations.generate");
    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>
                        {t("summaryNew", { count: diff.create.length })}
                        {" · "}
                        {t("summaryUnchanged", { count: diff.unchanged.length })}
                        {diff.outdated.length > 0 ? (
                            <>
                                {" · "}
                                {t("summaryOutdated", { count: diff.outdated.length })}
                            </>
                        ) : null}
                    </DialogDescription>
                </DialogHeader>
                {diff.outdated.length > 0 ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={deleteOutdated}
                            onChange={(e) => onToggleDeleteOutdated(e.target.checked)}
                        />
                        {t("deleteOutdatedLabel", { count: diff.outdated.length })}
                    </label>
                ) : null}
                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                    <Button type="button" onClick={() => void onConfirm()} disabled={busy || diff.create.length === 0}>
                        {t("confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
