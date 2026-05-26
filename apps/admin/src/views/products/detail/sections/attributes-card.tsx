"use client";

import { Plus, Tag, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { Button } from "#/components/ui/button";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { OnboardingHint } from "#/components/ui/onboarding-hint";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import { useCreateAttribute, useCreateAttributeTerm } from "#/lib/products/mutations";
import { useGlobalAttributes, useGlobalAttributeTerms } from "#/lib/products/queries";
import { cn } from "#/lib/utils";

import { Field, ToggleRow } from "../form-primitives";
import type { ProductDetailFormValues } from "../schema";

/**
 * Attributes card body. Mounted inside the DraggableSectionGrid. Edits attribute_links — which
 * global attributes this product uses, with which terms, with which visibility + variation
 * eligibility flags. Custom attributes are created inline via `useCreateAttribute(isCustom=true)`
 * and become indistinguishable from global ones once saved.
 *
 * The "Use for variations" toggle is the load-bearing UX: it's the bridge between this card and
 * the Variations card. Toggling it off when variations already use the attribute opens a
 * confirmation dialog so the operator can't accidentally invalidate every variation.
 */
export function AttributesBody({ productType }: { productType: "simple" | "variable" | "grouped" | "external" }) {
    const t = useTranslations("Products.detail.attributes");
    const { control } = useFormContext<ProductDetailFormValues>();
    const { fields, append, remove } = useFieldArray({ control, name: "attributeLinks" });
    const attributes = useGlobalAttributes();
    const createAttribute = useCreateAttribute();
    const [customOpen, setCustomOpen] = useState(false);

    const usedAttributeIds = new Set(fields.map((f) => f.attributeId));

    if (fields.length === 0) {
        return (
            <div className="flex flex-col gap-4">
                <OnboardingHint
                    variant="card"
                    id="attributes.empty"
                    icon={Tag}
                    title={t("empty.title")}
                    description={t("empty.description")}
                />
                <div className="flex flex-wrap gap-2">
                    <AddExistingPopover
                        attributes={attributes.data ?? []}
                        usedAttributeIds={usedAttributeIds}
                        onPick={(id) =>
                            append({
                                attributeId: id,
                                position: 0,
                                visible: true,
                                usedForVariation: productType === "variable",
                                termIds: [],
                            })
                        }
                        label={t("empty.addExisting")}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setCustomOpen(true)}>
                        <Plus className="size-3.5" aria-hidden="true" />
                        {t("empty.addCustom")}
                    </Button>
                </div>
                {customOpen ? (
                    <AddCustomAttributeForm
                        onClose={() => setCustomOpen(false)}
                        onCreated={(id) => {
                            append({
                                attributeId: id,
                                position: 0,
                                visible: true,
                                usedForVariation: productType === "variable",
                                termIds: [],
                            });
                            setCustomOpen(false);
                        }}
                        createAttribute={createAttribute}
                        labels={t}
                    />
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {fields.map((field, index) => (
                <AttributeLinkRow key={field.id} index={index} productType={productType} onRemove={() => remove(index)} />
            ))}
            <div className="flex flex-wrap items-center gap-2 border-border border-t pt-3">
                <AddExistingPopover
                    attributes={attributes.data ?? []}
                    usedAttributeIds={usedAttributeIds}
                    onPick={(id) =>
                        append({
                            attributeId: id,
                            position: fields.length,
                            visible: true,
                            usedForVariation: productType === "variable",
                            termIds: [],
                        })
                    }
                    label={t("empty.addExisting")}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setCustomOpen(true)}>
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t("empty.addCustom")}
                </Button>
            </div>
            {customOpen ? (
                <AddCustomAttributeForm
                    onClose={() => setCustomOpen(false)}
                    onCreated={(id) => {
                        append({
                            attributeId: id,
                            position: fields.length,
                            visible: true,
                            usedForVariation: productType === "variable",
                            termIds: [],
                        });
                        setCustomOpen(false);
                    }}
                    createAttribute={createAttribute}
                    labels={t}
                />
            ) : null}
        </div>
    );
}

function AttributeLinkRow({
    index,
    productType,
    onRemove,
}: {
    index: number;
    productType: "simple" | "variable" | "grouped" | "external";
    onRemove: () => void;
}) {
    const t = useTranslations("Products.detail.attributes");
    const { control, watch } = useFormContext<ProductDetailFormValues>();
    const link = watch(`attributeLinks.${index}`);
    const attributes = useGlobalAttributes();
    const attribute = attributes.data?.find((a) => a.id === link.attributeId);
    const terms = useGlobalAttributeTerms(link.attributeId);
    const createTerm = useCreateAttributeTerm(link.attributeId);
    const isVariable = productType === "variable";

    const onToggleTerm = (termId: number, currentTermIds: number[], setTermIds: (next: number[]) => void) => {
        if (currentTermIds.includes(termId)) {
            setTermIds(currentTermIds.filter((id) => id !== termId));
        } else {
            setTermIds([...currentTermIds, termId]);
        }
    };

    return (
        <div className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-foreground text-sm">{attribute?.name ?? `#${link.attributeId}`}</h4>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={onRemove}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
            </div>
            <Controller
                control={control}
                name={`attributeLinks.${index}.termIds`}
                render={({ field }) => (
                    <div className="mt-2 flex flex-col gap-2">
                        <Field id={`terms-${index}`} label={t("row.terms")}>
                            <div className="flex flex-wrap gap-1.5">
                                {(terms.data ?? []).map((term) => {
                                    const active = field.value.includes(term.id);
                                    return (
                                        <button
                                            key={term.id}
                                            type="button"
                                            onClick={() => onToggleTerm(term.id, field.value, field.onChange)}
                                            className={cn(
                                                "rounded-md border px-2 py-0.5 text-xs transition-colors",
                                                active
                                                    ? "border-primary/50 bg-primary/10 text-foreground"
                                                    : "border-border text-muted-foreground hover:border-ring/40",
                                            )}
                                        >
                                            {term.name}
                                        </button>
                                    );
                                })}
                                <InlineTermCreator
                                    onCreate={async (name) => {
                                        try {
                                            const result = await createTerm.mutateAsync({ name });
                                            field.onChange([...field.value, result.data.id]);
                                        } catch (error) {
                                            toast.add({
                                                title: t("createTermFailed"),
                                                description: String(error),
                                                data: { tone: "error" },
                                            });
                                        }
                                    }}
                                    placeholder={t("row.addTerms")}
                                />
                            </div>
                        </Field>
                    </div>
                )}
            />
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <Controller
                    control={control}
                    name={`attributeLinks.${index}.visible`}
                    render={({ field }) => (
                        <ToggleRow
                            id={`visible-${index}`}
                            title={t("row.showOnProductPage")}
                            icon={<Tag className="size-4" aria-hidden="true" />}
                            checked={field.value}
                            onChange={field.onChange}
                        />
                    )}
                />
                <Controller
                    control={control}
                    name={`attributeLinks.${index}.usedForVariation`}
                    render={({ field }) => (
                        <div className="flex h-9 items-center gap-2 self-end rounded-md border border-border bg-background px-2.5">
                            <Switch
                                id={`useForVar-${index}`}
                                checked={field.value && isVariable}
                                disabled={!isVariable}
                                onCheckedChange={field.onChange}
                            />
                            <label htmlFor={`useForVar-${index}`} className="flex flex-1 items-center gap-1 text-xs">
                                {t("row.useForVariations")}
                                <HelperTooltip>
                                    {isVariable ? t("tooltips.useForVariations") : t("tooltips.useForVariationsDisabled")}
                                </HelperTooltip>
                            </label>
                        </div>
                    )}
                />
            </div>
        </div>
    );
}

function AddExistingPopover({
    attributes,
    usedAttributeIds,
    onPick,
    label,
}: {
    attributes: { id: number; name: string }[];
    usedAttributeIds: Set<number>;
    onPick: (id: number) => void;
    label: string;
}) {
    const [open, setOpen] = useState(false);
    const available = attributes.filter((a) => !usedAttributeIds.has(a.id));
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={(props) => (
                    <Button type="button" variant="outline" size="sm" {...(props as Record<string, unknown>)}>
                        <Plus className="size-3.5" aria-hidden="true" />
                        {label}
                    </Button>
                )}
            />
            <PopoverContent className="w-64 p-1">
                {available.length === 0 ? (
                    <p className="px-2 py-2 text-muted-foreground text-xs">—</p>
                ) : (
                    <ul className="flex flex-col">
                        {available.map((a) => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onPick(a.id);
                                        setOpen(false);
                                    }}
                                    className="w-full rounded px-2 py-1.5 text-start text-xs hover:bg-accent"
                                >
                                    {a.name}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </PopoverContent>
        </Popover>
    );
}

function InlineTermCreator({ onCreate, placeholder }: { onCreate: (name: string) => Promise<void>; placeholder: string }) {
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    return (
        <input
            type="text"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={async (e) => {
                if (e.key === "Enter" && value.trim().length > 0) {
                    e.preventDefault();
                    setBusy(true);
                    await onCreate(value.trim());
                    setValue("");
                    setBusy(false);
                }
            }}
            placeholder={placeholder}
            className="h-7 rounded border border-border border-dashed bg-transparent px-2 text-xs outline-none focus:border-ring"
        />
    );
}

function AddCustomAttributeForm({
    onClose,
    onCreated,
    createAttribute,
    labels,
}: {
    onClose: () => void;
    onCreated: (id: number) => void;
    createAttribute: ReturnType<typeof useCreateAttribute>;
    labels: ReturnType<typeof useTranslations<"Products.detail.attributes">>;
}) {
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);

    return (
        <div className="rounded-md border border-border border-dashed bg-card p-3">
            <h4 className="font-semibold text-foreground text-sm">{labels("custom.title")}</h4>
            <p className="mt-1 text-muted-foreground text-xs">{labels("custom.description")}</p>
            <div className="mt-2 flex items-end gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={labels("custom.namePlaceholder")} />
                <Button
                    type="button"
                    onClick={async () => {
                        if (name.trim().length === 0) return;
                        setBusy(true);
                        try {
                            const result = await createAttribute.mutateAsync({ name: name.trim(), isCustom: true });
                            onCreated(result.data.id);
                        } catch (error) {
                            toast.add({ title: labels("custom.failed"), description: String(error), data: { tone: "error" } });
                        } finally {
                            setBusy(false);
                        }
                    }}
                    disabled={busy || name.trim().length === 0}
                >
                    {labels("custom.create")}
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                    {labels("custom.cancel")}
                </Button>
            </div>
        </div>
    );
}
