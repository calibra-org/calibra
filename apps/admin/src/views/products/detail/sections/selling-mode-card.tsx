"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { toast } from "#/components/ui/toast";
import { ChevronDown, ChevronRight, ExternalLink, Layers, Package, Sparkles, Users } from "#/icons";
import { useBatchVariations } from "#/lib/products/mutations";
import { useProductVariations, type VariationView } from "#/lib/products/queries";
import { cn } from "#/lib/utils";

import type { ProductDetailFormValues } from "../schema";

type ProductType = ProductDetailFormValues["type"];

interface SellingModeBodyProps {
    productId: number | null;
    locale: Locale;
}

/**
 * `apps/admin/src/views/products/detail/sections/selling-mode-card.tsx`
 *
 * Selling-mode picker — replaces the inline `<Select name="type">` in {@link GeneralBody}.
 * Renders 2 + 1 primary cards (One version / Multiple versions / Customizable — disabled) and
 * a collapsible "Advanced" group for `grouped` + `external`. Picks the right copy from the
 * `Products.detail.sellingMode` namespace; type values stay `simple | variable | grouped |
 * external` on the wire.
 *
 * Convert flows:
 *   - `simple → variable`: inline notice that existing price/SKU will seed new versions.
 *   - `variable → simple`: confirm dialog. If any variations exist, the operator either picks
 *     one to keep (its price/SKU/stock copies to the parent; the rest archive) or archives
 *     them all. Order history stays intact either way. Variations with orders that can't be
 *     deleted are force-archived (per the prompt's gate).
 */
export function SellingModeBody({ productId, locale: _locale }: SellingModeBodyProps) {
    const t = useTranslations("Products.detail.sellingMode");
    const { control, setValue, getValues } = useFormContext<ProductDetailFormValues>();
    const variations = useProductVariations(productId);
    const batch = useBatchVariations(productId ?? 0);
    const [convertDialog, setConvertDialog] = useState<{ open: boolean; target: ProductType }>({ open: false, target: "simple" });
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [keeperId, setKeeperId] = useState<number | "_archive">("_archive");
    const [showSwitchNotice, setShowSwitchNotice] = useState(false);

    const variationCount = (variations.data ?? []).length;

    const requestType = (next: ProductType) => {
        const current = getValues("type");
        if (current === next) return;
        /** variable → other: confirm if any variations exist (data loss risk). */
        if (current === "variable" && variationCount > 0 && next !== "variable") {
            setKeeperId("_archive");
            setConvertDialog({ open: true, target: next });
            return;
        }
        /** simple → variable: inline notice (no dialog), proceed. */
        if (current === "simple" && next === "variable") {
            setShowSwitchNotice(true);
            setTimeout(() => setShowSwitchNotice(false), 6000);
        }
        setValue("type", next, { shouldDirty: true });
    };

    const confirmConvert = async () => {
        const target = convertDialog.target;
        if (productId !== null && variationCount > 0 && target !== "variable") {
            try {
                const rows = variations.data ?? [];
                if (keeperId !== "_archive") {
                    const keeper = rows.find((r) => r.id === keeperId);
                    if (keeper) {
                        setValue("sku", keeper.sku, { shouldDirty: true });
                        setValue("regularPriceMinor", keeper.regularPriceMinor, { shouldDirty: true });
                    }
                }
                /**
                 * Archive every existing variation regardless of the keeper choice. Variations with
                 * orders refuse delete server-side; status='archived' is always accepted so this
                 * stays single-trip and preserves history.
                 */
                await batch.mutateAsync({
                    update: rows.map((row) => ({ id: row.id, status: "archived" })),
                });
            } catch (error) {
                toast.add({
                    title: t("convertToOneVersion.title"),
                    description: String(error),
                    data: { tone: "error" },
                });
                setConvertDialog({ open: false, target });
                return;
            }
        }
        setValue("type", target, { shouldDirty: true });
        setConvertDialog({ open: false, target });
    };

    const currentType = getValues("type");

    return (
        <Controller
            control={control}
            name="type"
            render={({ field }) => (
                <div className="flex flex-col gap-3">
                    <p className="text-muted-foreground text-xs">{t("subtitle")}</p>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <ModeCard
                            icon={<Package className="size-5" aria-hidden="true" />}
                            title={t("oneVersion.title")}
                            description={t("oneVersion.description")}
                            example={t("oneVersion.example")}
                            result={t("oneVersion.result")}
                            selected={field.value === "simple"}
                            onClick={() => requestType("simple")}
                        />
                        <ModeCard
                            icon={<Layers className="size-5" aria-hidden="true" />}
                            title={t("multipleVersions.title")}
                            description={t("multipleVersions.description")}
                            example={t("multipleVersions.example")}
                            result={t("multipleVersions.result")}
                            selected={field.value === "variable"}
                            onClick={() => requestType("variable")}
                        />
                    </div>

                    {showSwitchNotice ? (
                        <p className="rounded-md border border-info/30 bg-info/5 p-2 text-info text-xs">
                            {t("switchToVariableNotice")}
                        </p>
                    ) : null}

                    <button
                        type="button"
                        className="flex items-center gap-2 self-start text-muted-foreground text-xs hover:text-foreground"
                        onClick={() => setAdvancedOpen((v) => !v)}
                        aria-expanded={advancedOpen}
                    >
                        {advancedOpen ? (
                            <ChevronDown className="size-3.5" aria-hidden="true" />
                        ) : (
                            <ChevronRight className="size-3.5" data-rtl-flip aria-hidden="true" />
                        )}
                        {t("advancedDisclosure")}
                    </button>

                    {advancedOpen ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <ModeCard
                                icon={<Users className="size-5" aria-hidden="true" />}
                                title={t("grouped.title")}
                                description={t("grouped.description")}
                                selected={field.value === "grouped"}
                                onClick={() => requestType("grouped")}
                            />
                            <ModeCard
                                icon={<ExternalLink className="size-5" aria-hidden="true" />}
                                title={t("external.title")}
                                description={t("external.description")}
                                selected={field.value === "external"}
                                onClick={() => requestType("external")}
                            />
                            <ModeCard
                                icon={<Sparkles className="size-5" aria-hidden="true" />}
                                title={t("customizable.title")}
                                description={t("customizable.description")}
                                badge={<Badge variant="secondary">{t("customizable.comingSoon")}</Badge>}
                                disabled
                                selected={false}
                                onClick={() => undefined}
                            />
                        </div>
                    ) : null}

                    <ConvertDialog
                        open={convertDialog.open}
                        onClose={() => setConvertDialog({ open: false, target: currentType })}
                        onConfirm={() => void confirmConvert()}
                        count={variationCount}
                        rows={variations.data ?? []}
                        keeperId={keeperId}
                        onKeeperChange={setKeeperId}
                        busy={batch.isPending}
                    />
                </div>
            )}
        />
    );
}

