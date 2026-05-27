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
    horizontalListSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocale, useTranslations } from "next-intl";
import {
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
    useEffect,
    useId,
    useMemo,
    useState,
} from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { toast } from "#/components/ui/toast";
import { ChevronDown, ChevronRight, GripVertical, Loader2, Plus, Save, Tag, Trash2, X } from "#/icons";
import { formatNumber } from "#/lib/format";
import { useCreateAttributeTerm, useUpdateProduct } from "#/lib/products/mutations";
import { useGlobalAttributes, useGlobalAttributeTerms } from "#/lib/products/queries";
import { cn } from "#/lib/utils";

import { formValuesToPayload, type ProductDetailFormValues } from "../schema";

type ProductType = "simple" | "variable" | "grouped" | "external";

interface AttributesBodyProps {
    productType: ProductType;
    productId: number | null;
    ifMatch?: string;
}

/**
 * Stable row identity. `attributeLinks` keys off `global:<attributeId>`; the custom-attributes
 * sibling slice uses `custom:<index>` (the field-array index stays stable across renders thanks
 * to react-hook-form's internal id).
 */
type RowId = `global:${number}` | `custom:${string}`;

/**
 * Attributes card body. Two row kinds share one sortable list and one expand/collapse state:
 *
 *   - **Global rows** — bound to {@link ProductDetailFormValues.attributeLinks}. Picked from the
 *     site-wide taxonomy via the toolbar's "موجود را اضافه کنید" select. The five wire fields
 *     ({@link AttributeLink.attributeId}, position, visible, used_for_variation, term_ids) are the
 *     load-bearing contract the variations cartesian generator reads — adding new fields here
 *     would break that contract.
 *   - **Custom rows** — bound to {@link ProductDetailFormValues.customAttributes}. Operator-typed
 *     name + chip values, persisted to the `product_custom_attributes` sibling table. They never
 *     feed variation generation; the toggle is permanently off + disabled with a HelperTooltip.
 *
 * The card defaults every row to collapsed. The row the operator just appended auto-expands so
 * they can fill in terms immediately. The bottom "ذخیره ویژگی‌ها" button PATCHes only the two
 * attribute slices (plus optional `If-Match`) so operators can commit attribute changes without
 * touching the rest of the form payload.
 */
