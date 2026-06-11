"use client";

import { useTranslations } from "next-intl";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { useProductDetail, useShippingClassOptions, useTaxClassOptions } from "#/lib/queries/products";

import { ProductDetail } from "./product-detail";

interface ProductDetailLoaderProps {
    /** Numeric product id for the edit screen; omitted (with `isNew`) for the create screen. */
    productId?: number;
    isNew?: boolean;
}

/**
 * Client data boundary for the product editor. Owns the React Query subscriptions that used to be
 * server-fetched (`getProductDetail`, `listTaxClassOptions`, `listShippingClassOptions`) and renders
 * a skeleton while they resolve and a retry-able error state on failure. Once the data is in hand it
 * mounts the existing {@link ProductDetail} editor unchanged — only the data source moved from
 * server props to client hooks.
 */
export function ProductDetailLoader({ productId, isNew = false }: ProductDetailLoaderProps) {
    const tCommon = useTranslations("Common");
    const taxClasses = useTaxClassOptions();
    const shippingClasses = useShippingClassOptions();
    const detail = useProductDetail(isNew ? 0 : (productId ?? 0));

    const optionsLoading = taxClasses.isLoading || shippingClasses.isLoading;
    const optionsError = taxClasses.isError || shippingClasses.isError;

    if (isNew) {
        if (optionsLoading) return <ProductDetailSkeleton />;
        if (optionsError) {
            return (
                <ErrorState
                    label={tCommon("errorLoading")}
                    retry={tCommon("retry")}
                    onRetry={() => {
                        void taxClasses.refetch();
                        void shippingClasses.refetch();
                    }}
                />
            );
        }
        return (
            <ProductDetail
                isNew
                taxClassOptions={taxClasses.data ?? []}
                shippingClassOptions={shippingClasses.data ?? []}
            />
        );
    }

    if (detail.isLoading || optionsLoading) return <ProductDetailSkeleton />;
    if (detail.isError || optionsError || detail.data === undefined) {
        return (
            <ErrorState
                label={tCommon("errorLoading")}
                retry={tCommon("retry")}
                onRetry={() => {
                    void detail.refetch();
                    void taxClasses.refetch();
                    void shippingClasses.refetch();
                }}
            />
        );
    }

    return (
        <ProductDetail
            initialProduct={detail.data}
            taxClassOptions={taxClasses.data ?? []}
            shippingClassOptions={shippingClasses.data ?? []}
        />
    );
}

/** Retry-able error panel shared by the create and edit branches. */
function ErrorState({ label, retry, onRetry }: { label: string; retry: string; onRetry: () => void }) {
    return (
        <section className="flex flex-col gap-3 p-6 text-center">
            <p className="text-muted-foreground text-sm">{label}</p>
            <Button variant="outline" size="sm" onClick={onRetry} className="self-center">
                {retry}
            </Button>
        </section>
    );
}

/**
 * First-paint skeleton mirroring the {@link ProductDetail} two-column shell: a header row, a wide
 * main column of section cards, and a 320px sidebar of stacked cards.
 */
function ProductDetailSkeleton() {
    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-7 w-64" />
                    <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-9 w-28" />
            </div>
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 flex flex-col gap-4 lg:col-span-8">
                    {[0, 1, 2].map((row) => (
                        <div key={row} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-9 w-2/3" />
                        </div>
                    ))}
                </div>
                <div className="col-span-12 flex flex-col gap-4 lg:col-span-4">
                    {[0, 1, 2].map((row) => (
                        <div key={row} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                            <Skeleton className="h-5 w-28" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
