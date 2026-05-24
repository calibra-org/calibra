"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminOrder } from "#/lib/types";

interface ItemsCardProps {
    order: AdminOrder;
    locale: Locale;
}

/** Line items table. Inline edit is deferred — the API doesn't expose a per-line PATCH yet. */
export function ItemsCard({ order, locale }: ItemsCardProps) {
    const t = useTranslations("Orders.detail");
    return (
        <Card>
            <CardHeader className="border-b pb-4">
                <CardTitle className="text-sm">{t("items")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40">
                            <TableHead className="px-5">{t("items")}</TableHead>
                            <TableHead className="text-end" />
                            <TableHead className="text-end" />
                            <TableHead className="px-5 text-end" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {order.lineItems.map((line) => (
                            <TableRow key={line.id}>
                                <TableCell className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        {line.imageUrl !== null ? (
                                            // biome-ignore lint/performance/noImgElement: mock CDN
                                            <img src={line.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                                        ) : (
                                            <div className="size-10 rounded-md bg-muted" aria-hidden="true" />
                                        )}
                                        <div className="flex flex-col">
                                            <Link
                                                href={`/products/${line.productId}` as never}
                                                className="font-medium hover:underline"
                                            >
                                                {line.name[locale]}
                                            </Link>
                                            <span className="text-muted-foreground text-xs">{line.sku}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-end text-muted-foreground">
                                    × {formatNumber(line.quantity, locale)}
                                </TableCell>
                                <TableCell className="text-end">{formatMoney(line.unitPrice, locale)}</TableCell>
                                <TableCell className="px-5 text-end font-medium">{formatMoney(line.total, locale)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
