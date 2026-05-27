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
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocale, useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useId, useMemo, useState } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { AlertTriangle, Plus, Tag } from "#/icons";
import { formatNumber } from "#/lib/format";
import { useGlobalAttributes } from "#/lib/products/queries";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";
import { AttributeRowHeader } from "./shared/attribute-row-header";
import { CustomChipInput } from "./shared/custom-chip-input";
import { TermChipStrip } from "./shared/term-chip-strip";

/**
 * `apps/admin/src/views/products/detail/sections/specs-card.tsx`
 *
 * Specs card body. Visible for every selling mode. Shows two row kinds in one sortable list:
 *
 *   - **From-taxonomy specs** — entries in {@link ProductDetailFormValues.attributeLinks} where
 *     `usedForVariation === false`. Read-only attribute name + term chip strip + visibility.
 *   - **Free-form specs** — entries in {@link ProductDetailFormValues.customAttributes}. Editable
 *     name + chip values + visibility. Free-form rows can never become customer choices on
 *     their own — they have no global taxonomy backing — so the "promote" path is gated.
 *
 * If a free-form spec accumulates multiple values, an inline ribbon nudges the operator to
 * consider whether shoppers should be choosing between them. The "promote" button on a
 * from-taxonomy spec flips `usedForVariation=true` in place (no data loss — same link row).
 */
interface SpecsBodyProps {
    /** When provided + the product is `simple`, the empty state shows a "switch to multi-version" CTA. */
    onRequestVariableType?: () => void;
}