export function AttributesBody({ productType, productId, ifMatch }: AttributesBodyProps) {
    const t = useTranslations("Products.detail.attributes");
    const locale = useLocale() as Locale;
    const { control, getValues, reset, formState } = useFormContext<ProductDetailFormValues>();
    const globals = useFieldArray({ control, name: "attributeLinks" });
    const customs = useFieldArray({ control, name: "customAttributes" });
    const attributes = useGlobalAttributes();
    const updateProduct = useUpdateProduct(productId ?? 0);

    const [expanded, setExpanded] = useState<Set<RowId>>(() => new Set());
    const usedAttributeIds = new Set(globals.fields.map((f) => f.attributeId));
    const available = (attributes.data ?? []).filter((a) => !usedAttributeIds.has(a.id));

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const orderedRowIds = useMemo<RowId[]>(() => {
        const ids: RowId[] = [];
        for (const f of globals.fields) ids.push(`global:${f.attributeId}` as RowId);
        for (const f of customs.fields) ids.push(`custom:${f.id}` as RowId);
        return ids;
    }, [globals.fields, customs.fields]);

    /**
     * Drop any expand-key whose row is no longer in the list (after a `remove` or a rename). Keeps
     * the open set small and avoids stale ids re-expanding a future row that happened to land on
     * the same key.
     */
    useEffect(() => {
        setExpanded((prev) => {
            if (prev.size === 0) return prev;
            const live = new Set(orderedRowIds);
            const next = new Set<RowId>();
            for (const id of prev) if (live.has(id)) next.add(id);
            return next.size === prev.size ? prev : next;
        });
    }, [orderedRowIds]);

    const toggleExpand = (id: RowId) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const expandAll = () => setExpanded(new Set(orderedRowIds));
    const collapseAll = () => setExpanded(new Set());

    const appendGlobal = (attributeId: number) => {
        globals.append({
            attributeId,
            position: globals.fields.length,
            visible: true,
            usedForVariation: productType === "variable",
            termIds: [],
        });
        setExpanded((prev) => new Set(prev).add(`global:${attributeId}` as RowId));
    };

    const appendCustom = () => {
        const draft = {
            name: "",
            values: [] as string[],
            position: customs.fields.length,
            visible: true,
        };
        customs.append(draft);
        /**
         * The new row's react-hook-form id is assigned synchronously inside `append`, but we can't
         * read it back from `customs.fields` here — the array hasn't re-rendered yet. Expand on the
         * NEXT render via the `customs.fields.length` watcher just below.
         */
        setAutoExpandLastCustom(true);
    };

    const [autoExpandLastCustom, setAutoExpandLastCustom] = useState(false);
    useEffect(() => {
        if (!autoExpandLastCustom) return;
        const last = customs.fields[customs.fields.length - 1];
        if (last !== undefined) {
            setExpanded((prev) => new Set(prev).add(`custom:${last.id}` as RowId));
        }
        setAutoExpandLastCustom(false);
    }, [autoExpandLastCustom, customs.fields]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = orderedRowIds.indexOf(active.id as RowId);
        const newIndex = orderedRowIds.indexOf(over.id as RowId);
        if (oldIndex === -1 || newIndex === -1) return;
        const next = arrayMove(orderedRowIds, oldIndex, newIndex);
        const newGlobalOrder: number[] = [];
        const newCustomOrder: string[] = [];
        for (const id of next) {
            if (id.startsWith("global:")) {
                newGlobalOrder.push(Number(id.slice("global:".length)));
            } else {
                newCustomOrder.push(id.slice("custom:".length));
            }
        }
        /**
         * Translate the desired row order back into field-array indices and use `move` so RHF keeps
         * its internal ids stable; reordering by `setValue` would mint fresh ids and collapse every
         * open row.
         */
        const currentGlobalAttrIds = globals.fields.map((f) => f.attributeId);
        for (let target = 0; target < newGlobalOrder.length; target += 1) {
            const desiredId = newGlobalOrder[target]!;
            const currentPos = currentGlobalAttrIds.indexOf(desiredId);
            if (currentPos !== -1 && currentPos !== target) {
                globals.move(currentPos, target);
                /** Reflect the move in our local mirror so the next iteration finds the right index. */
                const [moved] = currentGlobalAttrIds.splice(currentPos, 1);
                currentGlobalAttrIds.splice(target, 0, moved!);
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

    const handleSave = async () => {
        if (productId === null) return;
        try {
            const payload = formValuesToPayload(getValues());
            await updateProduct.mutateAsync({
                body: {
                    attribute_links: payload.attribute_links,
                    custom_attributes: payload.custom_attributes,
                },
                ifMatch,
            });
            /**
             * Re-mount the form values so the attribute slices are no longer dirty. Other dirty
             * fields keep their state — `reset(getValues())` clears the dirty flag without losing
             * concurrent edits the operator may be making in other cards.
             */
            reset(getValues(), { keepValues: true, keepDirty: false });
            toast.add({ title: t("savedToast"), data: { tone: "success" } });
        } catch (error) {
            toast.add({ title: t("saveFailedToast"), description: String(error), data: { tone: "error" } });
        }
    };

    const isEmpty = globals.fields.length === 0 && customs.fields.length === 0;

    return (
        <div className="flex flex-col gap-3">
            {isEmpty ? (
                <OnboardingHint
                    variant="card"
                    id="attributes.empty"
                    icon={Tag}
                    title={t("empty.title")}
                    description={t("empty.description")}
                />
            ) : null}

            <AttributesToolbar
                available={available}
                onPickGlobal={appendGlobal}
                onAddCustom={appendCustom}
                anyExpanded={expanded.size > 0}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                hasRows={!isEmpty}
            />

            {orderedRowIds.length > 0 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={orderedRowIds} strategy={verticalListSortingStrategy}>
                        <ul className="flex flex-col gap-2">
                            {orderedRowIds.map((rowId) => {
                                if (rowId.startsWith("global:")) {
                                    const attributeId = Number(rowId.slice("global:".length));
                                    const index = globals.fields.findIndex((f) => f.attributeId === attributeId);
                                    if (index === -1) return null;
                                    return (
                                        <GlobalRow
                                            key={rowId}
                                            rowId={rowId}
                                            index={index}
                                            productType={productType}
                                            expanded={expanded.has(rowId)}
                                            onToggleExpand={() => toggleExpand(rowId)}
                                            onRemove={() => globals.remove(index)}
                                            locale={locale}
                                        />
                                    );
                                }
                                const fieldId = rowId.slice("custom:".length);
                                const index = customs.fields.findIndex((f) => f.id === fieldId);
                                if (index === -1) return null;
                                return (
                                    <CustomRow
                                        key={rowId}
                                        rowId={rowId}
                                        index={index}
                                        productType={productType}
                                        expanded={expanded.has(rowId)}
                                        onToggleExpand={() => toggleExpand(rowId)}
                                        onRemove={() => customs.remove(index)}
                                        locale={locale}
                                    />
                                );
                            })}
                        </ul>
                    </SortableContext>
                </DndContext>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-border border-t pt-3">
                <span className="text-muted-foreground text-xs">
                    {customs.fields.length > 0 && formState.isDirty
                        ? t("customNotSavedWarning", { count: customs.fields.length })
                        : ""}
                </span>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={productId === null || !formState.isDirty || updateProduct.isPending}
                >
                    {updateProduct.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                        <Save className="size-3.5" aria-hidden="true" />
                    )}
                    {t("saveButton")}
                </Button>
            </div>
        </div>
    );
}

interface AttributesToolbarProps {
    available: { id: number; name: string }[];
    onPickGlobal: (attributeId: number) => void;
    onAddCustom: () => void;
    anyExpanded: boolean;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    hasRows: boolean;
}

/**
 * Top-of-card toolbar. Drawn start-to-end (RTL-aware): a disclosure select for the global pool,
 * an outline button for custom rows, and a single text link toggling expand-all / collapse-all.
 * The select uses a controlled-empty value so the placeholder shows again after each pick.
 */
function AttributesToolbar({
    available,
    onPickGlobal,
    onAddCustom,
    anyExpanded,
    onExpandAll,
    onCollapseAll,
    hasRows,
}: AttributesToolbarProps) {
    const t = useTranslations("Products.detail.attributes");
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select
                value=""
                onValueChange={(next) => {
                    if (typeof next === "string" && next.length > 0) onPickGlobal(Number(next));
                }}
            >
                <SelectTrigger className="h-9 w-56">
                    <SelectValue placeholder={t("toolbar.addExisting")}>
                        {() => <span className="text-muted-foreground">{t("toolbar.addExisting")}</span>}
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

            <Button type="button" variant="outline" size="sm" onClick={onAddCustom}>
                <Plus className="size-3.5" aria-hidden="true" />
                {t("toolbar.addNew")}
            </Button>

            {hasRows ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ms-auto"
                    onClick={anyExpanded ? onCollapseAll : onExpandAll}
                >
                    {anyExpanded ? t("toolbar.collapseAll") : t("toolbar.expandAll")}
                </Button>
            ) : null}
        </div>
    );
}

interface GlobalRowProps {
    rowId: RowId;
    index: number;
    productType: ProductType;
    expanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    locale: Locale;
}

/**
 * Sortable row bound to a single {@link ProductDetailFormValues.attributeLinks} entry. The grip
 * icon is the only drag activator (so the chevron, chips, and checkboxes stay clickable).
 */
function GlobalRow({ rowId, index, productType, expanded, onToggleExpand, onRemove, locale }: GlobalRowProps) {
    const t = useTranslations("Products.detail.attributes");
    const { control, watch } = useFormContext<ProductDetailFormValues>();
    const link = watch(`attributeLinks.${index}`);
    const attributes = useGlobalAttributes();
    const attribute = attributes.data?.find((a) => a.id === link.attributeId);
    const isVariable = productType === "variable";
    const visibleId = useId();
    const variationId = useId();

    const { setNodeRef, attributes: dragAttrs, listeners, transform, transition, isDragging } = useSortable({ id: rowId });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

    return (
        <li
            ref={setNodeRef}
            style={style}
            {...dragAttrs}
            className={cn(
                "group rounded-md border border-border bg-background",
                isDragging && "z-10 opacity-70 ring-2 ring-primary/40",
            )}
        >
            <RowHeader
                listeners={listeners}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onRemove={onRemove}
                title={attribute?.name ?? `#${link.attributeId}`}
                termCountLabel={
                    link.termIds.length > 0 ? t("row.termCount", { count: formatNumber(link.termIds.length, locale) }) : null
                }
            />
            {expanded ? (
                <div className="flex flex-col gap-3 border-border/60 border-t px-3 pt-2 pb-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <span>{t("row.nameLabel")}:</span>
                        <span className="text-foreground">{attribute?.name ?? `#${link.attributeId}`}</span>
                    </div>
                    <Controller
                        control={control}
                        name={`attributeLinks.${index}.termIds`}
                        render={({ field }) => (
                            <GlobalRowTerms attributeId={link.attributeId} termIds={field.value} onChange={field.onChange} />
                        )}
                    />
                    <div className="flex flex-col gap-2 text-xs">
                        <Controller
                            control={control}
                            name={`attributeLinks.${index}.visible`}
                            render={({ field }) => (
                                <label htmlFor={visibleId} className="flex cursor-pointer items-center gap-2">
                                    <Checkbox
                                        id={visibleId}
                                        checked={field.value}
                                        onCheckedChange={(next) => field.onChange(next === true)}
                                    />
                                    <span>{t("row.showOnProductPage")}</span>
                                    <HelperTooltip>{t("tooltips.showOnProductPage")}</HelperTooltip>
                                </label>
                            )}
                        />
                        <Controller
                            control={control}
                            name={`attributeLinks.${index}.usedForVariation`}
                            render={({ field }) => (
                                <label
                                    htmlFor={variationId}
                                    className={cn("flex items-center gap-2", isVariable ? "cursor-pointer" : "opacity-70")}
                                >
                                    <Checkbox
                                        id={variationId}
                                        checked={isVariable && field.value}
                                        disabled={!isVariable}
                                        onCheckedChange={(next) => field.onChange(next === true)}
                                    />
                                    <span>{t("row.useForVariations")}</span>
                                    <HelperTooltip>
                                        {isVariable ? t("tooltips.useForVariations") : t("tooltips.useForVariationsDisabled")}
                                    </HelperTooltip>
                                </label>
                            )}
                        />
                    </div>
                </div>
            ) : null}
        </li>
    );
}

interface CustomRowProps {
    rowId: RowId;
    index: number;
    productType: ProductType;
    expanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    locale: Locale;
}

/**
 * Sortable row bound to a {@link ProductDetailFormValues.customAttributes} entry. Editable name
 * + chip-style values (Enter commits, backspace on an empty input deletes the last chip). The
 * "Use for variations" checkbox is permanently disabled — custom rows never feed the cartesian
 * generator.
 */
function CustomRow({ rowId, index, productType: _productType, expanded, onToggleExpand, onRemove, locale }: CustomRowProps) {
    const t = useTranslations("Products.detail.attributes");
    const { control, watch } = useFormContext<ProductDetailFormValues>();
    const row = watch(`customAttributes.${index}`);
    const valueCount = row?.values.length ?? 0;
    const displayName = row?.name.trim().length === 0 ? t("newAttribute.untitled") : (row?.name ?? t("newAttribute.untitled"));
    const nameId = useId();
    const visibleId = useId();
    const variationId = useId();

    const { setNodeRef, attributes: dragAttrs, listeners, transform, transition, isDragging } = useSortable({ id: rowId });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

    return (
        <li
            ref={setNodeRef}
            style={style}
            {...dragAttrs}
            className={cn(
                "group rounded-md border border-border bg-background",
                isDragging && "z-10 opacity-70 ring-2 ring-primary/40",
            )}
        >
            <RowHeader
                listeners={listeners}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
                onRemove={onRemove}
                title={displayName}
                termCountLabel={valueCount > 0 ? t("row.termCount", { count: formatNumber(valueCount, locale) }) : null}
            />
            {expanded ? (
                <div className="flex flex-col gap-3 border-border/60 border-t px-3 pt-2 pb-3">
                    <Controller
                        control={control}
                        name={`customAttributes.${index}.name`}
                        render={({ field }) => (
                            <label htmlFor={nameId} className="flex flex-col gap-1 text-xs">
                                <span className="text-muted-foreground">{t("row.nameLabel")}</span>
                                <Input
                                    id={nameId}
                                    value={field.value}
                                    onChange={(event) => field.onChange(event.target.value)}
                                    placeholder={t("newAttribute.placeholderName")}
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
                                placeholder={t("newAttribute.valuesPlaceholder")}
                                help={t("newAttribute.valuesHelp")}
                            />
                        )}
                    />
                    <div className="flex flex-col gap-2 text-xs">
                        <Controller
                            control={control}
                            name={`customAttributes.${index}.visible`}
                            render={({ field }) => (
                                <label htmlFor={visibleId} className="flex cursor-pointer items-center gap-2">
                                    <Checkbox
                                        id={visibleId}
                                        checked={field.value}
                                        onCheckedChange={(next) => field.onChange(next === true)}
                                    />
                                    <span>{t("row.showOnProductPage")}</span>
                                    <HelperTooltip>{t("tooltips.showOnProductPage")}</HelperTooltip>
                                </label>
                            )}
                        />
                        <label htmlFor={variationId} className="flex items-center gap-2 opacity-70">
                            <Checkbox id={variationId} checked={false} disabled />
                            <span>{t("row.useForVariations")}</span>
                            <HelperTooltip>{t("tooltips.useForVariationsCustom")}</HelperTooltip>
                        </label>
                    </div>
                </div>
            ) : null}
        </li>
    );
}

interface RowHeaderProps {
    listeners: ReturnType<typeof useSortable>["listeners"];
    expanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    title: string;
    termCountLabel: string | null;
}

/** Always-visible collapsed bar: grip + chevron + title + optional count badge + clear link. */
function RowHeader({ listeners, expanded, onToggleExpand, onRemove, title, termCountLabel }: RowHeaderProps) {
    const t = useTranslations("Products.detail.attributes");
    return (
        <div className="flex items-center gap-2 px-2 py-1.5">
            <button
                type="button"
                aria-label={t("row.dragHandle")}
                title={t("row.dragTooltip")}
                {...listeners}
                className="grid size-6 cursor-grab place-items-center text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
            >
                <GripVertical className="size-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                aria-label={expanded ? t("row.collapse") : t("row.expand")}
                aria-expanded={expanded}
                onClick={onToggleExpand}
                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
                {expanded ? (
                    <ChevronDown className="size-4" aria-hidden="true" />
                ) : (
                    <ChevronRight className="size-4" data-rtl-flip aria-hidden="true" />
                )}
            </button>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">{title}</span>
            {termCountLabel !== null ? (
                <Badge variant="secondary" className="tabular-nums">
                    {termCountLabel}
                </Badge>
            ) : null}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                onClick={onRemove}
            >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t("row.clear")}
            </Button>
        </div>
    );
}

