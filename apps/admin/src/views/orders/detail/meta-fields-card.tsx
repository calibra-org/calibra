"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { useDeleteOrderMeta, useUpsertOrderMeta } from "#/lib/queries/orders";
import type { AdminOrder } from "#/lib/types";

interface MetaFieldsCardProps {
    order: AdminOrder;
}

/**
 * Editable WP-style custom fields. Visible-by-default keys live at the top, underscore-prefixed
 * keys hide behind a toggle. Each row autosaves on blur; the trailing trash button removes the
 * key. The "add row" button at the bottom captures a fresh `(key, value)` pair and POSTs it
 * through the same upsert endpoint.
 */
export function MetaFieldsCard({ order }: MetaFieldsCardProps) {
    const t = useTranslations("Orders.detail.meta");
    const upsert = useUpsertOrderMeta();
    const remove = useDeleteOrderMeta();
    const [showHidden, setShowHidden] = useState(false);
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");

    const visibleRows = useMemo(() => Object.entries(order.metaVisible), [order.metaVisible]);
    const hiddenRows = useMemo(() => Object.entries(order.metaHidden), [order.metaHidden]);
    const rows = useMemo(
        () => (showHidden ? [...visibleRows, ...hiddenRows] : visibleRows),
        [showHidden, visibleRows, hiddenRows],
    );

    const onSave = async (key: string, value: string) => {
        try {
            await upsert.mutateAsync({ id: order.id, key, value });
        } catch {
            toast.add({ title: t("saveFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const onRemove = async (key: string) => {
        try {
            await remove.mutateAsync({ id: order.id, key });
            toast.add({ title: t("removed"), timeout: 2000, data: { tone: "success" } });
        } catch {
            toast.add({ title: t("removeFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const onAdd = async () => {
        const key = newKey.trim();
        if (key.length === 0) return;
        if (order.meta[key] !== undefined) {
            toast.add({ title: t("duplicateKey"), timeout: 3500, data: { tone: "error" } });
            return;
        }
        await onSave(key, newValue);
        setNewKey("");
        setNewValue("");
    };

    return (
        <div className="flex flex-col gap-3">
            {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("empty")}</p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {rows.map(([key, value]) => (
                        <MetaRow key={key} initialKey={key} initialValue={value} onSave={onSave} onRemove={onRemove} />
                    ))}
                </ul>
            )}

            <div className="flex items-center justify-between border-border/60 border-t pt-3">
                <div className="flex items-center gap-2 text-xs">
                    <Switch
                        checked={showHidden}
                        onCheckedChange={(value) => setShowHidden(value === true)}
                        aria-label={t("showHidden")}
                    />
                    <span>{t("showHidden")}</span>
                </div>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-border/60 border-dashed bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs">{t("addNew")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <Input value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder={t("keyPlaceholder")} />
                    <Textarea
                        value={newValue}
                        onChange={(event) => setNewValue(event.target.value)}
                        rows={1}
                        placeholder={t("valuePlaceholder")}
                    />
                    <Button onClick={onAdd} disabled={newKey.trim().length === 0 || upsert.isPending}>
                        <Plus className="size-4" aria-hidden="true" />
                        {t("add")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

interface MetaRowProps {
    initialKey: string;
    initialValue: string;
    onSave: (key: string, value: string) => Promise<void>;
    onRemove: (key: string) => Promise<void>;
}

function MetaRow({ initialKey, initialValue, onSave, onRemove }: MetaRowProps) {
    const [value, setValue] = useState(initialValue);
    const t = useTranslations("Orders.detail.meta");
    return (
        <li className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input value={initialKey} readOnly className="bg-muted/40 font-mono text-xs" />
            <Textarea
                rows={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => {
                    if (value !== initialValue) void onSave(initialKey, value);
                }}
            />
            <Button
                variant="ghost"
                size="icon"
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => void onRemove(initialKey)}
                aria-label={t("remove")}
            >
                <Trash2 className="size-4" aria-hidden="true" />
            </Button>
        </li>
    );
}
