"use client";

import type { Locale } from "@calibra/shared/i18n";
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocale, useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useId, useMemo, useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { ChevronDown, ChevronEnd, ChevronRight, Layers, Sparkles } from "#/icons";
import { formatNumber } from "#/lib/format";
import { useGlobalAttributes } from "#/lib/products/queries";
import { cartesianPins } from "#/lib/products/variations-cartesian";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";

import { AttributeRowHeader } from "./shared/attribute-row-header";
import { TermChipStrip } from "./shared/term-chip-strip";

interface ChoicesBodyProps {
    productType: ProductDetailFormValues["type"];
    onRequestVariableType: () => void;
}

/**
 * `apps/admin/src/views/products/detail/sections/choices-card.tsx`
 *
 * Customer choices card body. Shows {@link ProductDetailFormValues.attributeLinks} rows where
 * `usedForVariation === true`. Each choice exposes:
 *
 *   - a display-type select (dropdown / pills / color_swatch / image_swatch),
 *   - a sortable term chip strip (the operator picks the values shoppers can choose between),
 *   - a live combination count footer (`{this choice} × {other choices} = {N} versions`).
 *
 * The card footer enforces a graduated guardrail against combinatorial explosion: 50 = warn,
 * 200 = require explicit confirmation checkbox, 1000 = block the generate path entirely.
 *
 * On a `simple` product the empty-state CTA flips the selling mode to `variable` via the
 * `onRequestVariableType` callback so adding a choice is a single click instead of a context
 * switch up to the picker.
 */