interface GlobalRowTermsProps {
    attributeId: number;
    termIds: number[];
    onChange: (next: number[]) => void;
}

/**
 * Term chip strip for a global attribute. Each chip is a toggle, plus an inline-create trigger
 * at the end fires `POST /admin/attributes/:id/terms`. Active-chip ordering is drag-reorderable
 * via dnd-kit's horizontal strategy — once `termIds` reflects the new order, the variations
 * generator (which reads `termIds` directly) renders combinations in operator-chosen sequence.
 */
function GlobalRowTerms({ attributeId, termIds, onChange }: GlobalRowTermsProps) {
    const t = useTranslations("Products.detail.attributes");
    const terms = useGlobalAttributeTerms(attributeId);
    const createTerm = useCreateAttributeTerm(attributeId);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over === null || active.id === over.id) return;
        const oldIndex = termIds.indexOf(Number(active.id));
        const newIndex = termIds.indexOf(Number(over.id));
        if (oldIndex === -1 || newIndex === -1) return;
        onChange(arrayMove(termIds, oldIndex, newIndex));
    };

    const toggle = (termId: number) => {
        onChange(termIds.includes(termId) ? termIds.filter((id) => id !== termId) : [...termIds, termId]);
    };

    const allIds = (terms.data ?? []).map((term) => term.id);
    const selectAll = () => onChange(allIds);
    const selectNone = () => onChange([]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <span>{t("row.terms")}</span>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectAll}>
                    {t("row.selectAll")}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectNone}>
                    {t("row.selectNone")}
                </Button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={termIds} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {(terms.data ?? []).map((term) => {
                            const active = termIds.includes(term.id);
                            return (
                                <TermChip
                                    key={term.id}
                                    id={term.id}
                                    active={active}
                                    sortable={active}
                                    label={term.name}
                                    onClick={() => toggle(term.id)}
                                />
                            );
                        })}
                        <InlineTermCreator
                            placeholder={t("row.createValue")}
                            busy={createTerm.isPending}
                            onCreate={async (name) => {
                                try {
                                    const result = await createTerm.mutateAsync({ name });
                                    onChange([...termIds, result.data.id]);
                                } catch (error) {
                                    toast.add({
                                        title: t("createTermFailed"),
                                        description: String(error),
                                        data: { tone: "error" },
                                    });
                                }
                            }}
                        />
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}

