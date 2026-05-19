import type { Locale } from "@calibra/shared/i18n";
import { Save } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { formatDate } from "#/lib/format";
import { getProduct, listBrands, listCategories, listTags } from "#/lib/server-repos";
import type { ProductStatus } from "#/lib/types";

interface PageProps {
    params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, id } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    const product = await getProduct(Number(id));
    return { title: product === null ? t("title") : product.name[locale as Locale] };
}

const tone: Record<ProductStatus, StatusTone> = {
    publish: "success",
    draft: "neutral",
    pending: "warning",
    private: "info",
};

export default async function ProductDetailPage({ params }: PageProps) {
    const { locale: rawLocale, id } = await params;
    setRequestLocale(rawLocale);
    const locale = rawLocale as Locale;
    const product = await getProduct(Number(id));
    if (product === null) notFound();

    const t = await getTranslations("Products");
    const statusT = await getTranslations("ProductStatus");
    const stockT = await getTranslations("StockStatus");
    const form = t.raw("form") as Record<string, string>;
    const [{ data: categories }, { data: brands }, { data: tags }] = await Promise.all([
        listCategories({ perPage: 100 }),
        listBrands({ perPage: 100 }),
        listTags({ perPage: 100 }),
    ]);

    const category = categories.find((c) => product.categoryIds.includes(c.id));
    const brand = brands.find((b) => b.id === product.brandId);
    const productTags = tags.filter((tag) => product.tagIds.includes(tag.id));

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={product.name[locale]}
                subtitle={
                    <span className="flex items-center gap-2">
                        <span className="font-mono text-xs">{product.sku}</span>
                        <StatusBadge tone={tone[product.status]}>{statusT(product.status)}</StatusBadge>
                        <span className="text-muted-foreground">·</span>
                        <span>{formatDate(product.updatedAt, locale)}</span>
                    </span>
                }
                actions={
                    <Button>
                        <Save className="size-4" aria-hidden="true" />
                        {form.submit}
                    </Button>
                }
            />

            <form className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.general}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <Label htmlFor={`name-${product.id}`}>{form.name}</Label>
                                <Input id={`name-${product.id}`} defaultValue={product.name[locale]} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`slug-${product.id}`}>{form.slug}</Label>
                                <Input id={`slug-${product.id}`} defaultValue={product.slug[locale]} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`status-${product.id}`}>{t("filterStatus")}</Label>
                                <Input id={`status-${product.id}`} defaultValue={statusT(product.status)} readOnly />
                            </div>
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <Label htmlFor={`desc-${product.id}`}>{form.shortDescription}</Label>
                                <Textarea id={`desc-${product.id}`} defaultValue={product.shortDescription[locale]} rows={3} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.pricing}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`regular-${product.id}`}>{form.regularPrice}</Label>
                                <Input id={`regular-${product.id}`} type="number" defaultValue={product.regularPrice} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`sale-${product.id}`}>{form.salePrice}</Label>
                                <Input id={`sale-${product.id}`} type="number" defaultValue={product.salePrice ?? ""} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.inventory}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                            <div className="flex items-center justify-between gap-2 md:col-span-2">
                                <Label htmlFor={`manage-stock-${product.id}`} className="text-sm">
                                    {form.manageStock}
                                </Label>
                                <Switch id={`manage-stock-${product.id}`} defaultChecked={product.manageStock} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`stock-qty-${product.id}`}>{form.stockQuantity}</Label>
                                <Input
                                    id={`stock-qty-${product.id}`}
                                    type="number"
                                    defaultValue={product.stockQuantity ?? ""}
                                    disabled={!product.manageStock}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`stock-status-${product.id}`}>{form.stockStatus}</Label>
                                <Input id={`stock-status-${product.id}`} defaultValue={stockT(product.stockStatus)} readOnly />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.organization}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 pt-5 text-sm">
                            <div className="flex flex-col gap-1.5">
                                <Label>{form.category}</Label>
                                <Input defaultValue={category?.name[locale] ?? ""} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label>{form.brand}</Label>
                                <Input defaultValue={brand?.name[locale] ?? ""} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label>{form.tags}</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {productTags.length === 0 ? (
                                        <span className="text-muted-foreground text-xs">—</span>
                                    ) : (
                                        productTags.map((tag) => (
                                            <StatusBadge key={tag.id} tone="info">
                                                {tag.name[locale]}
                                            </StatusBadge>
                                        ))
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {product.imageUrl !== null && (
                        <Card>
                            <CardContent className="pt-6">
                                {/** biome-ignore lint/performance/noImgElement: mock CDN; see products list page */}
                                <img
                                    src={product.imageUrl}
                                    alt={product.name[locale]}
                                    className="aspect-square w-full rounded-md object-cover"
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>
            </form>
        </section>
    );
}