interface ModeCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    example?: string;
    result?: string;
    badge?: React.ReactNode;
    selected: boolean;
    disabled?: boolean;
    onClick: () => void;
}

function ModeCard({ icon, title, description, example, result, badge, selected, disabled, onClick }: ModeCardProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                "flex flex-col gap-2 rounded-md border p-3 text-start transition-colors",
                selected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-ring/40",
                disabled && "pointer-events-none opacity-50",
            )}
        >
            <div className="flex items-center gap-2">
                <span className="text-primary">{icon}</span>
                <span className="font-medium text-foreground text-sm">{title}</span>
                {badge !== undefined ? <span className="ms-auto">{badge}</span> : null}
            </div>
            <p className="text-muted-foreground text-xs">{description}</p>
            {example !== undefined ? (
                <p className="rounded bg-muted/40 px-2 py-1 text-muted-foreground text-xs">{example}</p>
            ) : null}
            {result !== undefined ? <p className="text-foreground text-xs">{result}</p> : null}
        </button>
    );
}

function ConvertDialog({
    open,
    onClose,
    onConfirm,
    count,
    rows,
    keeperId,
    onKeeperChange,
    busy,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    count: number;
    rows: VariationView[];
    keeperId: number | "_archive";
    onKeeperChange: (next: number | "_archive") => void;
    busy: boolean;
}) {
    const t = useTranslations("Products.detail.sellingMode.convertToOneVersion");
    return (
        <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>{t("body", { count })}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 text-xs">
                    <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground" id="keeper-label">
                            {t("selectKeeper")}
                        </span>
                        <Select
                            value={String(keeperId)}
                            onValueChange={(v) => onKeeperChange(v === "_archive" ? "_archive" : Number(v))}
                        >
                            <SelectTrigger className="h-8 w-full" aria-labelledby="keeper-label">
                                <SelectValue>
                                    {(value) => {
                                        if (value === "_archive") return t("archiveAll");
                                        const row = rows.find((r) => String(r.id) === value);
                                        return row?.sku ?? `#${value}`;
                                    }}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="_archive">{t("archiveAll")}</SelectItem>
                                {rows.map((row) => (
                                    <SelectItem key={row.id} value={String(row.id)}>
                                        {row.sku ?? `#${row.id}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">{t("keepOne")}</span>
                    </div>
                    <p className="text-muted-foreground">{t("ordersPreserved")}</p>
                </div>
                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={onClose}>
                        {t("cancel")}
                    </Button>
                    <Button type="button" onClick={onConfirm} disabled={busy}>
                        {t("confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