interface TermChipProps {
    id: number;
    active: boolean;
    sortable: boolean;
    label: string;
    onClick: () => void;
}

/**
 * One term chip. When `sortable` is true the chip becomes a drag handle so the active selection
 * order can be reshuffled inline; inactive chips stay click-to-toggle only (they aren't part of
 * `termIds`, so there's nothing to reorder).
 */
function TermChip({ id, active, sortable, label, onClick }: TermChipProps) {
    const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
        id,
        disabled: !sortable,
    });
    const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
    return (
        <button
            ref={setNodeRef}
            style={style}
            type="button"
            onClick={onClick}
            {...attributes}
            {...(sortable ? listeners : {})}
            className={cn(
                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                active
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-ring/40",
                sortable && "cursor-grab active:cursor-grabbing",
                isDragging && "opacity-70 ring-2 ring-primary/40",
            )}
        >
            {label}
        </button>
    );
}

interface InlineTermCreatorProps {
    placeholder: string;
    onCreate: (name: string) => Promise<void>;
    busy: boolean;
}

/**
 * Compact text input that turns Enter into `POST /admin/attributes/:id/terms`. Sits at the end
 * of the chip strip; on success the parent adds the new id to `termIds`, so the new chip lands
 * already-selected.
 */
function InlineTermCreator({ placeholder, onCreate, busy }: InlineTermCreatorProps) {
    const [value, setValue] = useState("");
    const handleKeyDown = async (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter") return;
        const trimmed = value.trim();
        if (trimmed.length === 0 || busy) return;
        event.preventDefault();
        await onCreate(trimmed);
        setValue("");
    };
    return (
        <input
            type="text"
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => void handleKeyDown(event)}
            placeholder={placeholder}
            className="h-7 rounded border border-border border-dashed bg-transparent px-2 text-xs outline-none focus:border-ring"
        />
    );
}

