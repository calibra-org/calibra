"use client";

import type { Locale } from "@calibra/shared/i18n";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { Progress } from "#/components/ui/progress";
import { formatMoney, formatNumber } from "#/lib/format";
import { Link } from "#/lib/i18n/navigation";
import type { AdminRegionalProvinceDetail } from "#/lib/types";

import { itemVariants, listVariants } from "./motion-variants";

interface TopProductsListProps {
    products: AdminRegionalProvinceDetail["topProducts"];
    locale: Locale;
}

export function TopProductsList({ products, locale }: TopProductsListProps) {
    const t = useTranslations("Dashboard.regional");
    const tCommon = useTranslations("Common");

    if (products.length === 0) {
        return <p className="py-4 text-center text-muted-foreground text-xs">{tCommon("noResults")}</p>;
    }

    const max = Math.max(...products.map((p) => p.revenueMinor), 1);

    return (
        <motion.ul className="flex flex-col gap-3" variants={listVariants} initial="hidden" animate="show">
            {products.map((product, index) => {
                const percent = (product.revenueMinor / max) * 100;
                return (
                    <motion.li key={product.productId} variants={itemVariants} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-semibold text-muted-foreground text-xs tabular-nums">
                                    {formatNumber(index + 1, locale)}
                                </span>
                                {product.imageUrl ? (
                                    <img
                                        src={product.imageUrl}
                                        alt=""
                                        className="size-8 shrink-0 rounded border bg-muted object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div className="size-8 shrink-0 rounded border bg-muted" aria-hidden="true" />
                                )}
                                <Link
                                    href={`/products/${product.productId}` as never}
                                    className="truncate font-medium text-sm hover:underline"
                                >
                                    {product.name || t("topProductsLabel")}
                                </Link>
                            </div>
                            <span className="shrink-0 font-medium text-sm tabular-nums">
                                {formatMoney(product.revenueMinor, locale)}
                            </span>
                        </div>
                        <Progress value={percent} />
                        <div className="flex items-center justify-between text-muted-foreground text-xs">
                            <span>{product.sku ?? ""}</span>
                            <span>
                                {formatNumber(product.units, locale)} {t("topProductsCount")}
                            </span>
                        </div>
                    </motion.li>
                );
            })}
        </motion.ul>
    );
}
