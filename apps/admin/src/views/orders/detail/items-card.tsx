"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminOrder } from "#/lib/types";

interface ItemsCardProps {
    order: AdminOrder;
    locale: Locale;
}

/**
 * Line items table. Renders as a section body — the {@link DraggableSectionGrid} owns the
 * surrounding card chrome and the header (title + drag handle + collapse chevron). The body
 * is intentionally minimal in Phase 2; inline qty/price editing + add-item/fee/shipping +
 * apply-coupon land in a follow-up commit on this PR.
 */
export function ItemsCard({ order, locale }: ItemsCardProps) {
    const t = useTranslations("Orders.detail");
    if (order.lineItems.length === 0) {
        return <p className="text-muted-foreground text-sm">{t("items")}: —</p>;
    }
    return (
        <Table>
            <TableHeader>
                <TableRow className="border-border/40 border-b bg-muted/30">
                    <TableHead className="px-2">{t("items")}</TableHead>
                    <TableHead className="text-end" />
                    <TableHead className="text-end" />
                    <TableHead className="px-2 text-end" />
                </TableRow>
            </TableHeader>
            <TableBody>
                {order.lineItems.map((line) => (
                    <TableRow key={line.id} className="border-border/40">
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
                                    <span className="text-muted-foreground text-xs">{line.sku}</span>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="text-end text-muted-foreground">× {formatNumber(line.quantity, locale)}</TableCell>
                        <TableCell className="text-end">{formatMoney(line.unitPrice, locale)}</TableCell>
                        <TableCell className="px-2 text-end font-medium">{formatMoney(line.total, locale)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