interface CustomChipInputProps {
    values: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
    help: ReactNode;
}

/**
 * Chip-style input for the custom-row "values" field. Enter commits the current text as a chip;
 * Backspace on an empty input deletes the previous chip. Duplicate values are ignored so the
 * operator can't accidentally split a chip strip with two identical entries.
 */
function CustomChipInput({ values, onChange, placeholder, help }: CustomChipInputProps) {
    const t = useTranslations("Products.detail.attributes");
    const [draft, setDraft] = useState("");

    const commit = (text: string) => {
        const trimmed = text.trim();
        if (trimmed.length === 0) return;
        if (values.includes(trimmed)) return;
        onChange([...values, trimmed]);
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
            setDraft("");
            return;
        }
        if (event.key === "Backspace" && draft.length === 0 && values.length > 0) {
            event.preventDefault();
            onChange(values.slice(0, -1));
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">{t("row.terms")}</span>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background p-1.5">
                {values.map((value, valueIndex) => (
                    <span
                        key={value}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 text-foreground text-xs"
                    >
                        {value}
                        <button
                            type="button"
                            aria-label={t("row.remove")}
                            onClick={() => onChange(values.filter((_, i) => i !== valueIndex))}
                            className="grid size-4 place-items-center rounded hover:bg-background/60 hover:text-destructive"
                        >
                            <X className="size-3" aria-hidden="true" />
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="h-6 min-w-32 flex-1 bg-transparent text-xs outline-none"
                />
            </div>
            <span className="text-muted-foreground text-xs leading-relaxed">{help}</span>
        </div>
    );
}