export function SpecsBody({ onRequestVariableType }: SpecsBodyProps = {}) {
    const t = useTranslations("Products.detail.specs");
    const tLinks = useTranslations("Products.detail.attributes");
    const locale = useLocale() as Locale;
    const { control, getValues } = useFormContext<ProductDetailFormValues>();
    const productType = useWatch({ control, name: "type" });
    const links = useFieldArray({ control, name: "attributeLinks" });
    const customs = useFieldArray({ control, name: "customAttributes" });
    const attributes = useGlobalAttributes();

    const usedAttributeIds = new Set(links.fields.map((f) => f.attributeId));
    const available = (attributes.data ?? []).filter((a) => !usedAttributeIds.has(a.id));

    /**
     * Row identifier uses the RHF synthetic `f.id` rather than `attributeId` so React keys
     * stay unique even if two field-array entries transiently share the same attribute_id
     * (e.g. during a drag, a promote/demote flip, or stale seed data). Lookups back to the
     * field array use the same id, so identity is preserved end-to-end.
     */
    type RowId = `link:${string}` | `custom:${string}`;

    /**
     * Visible rows = every taxonomy link with `usedForVariation=false` + every custom row.
     * Filtering is purely visual — the underlying field arrays still hold every link, so
     * flipping a link's discriminator from the Choices card moves it here without a re-insert.
     */
    const visibleRowIds = useMemo<RowId[]>(() => {
        const ids: RowId[] = [];
        for (let i = 0; i < links.fields.length; i += 1) {
            const v = getValues(`attributeLinks.${i}.usedForVariation`);
            if (v === false) ids.push(`link:${links.fields[i]!.id}` as RowId);
        }
        for (const f of customs.fields) ids.push(`custom:${f.id}` as RowId);
        return ids;
    }, [links.fields, customs.fields, getValues]);

    const [expanded, setExpanded] = useState<Set<RowId>>(() => new Set());

    useEffect(() => {
        setExpanded((prev) => {
            if (prev.size === 0) return prev;
            const live = new Set(visibleRowIds);
            const next = new Set<RowId>();
            for (const id of prev) if (live.has(id)) next.add(id);
            return next.size === prev.size ? prev : next;
        });
    }, [visibleRowIds]);

    const toggleExpand = (id: RowId) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const expandAll = () => setExpanded(new Set(visibleRowIds));
    const collapseAll = () => setExpanded(new Set());

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const [autoExpandLastLink, setAutoExpandLastLink] = useState(false);
    const appendFromTaxonomy = (attributeId: number) => {
        links.append({
            attributeId,
            position: links.fields.length,
            visible: true,
            usedForVariation: false,
            displayType: "dropdown",
            termIds: [],
        });
        setAutoExpandLastLink(true);
    };
    useEffect(() => {
        if (!autoExpandLastLink) return;
        const last = links.fields[links.fields.length - 1];
        if (last !== undefined) setExpanded((prev) => new Set(prev).add(`link:${last.id}` as RowId));
        setAutoExpandLastLink(false);
    }, [autoExpandLastLink, links.fields]);

    const [autoExpandLastCustom, setAutoExpandLastCustom] = useState(false);
    const appendFreeForm = () => {
        customs.append({
            name: "",
            values: [] as string[],
            position: customs.fields.length,
            visible: true,
        });
        setAutoExpandLastCustom(true);
    };
    useEffect(() => {
        if (!autoExpandLastCustom) return;
        const last = customs.fields[customs.fields.length - 1];
        if (last !== undefined) setExpanded((prev) => new Set(prev).add(`custom:${last.id}` as RowId));
        setAutoExpandLastCustom(false);
    }, [autoExpandLastCustom, customs.fields]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = visibleRowIds.indexOf(active.id as RowId);
        const newIndex = visibleRowIds.indexOf(over.id as RowId);
        if (oldIndex === -1 || newIndex === -1) return;
        const next = arrayMove(visibleRowIds, oldIndex, newIndex);
        const newLinkOrder: string[] = [];
        const newCustomOrder: string[] = [];
        for (const id of next) {
            if (id.startsWith("link:")) newLinkOrder.push(id.slice("link:".length));
            else newCustomOrder.push(id.slice("custom:".length));
        }
        const currentLinkIds: string[] = links.fields.map((f) => f.id);
        for (let target = 0; target < newLinkOrder.length; target += 1) {
            const desiredId = newLinkOrder[target]!;
            const currentPos = currentLinkIds.indexOf(desiredId);
            if (currentPos !== -1 && currentPos !== target) {
                links.move(currentPos, target);
                const [moved] = currentLinkIds.splice(currentPos, 1);
                currentLinkIds.splice(target, 0, moved!);
            }
        }
        const currentCustomIds: string[] = customs.fields.map((f) => f.id);
        for (let target = 0; target < newCustomOrder.length; target += 1) {
            const desiredId = newCustomOrder[target]!;
            const currentPos = currentCustomIds.indexOf(desiredId);
            if (currentPos !== -1 && currentPos !== target) {
                customs.move(currentPos, target);
                const [moved] = currentCustomIds.splice(currentPos, 1);
                currentCustomIds.splice(target, 0, moved!);
            }
        }
    };

    /**
     * Promote a from-taxonomy spec to a customer choice in place — flip `usedForVariation=true`
     * so the link starts being rendered by the Choices card. No row delete/insert, so existing
     * variations stay correctly indexed on the term ids the operator already picked.
     */
    const promoteToChoice = (attributeId: number) => {
        const idx = links.fields.findIndex((f) => f.attributeId === attributeId);
        if (idx === -1) return;
        links.update(idx, { ...links.fields[idx]!, usedForVariation: true });
    };

    const isEmpty = visibleRowIds.length === 0;

    return (
        <div className="flex flex-col gap-3">
            {isEmpty ? (
                <OnboardingHint
                    variant="inline"
                    id="specs.empty"
                    icon={Tag}
                    title={t("title")}
                    description={
                        <>
                            <span>{t("empty")}</span>
                            {productType === "simple" ? (
                                <>
                                    <br />
                                    <span className="mt-1 inline-block text-foreground">{t("emptyWantChoicesHint")}</span>
                                </>
                            ) : null}
                        </>
                    }
                    dismissible={false}
                    cta={
                        productType === "simple" && onRequestVariableType !== undefined
                            ? { label: t("switchToMultipleCta"), onClick: onRequestVariableType }
                            : undefined
                    }
                />
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <Select
                    value=""
                    onValueChange={(next) => {
                        if (typeof next === "string" && next.length > 0) appendFromTaxonomy(Number(next));
                    }}
                >
                    <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder={t("addFromTaxonomy")}>
                            {() => <span className="text-muted-foreground">{t("addFromTaxonomy")}</span>}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {available.length === 0 ? (
                            <p className="px-2 py-2 text-muted-foreground text-xs">—</p>
                        ) : (
                            available.map((a) => (
                                <SelectItem key={a.id} value={String(a.id)}>
                                    {a.name}
                                </SelectItem>
                            ))
                        )}
                    </SelectContent>
                </Select>

                <Button type="button" variant="outline" size="sm" onClick={appendFreeForm}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t("addFreeForm")}
                </Button>

                {!isEmpty ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ms-auto"
                        onClick={expanded.size > 0 ? collapseAll : expandAll}
                    >
                        {expanded.size > 0 ? t("collapseAll") : t("expandAll")}
                    </Button>
                ) : null}
            </div>

            {visibleRowIds.length > 0 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={visibleRowIds} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-2">
                            {visibleRowIds.map((rowId) => {
                                if (rowId.startsWith("link:")) {
                                    const fieldId = rowId.slice("link:".length);
                                    const index = links.fields.findIndex((f) => f.id === fieldId);
                                    if (index === -1) return null;
                                    const attributeId = links.fields[index]!.attributeId;
                                    return (
                                        <SpecLinkRow
                                            key={rowId}
                                            rowId={rowId}
                                            index={index}
                                            expanded={expanded.has(rowId)}
                                            onToggleExpand={() => toggleExpand(rowId)}
                                            onRemove={() => links.remove(index)}
                                            onPromote={() => promoteToChoice(attributeId)}
                                            locale={locale}
                                            labels={{
                                                showOnPage: t("row.showOnProductPage"),
                                                showOnPageTooltip: t("row.showOnProductPageTooltip"),
                                                clear: t("row.clear"),
                                                dragHandle: tLinks("row.dragHandle"),
                                                dragTooltip: tLinks("row.dragTooltip"),
                                                expand: tLinks("row.expand"),
                                                collapse: tLinks("row.collapse"),
                                                valueCount: (count: number) =>
                                                    t("row.valueCount", { count: formatNumber(count, locale) }),
                                                values: tLinks("row.terms"),
                                                selectAll: tLinks("row.selectAll"),
                                                selectNone: tLinks("row.selectNone"),
                                                createValue: tLinks("row.createValue"),
                                                createFailed: tLinks("createTermFailed"),
                                                nameLabel: tLinks("row.nameLabel"),
                                                multiValueWarning: t("multiValueWarning"),
                                                multiValuePromote: t("multiValueWarningPromote"),
                                            }}
                                        />
                                    );
                                }
                                const fieldId = rowId.slice("custom:".length);
                                const index = customs.fields.findIndex((f) => f.id === fieldId);
                                if (index === -1) return null;
                                return (
                                    <SpecCustomRow
                                        key={rowId}
                                        rowId={rowId}
                                        index={index}
                                        expanded={expanded.has(rowId)}
                                        onToggleExpand={() => toggleExpand(rowId)}
                                        onRemove={() => customs.remove(index)}
                                        locale={locale}
                                        labels={{
                                            showOnPage: t("row.showOnProductPage"),
                                            showOnPageTooltip: t("row.showOnProductPageTooltip"),
                                            clear: t("row.clear"),
                                            dragHandle: tLinks("row.dragHandle"),
                                            dragTooltip: tLinks("row.dragTooltip"),
                                            expand: tLinks("row.expand"),
                                            collapse: tLinks("row.collapse"),
                                            valueCount: (count: number) =>
                                                t("row.valueCount", { count: formatNumber(count, locale) }),
                                            nameLabel: t("row.name"),
                                            namePlaceholder: t("row.namePlaceholder"),
                                            untitled: t("row.untitled"),
                                            valuesLabel: t("row.values"),
                                            valuesPlaceholder: t("row.valuesPlaceholder"),
                                            valuesHelp: tLinks("newAttribute.valuesHelp"),
                                            removeChip: tLinks("row.remove"),
                                            multiValueWarning: t("multiValueWarning"),
                                            multiValueKeep: t("multiValueWarningKeep"),
                                            multiValuePromote: t("multiValueWarningPromote"),
                                            cannotPromote: t("freeFormCannotBeChoice"),
                                        }}
                                    />
                                );
                            })}
                        </ul>
                    </SortableContext>
                </DndContext>
            ) : null}
        </div>
    );
}

