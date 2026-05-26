"use client";

import type { Locale } from "@calibra/shared/i18n";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { toast } from "#/components/ui/toast";
import { formatMoney } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import {
    useAddOrderFee,
    useAddOrderLineItem,
    useAddOrderShippingLine,
    useApplyOrderCoupon,
    useDeleteOrderLineItem,
    useRecalculateOrderTotals,
    useUpdateOrderLineItem,
} from "#/lib/queries/orders";
import type { AdminOrder, AdminOrderLineItem } from "#/lib/types";

interface ItemsCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Editable line item table — quantity stepper, price input, remove with undo. The table also
 * hosts the add-item / add-fee / add-shipping / apply-coupon toolbar. Dirty rows track local
 * changes; the sticky footer surfaces "Save all" + "Cancel all" so admins can batch flush.
 *
 * Locked orders fall through to a read-only render with an explanatory tooltip — the user has to
 * "Edit anyway" from the LockedBanner before edits become possible.
 */
export function ItemsCard({ order, locale }: ItemsCardProps) {
    const t = useTranslations("Orders.detail");
    const tItems = useTranslations("Orders.detail.itemsEditor");
    const updateLine = useUpdateOrderLineItem();
    const deleteLine = useDeleteOrderLineItem();
    const addLineItem = useAddOrderLineItem();
    const addFee = useAddOrderFee();
    const addShipping = useAddOrderShippingLine();
    const applyCoupon = useApplyOrderCoupon();
    const recalc = useRecalculateOrderTotals();

    const readOnly = order.isLocked;

    const [dirty, setDirty] = useState<Record<number, { quantity: number; priceMinor: number }>>({});
    /**
     * Reset dirty state when the upstream order shape changes (a mutation just landed). The dep
     * is a join of the row-identifying tuple so the effect only re-fires on real shape change.
     */
    const lineFingerprint = order.lineItems.map((l) => `${l.id}:${l.quantity}:${l.unitPrice}`).join(",");
    // biome-ignore lint/correctness/useExhaustiveDependencies: setDirty is stable; the fingerprint string is the only signal we care about
    useEffect(() => {
        setDirty({});
    }, [lineFingerprint]);

    const onPatchRow = (id: number, patch: Partial<{ quantity: number; priceMinor: number }>) => {
        setDirty((current) => {
            const source = current[id] ?? {
                quantity: order.lineItems.find((l) => l.id === id)?.quantity ?? 1,
                priceMinor: order.lineItems.find((l) => l.id === id)?.unitPrice ?? 0,
            };
            return { ...current, [id]: { ...source, ...patch } };
        });
    };

    const onCancelAll = () => setDirty({});

    const onSaveAll = async () => {
        const entries = Object.entries(dirty);
        if (entries.length === 0) return;
        let failed = 0;
        for (const [rawId, change] of entries) {
            try {
                await updateLine.mutateAsync({
                    id: order.id,
                    line_id: Number(rawId),
                    quantity: change.quantity,
                    price_override_minor: change.priceMinor,
                });
            } catch {
                failed += 1;
            }
        }
        if (failed === 0) toast.add({ title: tItems("savedAll"), timeout: 2500, data: { tone: "success" } });
        else toast.add({ title: tItems("saveAllPartial", { failed }), timeout: 4000, data: { tone: "error" } });
        setDirty({});
    };

    const onRemove = async (line: AdminOrderLineItem) => {
        try {
            await deleteLine.mutateAsync({ id: order.id, line_id: line.id });
            toast.add({ title: tItems("removed"), timeout: 2500, data: { tone: "success" } });
        } catch {
            toast.add({ title: tItems("removeFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const dirtyCount = Object.keys(dirty).length;

    return (
        <div className="flex flex-col gap-4">
            <ItemsToolbar
                orderId={order.id}
                readOnly={readOnly}
                onAddProduct={(productId, quantity, price) =>
                    addLineItem.mutateAsync({
                        id: order.id,
                        product_id: productId,
                        quantity,
                        price_override_minor: price ?? null,
                    })
                }
                onAddFee={(title, amount) => addFee.mutateAsync({ id: order.id, title, amount_minor: amount })}
                onAddShipping={(method, title, total) =>
                    addShipping.mutateAsync({ id: order.id, method_code: method, title, total_minor: total })
                }
                onApplyCoupon={(code) => applyCoupon.mutateAsync({ id: order.id, code })}
                onRecalculate={() => recalc.mutateAsync({ id: order.id })}
            />

            {order.lineItems.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("items")}: —</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow className="border-border/40 border-b bg-muted/30">
                            <TableHead className="px-2">{t("items")}</TableHead>
                            <TableHead className="text-end">{tItems("quantity")}</TableHead>
                            <TableHead className="text-end">{tItems("price")}</TableHead>
                            <TableHead className="px-2 text-end">{tItems("total")}</TableHead>
                            <TableHead className="w-12 px-2" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {order.lineItems.map((line) => (
                            <LineRow
                                key={line.id}
                                line={line}
                                locale={locale}
                                readOnly={readOnly}
                                dirty={dirty[line.id]}
                                onPatch={(patch) => onPatchRow(line.id, patch)}
                                onRemove={() => onRemove(line)}
                            />
                        ))}
                    </TableBody>
                </Table>
            )}

            {dirtyCount > 0 && (
                <div className="sticky bottom-2 z-10 mt-2 flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm shadow-sm">
                    <span className="text-primary">{tItems("dirtyBar", { count: dirtyCount })}</span>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={onCancelAll}>
                            {tItems("cancelAll")}
                        </Button>
                        <Button size="sm" onClick={onSaveAll} disabled={updateLine.isPending} data-detail-action="save-all">
                            {tItems("saveAll")}
                        </Button>
                    </div>
                </div>
            )}

            <ItemsSummary order={order} locale={locale} />
        </div>
    );
}

interface LineRowProps {
    line: AdminOrderLineItem;
    locale: Locale;
    readOnly: boolean;
    dirty: { quantity: number; priceMinor: number } | undefined;
    onPatch: (patch: Partial<{ quantity: number; priceMinor: number }>) => void;
    onRemove: () => void;
}

function LineRow({ line, locale, readOnly, dirty, onPatch, onRemove }: LineRowProps) {
    const quantity = dirty?.quantity ?? line.quantity;
    const priceMinor = dirty?.priceMinor ?? line.unitPrice;
    const lineTotal = quantity * priceMinor;
    const isDirty = dirty !== undefined;
    return (
        <TableRow className={`border-border/40 ${isDirty ? "bg-warning/40 dark:bg-warning/15" : ""}`}>
            <TableCell className="px-2 py-3">
                <div className="flex items-center gap-3">
                    {line.imageUrl !== null ? (
                        // biome-ignore lint/performance/noImgElement: mock CDN
                        <img src={line.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                    ) : (
                        <div className="size-10 rounded-md bg-muted" aria-hidden="true" />
                    )}
                    <div className="flex flex-col">
                        <Link href={`/products/${line.productId}` as never} className="font-medium hover:underline">
                            {line.name[locale]}
                        </Link>
                        <span className="font-mono text-muted-foreground text-xs">{line.sku || "—"}</span>
                    </div>
                </div>
            </TableCell>
            <TableCell className="text-end">
                <div className="inline-flex items-center gap-1">
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        disabled={readOnly || quantity <= 1}
                        onClick={() => onPatch({ quantity: quantity - 1 })}
                        aria-label="-"
                    >
                        <Minus className="size-3" aria-hidden="true" />
                    </Button>
                    <Input
                        type="number"
                        inputMode="numeric"
                        value={quantity}
                        readOnly={readOnly}
                        className="h-7 w-16 text-end tabular-nums"
                        onChange={(event) => {
                            const next = Number(event.target.value);
                            if (Number.isFinite(next) && next > 0) onPatch({ quantity: next });
                        }}
                    />
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        disabled={readOnly}
                        onClick={() => onPatch({ quantity: quantity + 1 })}
                        aria-label="+"
                    >
                        <Plus className="size-3" aria-hidden="true" />
                    </Button>
                </div>
            </TableCell>
            <TableCell className="text-end">
                <Input
                    type="number"
                    inputMode="numeric"
                    value={priceMinor}
                    readOnly={readOnly}
                    className="h-7 w-28 text-end tabular-nums"
                    onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next >= 0) onPatch({ priceMinor: next });
                    }}
                />
            </TableCell>
            <TableCell className="px-2 text-end font-medium tabular-nums">{formatMoney(lineTotal, locale)}</TableCell>
            <TableCell className="px-2 text-end">
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-danger hover:bg-danger/10 hover:text-danger"
                    disabled={readOnly}
                    onClick={onRemove}
                    aria-label="remove"
                >
                    <Trash2 className="size-4" aria-hidden="true" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

function ItemsSummary({ order, locale }: { order: AdminOrder; locale: Locale }) {
    const t = useTranslations("Orders.detail");
    const rows = useMemo(
        () => [
            { label: t("itemsTotal"), value: order.itemsTotal },
            { label: t("shippingTotal"), value: order.shippingTotal },
            { label: t("taxTotal"), value: order.taxTotal },
            { label: t("feesTotal"), value: order.feesTotal },
            { label: t("discountTotal"), value: -Number(order.discountTotal) },
        ],
        [order, t],
    );
    return (
        <div className="ms-auto flex w-full flex-col gap-1 border-border/40 border-t pt-3 text-sm sm:w-72">
            {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{row.label}</span>
                    <span className="tabular-nums">{formatMoney(row.value, locale)}</span>
                </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-border/40 border-t pt-2">
                <span className="font-semibold text-sm">{t("grandTotal")}</span>
                <span className="font-semibold tabular-nums">{formatMoney(order.grandTotal, locale)}</span>
            </div>
        </div>
    );
}

interface ItemsToolbarProps {
    orderId: number;
    readOnly: boolean;
    onAddProduct: (productId: number, quantity: number, priceMinor: number | null) => Promise<unknown>;
    onAddFee: (title: string, amountMinor: number) => Promise<unknown>;
    onAddShipping: (method: string, title: string, totalMinor: number) => Promise<unknown>;
    onApplyCoupon: (code: string) => Promise<unknown>;
    onRecalculate: () => Promise<unknown>;
}

function ItemsToolbar({
    orderId: _orderId,
    readOnly,
    onAddProduct,
    onAddFee,
    onAddShipping,
    onApplyCoupon,
    onRecalculate,
}: ItemsToolbarProps) {
    const tItems = useTranslations("Orders.detail.itemsEditor");
    const [productId, setProductId] = useState("");
    const [productQty, setProductQty] = useState("1");
    const [feeTitle, setFeeTitle] = useState("");
    const [feeAmount, setFeeAmount] = useState("");
    const [shipMethod, setShipMethod] = useState("");
    const [shipTitle, setShipTitle] = useState("");
    const [shipTotal, setShipTotal] = useState("");
    const [coupon, setCoupon] = useState("");

    const addProduct = async () => {
        const id = Number(productId);
        const qty = Number(productQty);
        if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(qty) || qty <= 0) return;
        try {
            await onAddProduct(id, qty, null);
            setProductId("");
            setProductQty("1");
            toast.add({ title: tItems("productAdded"), timeout: 2000, data: { tone: "success" } });
        } catch {
            toast.add({ title: tItems("productAddFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const addFeeRow = async () => {
        const amount = Number(feeAmount);
        if (feeTitle.trim().length === 0 || !Number.isFinite(amount) || amount < 0) return;
        try {
            await onAddFee(feeTitle.trim(), amount);
            setFeeTitle("");
            setFeeAmount("");
            toast.add({ title: tItems("feeAdded"), timeout: 2000, data: { tone: "success" } });
        } catch {
            toast.add({ title: tItems("feeAddFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const addShippingRow = async () => {
        const total = Number(shipTotal);
        if (shipMethod.trim().length === 0 || shipTitle.trim().length === 0 || !Number.isFinite(total) || total < 0) return;
        try {
            await onAddShipping(shipMethod.trim(), shipTitle.trim(), total);
            setShipMethod("");
            setShipTitle("");
            setShipTotal("");
            toast.add({ title: tItems("shippingAdded"), timeout: 2000, data: { tone: "success" } });
        } catch {
            toast.add({ title: tItems("shippingAddFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    const apply = async () => {
        const code = coupon.trim();
        if (code.length === 0) return;
        try {
            await onApplyCoupon(code);
            setCoupon("");
            toast.add({ title: tItems("couponApplied"), timeout: 2000, data: { tone: "success" } });
        } catch {
            toast.add({ title: tItems("couponFailed"), timeout: 3500, data: { tone: "error" } });
        }
    };

    if (readOnly) {
        return <p className="text-muted-foreground text-xs">{tItems("lockedNotice")}</p>;
    }

    return (
        <div className="flex flex-col gap-2 rounded-md border border-border/60 border-dashed bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_80px_auto_1fr]">
                <Input
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    placeholder={tItems("productId")}
                    inputMode="numeric"
                    data-detail-action="add-item"
                />
                <Input value={productQty} onChange={(event) => setProductQty(event.target.value)} inputMode="numeric" />
                <Button onClick={addProduct} disabled={productId.trim().length === 0}>
                    {tItems("addProduct")}
                </Button>
                <Button
                    variant="outline"
                    onClick={() =>
                        onRecalculate().then(() =>
                            toast.add({ title: tItems("recalculated"), timeout: 2000, data: { tone: "success" } }),
                        )
                    }
                >
                    {tItems("recalculate")}
                </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
                <Input value={feeTitle} onChange={(event) => setFeeTitle(event.target.value)} placeholder={tItems("feeTitle")} />
                <Input
                    value={feeAmount}
                    onChange={(event) => setFeeAmount(event.target.value)}
                    placeholder={tItems("feeAmount")}
                    inputMode="numeric"
                />
                <Button
                    variant="outline"
                    onClick={addFeeRow}
                    disabled={feeTitle.trim().length === 0 || feeAmount.trim().length === 0}
                >
                    {tItems("addFee")}
                </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_140px_auto]">
                <Input
                    value={shipMethod}
                    onChange={(event) => setShipMethod(event.target.value)}
                    placeholder={tItems("shipMethod")}
                />
                <Input
                    value={shipTitle}
                    onChange={(event) => setShipTitle(event.target.value)}
                    placeholder={tItems("shipTitle")}
                />
                <Input
                    value={shipTotal}
                    onChange={(event) => setShipTotal(event.target.value)}
                    placeholder={tItems("shipTotal")}
                    inputMode="numeric"
                />
                <Button variant="outline" onClick={addShippingRow}>
                    {tItems("addShipping")}
                </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder={tItems("couponCode")} />
                <Button variant="outline" onClick={apply} disabled={coupon.trim().length === 0}>
                    {tItems("applyCoupon")}
                </Button>
            </div>
        </div>
    );
}