export function ChoicesBody({ productType, onRequestVariableType }: ChoicesBodyProps) {
    const t = useTranslations("Products.detail.choices");
    const tLinks = useTranslations("Products.detail.attributes");
    const locale = useLocale() as Locale;
    const { control, getValues } = useFormContext<ProductDetailFormValues>();
    const links = useFieldArray({ control, name: "attributeLinks" });
    const attributes = useGlobalAttributes();

    /**
     * Row identifier uses the RHF synthetic `f.id` rather than `attributeId` so React keys stay
     * unique even if two field-array entries transiently share the same attribute_id. Lookups
     * back to the field array key off the same id end-to-end.
     */
    type RowId = `link:${string}`;

    /**
     * Visible rows are the subset of links where `usedForVariation=true`. Reading the watched
     * field-array means flips from the Specs card (promote-to-choice) and from this card
     * (demote-to-spec) re-render here without needing an explicit subscription.
     */
    const visibleRowIds = useMemo<RowId[]>(() => {
        return links.fields
            .filter((_, idx) => getValues(`attributeLinks.${idx}.usedForVariation`) === true)
            .map((f) => `link:${f.id}` as RowId);
    }, [links.fields, getValues]);

    /**
     * Tracks explicitly-collapsed rows. Default for the Choices card is OPEN — the operator's
     * always editing values here — so the empty set means "everything expanded". Clicking a
     * chevron adds the row to the collapsed set; clicking again removes it. New rows land
     * expanded without any state mutation.
     */
    const [collapsed, setCollapsed] = useState<Set<RowId>>(() => new Set());
    useEffect(() => {
        setCollapsed((prev) => {
            if (prev.size === 0) return prev;
            const live = new Set(visibleRowIds);
            const next = new Set<RowId>();
            for (const id of prev) if (live.has(id)) next.add(id);
            return next.size === prev.size ? prev : next;
        });
    }, [visibleRowIds]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const usedAttributeIds = new Set(links.fields.map((f) => f.attributeId));
    const availableNew = (attributes.data ?? []).filter((a) => !usedAttributeIds.has(a.id));
    const spec_candidates = (attributes.data ?? [])
        .map((a) => {
            const idx = links.fields.findIndex((f) => f.attributeId === a.id);
            if (idx === -1) return null;
            if (getValues(`attributeLinks.${idx}.usedForVariation`) === true) return null;
            return { ...a, demote: true };
        })
        .filter((x): x is { id: number; name: string; demote: boolean } => x !== null);
    const combinedOptions = [
        ...availableNew.map((a) => ({ id: a.id, name: a.name, promoteExisting: false })),
        ...spec_candidates.map((a) => ({ id: a.id, name: a.name, promoteExisting: true })),
    ];

    const addOrPromote = (attributeId: number) => {
        const idx = links.fields.findIndex((f) => f.attributeId === attributeId);
        if (idx !== -1) {
            const fieldId = links.fields[idx]!.id;
            links.update(idx, { ...links.fields[idx]!, usedForVariation: true });
            setCollapsed((prev) => {
                const next = new Set(prev);
                next.delete(`link:${fieldId}` as RowId);
                return next;
            });
            return;
        }
        links.append({
            attributeId,
            position: links.fields.length,
            visible: true,
            usedForVariation: true,
            displayType: "dropdown",
            termIds: [],
        });
    };

    const handlePick = (attributeId: number) => {
        if (productType !== "variable") {
            onRequestVariableType();
            /**
             * Defer the append by one microtask so the type flip has flushed through RHF before
             * this row appears. Without the defer, the row mounts while `productType` is still
             * `simple`, and the gating logic above re-runs against stale state.
             */
            queueMicrotask(() => addOrPromote(attributeId));
            return;
        }
        addOrPromote(attributeId);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = visibleRowIds.indexOf(active.id as RowId);
        const newIndex = visibleRowIds.indexOf(over.id as RowId);
        if (oldIndex === -1 || newIndex === -1) return;
        const next = arrayMove(visibleRowIds, oldIndex, newIndex);
        const newOrder: string[] = next.map((id) => id.slice("link:".length));
        const currentIds: string[] = links.fields.map((f) => f.id);
        for (let target = 0; target < newOrder.length; target += 1) {
            const desiredId = newOrder[target]!;
            const currentPos = currentIds.indexOf(desiredId);
            if (currentPos !== -1 && currentPos !== target) {
                links.move(currentPos, target);
                const [moved] = currentIds.splice(currentPos, 1);
                currentIds.splice(target, 0, moved!);
            }
        }
    };

    const demoteToSpec = (fieldId: string) => {
        const idx = links.fields.findIndex((f) => f.id === fieldId);
        if (idx === -1) return;
        links.update(idx, { ...links.fields[idx]!, usedForVariation: false });
    };

    const isEmpty = visibleRowIds.length === 0;
    const allChoiceLinks = links.fields
        .map((f, idx) => ({ f, idx }))
        .filter(({ idx }) => getValues(`attributeLinks.${idx}.usedForVariation`) === true);
    const totalCombinations = useMemo(() => {
        const axes = allChoiceLinks.map(({ idx }) => ({
            attribute_id: links.fields[idx]!.attributeId,
            term_ids: getValues(`attributeLinks.${idx}.termIds`),
        }));
        return cartesianPins(axes).length;
    }, [allChoiceLinks, links.fields, getValues]);

    return (
        <div className="flex flex-col gap-3">
            {isEmpty ? (
                <OnboardingHint
                    variant="inline"
                    id="choices.empty"
                    icon={Layers}
                    title={t("title")}
                    description={t("empty")}
                    dismissible={false}
                    cta={
                        productType === "variable"
                            ? undefined
                            : { label: t("ifVariableRequired"), onClick: onRequestVariableType }
                    }
                />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value=""
                    onValueChange={(next) => {
                        if (typeof next === "string" && next.length > 0) handlePick(Number(next));
                    }}
                >
                    <SelectTrigger className="h-9 w-64">
                        <SelectValue placeholder={t("addChoice")}>
                            {() => <span className="text-muted-foreground">{t("addChoice")}</span>}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {combinedOptions.length === 0 ? (
                            <p className="px-2 py-2 text-muted-foreground text-xs">—</p>
                        ) : (
                            combinedOptions.map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                    <div className="flex flex-col">
                                        <span>{a.name}</span>
                                        {a.promoteExisting ? (
                                            <span className="text-muted-foreground text-xs">{t("row.demoteToSpec")}</span>
                                        ) : null}
                                    </div>
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>
            </div>

            {visibleRowIds.length > 0 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={visibleRowIds} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-2">
                            {visibleRowIds.map((rowId) => {
                                const fieldId = rowId.slice("link:".length);
                                const index = links.fields.findIndex((f) => f.id === fieldId);
                                if (index === -1) return null;
                                const siblingIds = links.fields
                                    .map((_, j) => j)
                                    .filter((j) => j !== index && getValues(`attributeLinks.${j}.usedForVariation`) === true)
                                    .map((j) => getValues(`attributeLinks.${j}.termIds`));
                                return (
                                    <ChoiceRow
                                        key={rowId}
                                        rowId={rowId}
                                        index={index}
                                        expanded={!collapsed.has(rowId)}
                                        onToggleExpand={() =>
                                            setCollapsed((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(rowId)) next.delete(rowId);
                                                else next.add(rowId);
                                                return next;
                                            })
                                        }
                                        onDemoteToSpec={() => demoteToSpec(fieldId)}
                                        locale={locale}
                                        siblingTermIds={siblingIds}
                                        labels={{
                                            dragHandle: tLinks("row.dragHandle"),
                                            dragTooltip: tLinks("row.dragTooltip"),
                                            expand: tLinks("row.expand"),
                                            collapse: tLinks("row.collapse"),
                                            clear: t("row.demoteToSpec"),
                                            valueCount: (count: number) =>
                                                tLinks("row.termCount", { count: formatNumber(count, locale) }),
                                            values: tLinks("row.terms"),
                                            selectAll: tLinks("row.selectAll"),
                                            selectNone: tLinks("row.selectNone"),
                                            createValue: tLinks("row.createValue"),
                                            createFailed: tLinks("createTermFailed"),
                                            displayLabel: t("displayType.label"),
                                            displayDropdown: t("displayType.dropdown"),
                                            displayPills: t("displayType.pills"),
                                            displayColor: t("displayType.color_swatch"),
                                            displayImage: t("displayType.image_swatch"),
                                            combinationCount: (count: number) =>
                                                t("row.combinationCount", { count: formatNumber(count, locale) }),
                                            singleValueWarning: t("row.singleValueWarning"),
                                            demoteToSpec: t("row.demoteToSpec"),
                                        }}
                                    />
                                );
                            })}
                        </ul>
                    </SortableContext>
                </DndContext>
            ) : null}

            {visibleRowIds.length > 0 ? <ChoicesFooter total={totalCombinations} locale={locale} /> : null}

            <ChoicesExplainer />
        </div>
    );
}

interface ChoiceRowProps {
    rowId: string;
    index: number;
    expanded: boolean;
    onToggleExpand: () => void;
    onDemoteToSpec: () => void;
    locale: Locale;
    /** Term-id arrays from every OTHER choice — used to compute "this × others" combination count. */
    siblingTermIds: number[][];
    labels: {
        dragHandle: string;
        dragTooltip: string;
        expand: string;
        collapse: string;
        clear: string;
        valueCount: (count: number) => string;
        values: string;
        selectAll: string;
        selectNone: string;
        createValue: string;
        createFailed: string;
        displayLabel: string;
        displayDropdown: string;
        displayPills: string;
        displayColor: string;
        displayImage: string;
        combinationCount: (count: number) => string;
        singleValueWarning: string;
        demoteToSpec: string;
    };
}

function ChoiceRow({ rowId, index, expanded, onToggleExpand, onDemoteToSpec, siblingTermIds, labels }: ChoiceRowProps) {
    const { control, watch } = useFormContext<ProductDetailFormValues>();
    const link = watch(`attributeLinks.${index}`);
    const attributes = useGlobalAttributes();
    const attribute = attributes.data?.find((a) => a.id === link.attributeId);
    const title = attribute?.name ?? `#${link.attributeId}`;
    const { setNodeRef, attributes: dragAttrs, listeners, transform, transition, isDragging } = useSortable({ id: rowId });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
    const displayId = useId();

    const otherCount = siblingTermIds.reduce((acc, ids) => (ids.length === 0 ? 0 : acc * ids.length), 1);
    const thisCount = link.termIds.length === 0 ? 0 : link.termIds.length;
    const combinations = otherCount === 0 || thisCount === 0 ? 0 : thisCount * otherCount;
    const singleValue = thisCount === 1;

    return (
        <li
            ref={setNodeRef}
            style={style}
            {...dragAttrs}
            className={cn(
                "group overflow-hidden rounded-md border border-border bg-background",
                isDragging && "z-10 opacity-70 ring-2 ring-primary/40",
            )}
        >
            <AttributeRowHeader
                listeners={listeners}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onRemove={onDemoteToSpec}
                title={title}
                countBadge={link.termIds.length > 0 ? labels.valueCount(link.termIds.length) : null}
                dragHandleLabel={labels.dragHandle}
                dragHandleTooltip={labels.dragTooltip}
                expandLabel={labels.expand}
                collapseLabel={labels.collapse}
                removeLabel={labels.demoteToSpec}
            />
            {expanded ? (
                <div className="flex flex-col gap-3 border-border/60 border-t px-3 pt-2 pb-3">
                    <Controller
                        control={control}
                        name={`attributeLinks.${index}.displayType`}
                        render={({ field }) => (
                            <label htmlFor={displayId} className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">{labels.displayLabel}</span>
                                <Select value={field.value} onValueChange={field.onChange}>
                                    <SelectTrigger id={displayId} className="h-8 w-48">
                                        <SelectValue>
                                            {(value) => {
                                                if (typeof value !== "string") return null;
                                                if (value === "dropdown") return labels.displayDropdown;
                                                if (value === "pills") return labels.displayPills;
                                                if (value === "color_swatch") return labels.displayColor;
                                                if (value === "image_swatch") return labels.displayImage;
                                                return null;
                                            }}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="dropdown">{labels.displayDropdown}</SelectItem>
                                        <SelectItem value="pills">{labels.displayPills}</SelectItem>
                                        <SelectItem value="color_swatch">{labels.displayColor}</SelectItem>
                                        <SelectItem value="image_swatch">{labels.displayImage}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </label>
                        )}
                    />
                    <Controller
                        control={control}
                        name={`attributeLinks.${index}.termIds`}
                        render={({ field }) => (
                            <TermChipStrip
                                attributeId={link.attributeId}
                                termIds={field.value}
                                onChange={field.onChange}
                                labels={{
                                    values: labels.values,
                                    selectAll: labels.selectAll,
                                    selectNone: labels.selectNone,
                                    createValue: labels.createValue,
                                    createFailed: labels.createFailed,
                                }}
                            />
                        )}
                    />
                    {combinations > 0 ? (
                        <div className="text-muted-foreground text-xs">{labels.combinationCount(combinations)}</div>
                    ) : null}
                    {singleValue ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
                            <span className="min-w-0 flex-1 text-muted-foreground">{labels.singleValueWarning}</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 shrink-0 text-xs"
                                onClick={onDemoteToSpec}
                            >
                                {labels.demoteToSpec}
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

function ChoicesFooter({ total, locale }: { total: number; locale: Locale }) {
    const t = useTranslations("Products.detail.choices");
    const tone = total > 1000 ? "danger" : total > 200 ? "danger" : total > 50 ? "warning" : "muted";
    return (
        <div
            className={cn(
                "flex flex-col gap-2 rounded-md border p-3 text-xs",
                tone === "danger" && "border-danger/30 bg-danger/5",
                tone === "warning" && "border-warning/30 bg-warning/5",
                tone === "muted" && "border-border bg-muted/30",
            )}
        >
            <span className="font-medium text-foreground">{t("totalCount", { count: formatNumber(total, locale) })}</span>
            {total > 1000 ? <span className="text-danger">{t("blockTooMany")}</span> : null}
            {total > 200 && total <= 1000 ? <span className="text-warning">{t("warnLarge")}</span> : null}
            {total > 50 && total <= 200 ? <span className="text-warning">{t("warnLarge")}</span> : null}
        </div>
    );
}

/**
 * Reference card explaining the choices → versions concept. Collapsed by default; the operator
 * expands the chevron when they want the worked iPhone example. Permanently visible — there's
 * no dismiss path because the collapsed state already gets it out of the way.
 */
function ChoicesExplainer() {
    const t = useTranslations("Products.detail.choices.explainer");
    const [open, setOpen] = useState<boolean>(false);

    const choiceBullets = ["رنگ: نقره‌ای، آبی", "حافظه: ۱۲۸ گیگ، ۲۵۶ گیگ"];
    const versionBullets = ["نقره‌ای / ۱۲۸ گیگ", "نقره‌ای / ۲۵۶ گیگ", "آبی / ۱۲۸ گیگ", "آبی / ۲۵۶ گیگ"];

    return (
        <div className="rounded-md border border-border bg-muted/30 text-xs">
            <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-foreground"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                {open ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
                ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" data-rtl-flip aria-hidden="true" />
                )}
                <Sparkles className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{t("title")}</span>
            </button>
            {open ? (
                <div className="flex flex-col gap-3 border-border border-t bg-background px-3 py-3">
                    <p>
                        <span className="text-muted-foreground">{t("exampleProduct").split(":")[0]}:</span>{" "}
                        <span className="font-medium text-foreground">
                            {t("exampleProduct").split(":")[1]?.trim() ?? t("exampleProduct")}
                        </span>
                    </p>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                        <ExampleColumn title={t("exampleChoicesHeader")} bullets={choiceBullets} />
                        <ChevronEnd
                            className="mt-3 hidden size-4 self-start text-muted-foreground/60 md:block"
                            aria-hidden="true"
                        />
                        <ExampleColumn title={t("exampleVersionsHeader")} bullets={versionBullets} />
                    </div>
                    <p className="text-muted-foreground">{t("footer")}</p>
                </div>
            ) : null}
        </div>
    );
}

function ExampleColumn({ title, bullets }: { title: string; bullets: string[] }) {
    return (
        <div className="rounded-md border border-border bg-muted/30 p-2.5">
            <p className="mb-1.5 font-medium text-foreground text-xs">{title.replace(/:$/, "")}</p>
            <ul className="flex flex-col gap-1 text-foreground">
                {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 leading-relaxed">
                        <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
                            •
                        </span>
                        <span className="flex-1">{b}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