interface SpecLinkRowProps {
    rowId: string;
    index: number;
    expanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    onPromote: () => void;
    locale: Locale;
    labels: {
        showOnPage: string;
        showOnPageTooltip: string;
        clear: string;
        dragHandle: string;
        dragTooltip: string;
        expand: string;
        collapse: string;
        valueCount: (count: number) => string;
        values: string;
        selectAll: string;
        selectNone: string;
        createValue: string;
        createFailed: string;
        nameLabel: string;
        multiValueWarning: string;
        multiValuePromote: string;
    };
}

/** From-taxonomy spec row — read-only attribute name + sortable term chip strip. */
function SpecLinkRow({ rowId, index, expanded, onToggleExpand, onRemove, onPromote, labels }: SpecLinkRowProps) {
    const { control, watch } = useFormContext<ProductDetailFormValues>();
    const link = watch(`attributeLinks.${index}`);
    const attributes = useGlobalAttributes();
    const attribute = attributes.data?.find((a) => a.id === link.attributeId);
    const visibleId = useId();
    const { setNodeRef, attributes: dragAttrs, listeners, transform, transition, isDragging } = useSortable({ id: rowId });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
    const title = attribute?.name ?? `#${link.attributeId}`;
    const showPromote = link.termIds.length >= 2;

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
                onRemove={onRemove}
                title={title}
                countBadge={link.termIds.length > 0 ? labels.valueCount(link.termIds.length) : null}
                dragHandleLabel={labels.dragHandle}
                dragHandleTooltip={labels.dragTooltip}
                expandLabel={labels.expand}
                collapseLabel={labels.collapse}
                removeLabel={labels.clear}
            />
            {expanded ? (
                <div className="flex flex-col gap-3 border-border/60 border-t px-3 pt-2 pb-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <span>{labels.nameLabel}:</span>
                        <span className="text-foreground">{title}</span>
                    </div>
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
                    <Controller
                        control={control}
                        name={`attributeLinks.${index}.visible`}
                        render={({ field }) => (
                            <label htmlFor={visibleId} className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                    id={visibleId}
                                    checked={field.value}
                                    onCheckedChange={(next) => field.onChange(next === true)}
                                />
                                <span>{labels.showOnPage}</span>
                                <HelperTooltip>{labels.showOnPageTooltip}</HelperTooltip>
                            </label>
                        )}
                    />
                    {showPromote ? (
                        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                            <div className="flex flex-1 flex-col gap-1">
                                <span className="text-foreground">{labels.multiValueWarning}</span>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onPromote}>
                                        {labels.multiValuePromote}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

interface SpecCustomRowProps {
    rowId: string;
    index: number;
    expanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    locale: Locale;
    labels: {
        showOnPage: string;
        showOnPageTooltip: string;
        clear: string;
        dragHandle: string;
        dragTooltip: string;
        expand: string;
        collapse: string;
        valueCount: (count: number) => string;
        nameLabel: string;
        namePlaceholder: string;
        untitled: string;
        valuesLabel: string;
        valuesPlaceholder: string;
        valuesHelp: string;
        removeChip: string;
        multiValueWarning: string;
        multiValueKeep: string;
        multiValuePromote: string;
        cannotPromote: string;
    };
}

/** Free-form spec row — editable name + chip values + visibility. Never feeds variations. */
function SpecCustomRow({ rowId, index, expanded, onToggleExpand, onRemove, labels }: SpecCustomRowProps) {
    const { control, watch } = useFormContext<ProductDetailFormValues>();
    const row = watch(`customAttributes.${index}`);
    const valueCount = row?.values.length ?? 0;
    const displayName = row?.name.trim().length === 0 ? labels.untitled : (row?.name ?? labels.untitled);
    const nameId = useId();
    const visibleId = useId();
    const { setNodeRef, attributes: dragAttrs, listeners, transform, transition, isDragging } = useSortable({ id: rowId });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

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
                onRemove={onRemove}
                title={displayName}
                countBadge={valueCount > 0 ? labels.valueCount(valueCount) : null}
                dragHandleLabel={labels.dragHandle}
                dragHandleTooltip={labels.dragTooltip}
                expandLabel={labels.expand}
                collapseLabel={labels.collapse}
                removeLabel={labels.clear}
            />
            {expanded ? (
                <div className="flex flex-col gap-3 border-border/60 border-t px-3 pt-2 pb-3">
                    <Controller
                        control={control}
                        name={`customAttributes.${index}.name`}
                        render={({ field }) => (
                            <label htmlFor={nameId} className="flex flex-col gap-1 text-xs">
                                <span className="text-muted-foreground">{labels.nameLabel}</span>
                                <Input
                                    id={nameId}
                                    value={field.value}
                                    onChange={(event) => field.onChange(event.target.value)}
                                    placeholder={labels.namePlaceholder}
                                    className="h-8"
                                />
                            </label>
                        )}
                    />
                    <Controller
                        control={control}
                        name={`customAttributes.${index}.values`}
                        render={({ field }) => (
                            <CustomChipInput
                                values={field.value}
                                onChange={field.onChange}
                                placeholder={labels.valuesPlaceholder}
                                label={labels.valuesLabel}
                                help={labels.valuesHelp}
                                removeAria={labels.removeChip}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name={`customAttributes.${index}.visible`}
                        render={({ field }) => (
                            <label htmlFor={visibleId} className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                    id={visibleId}
                                    checked={field.value}
                                    onCheckedChange={(next) => field.onChange(next === true)}
                                />
                                <span>{labels.showOnPage}</span>
                                <HelperTooltip>{labels.showOnPageTooltip}</HelperTooltip>
                            </label>
                        )}
                    />
                    {valueCount >= 2 ? (
                        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                            <div className="flex flex-1 flex-col gap-1">
                                <span className="text-foreground">{labels.multiValueWarning}</span>
                                <span className="text-muted-foreground">{labels.cannotPromote}</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}
