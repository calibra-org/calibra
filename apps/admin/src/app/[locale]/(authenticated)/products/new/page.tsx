import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Products" });
    return { title: t("newTitle") };
}

export default async function NewProductPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Products");
    const form = t.raw("form") as Record<string, string>;

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={t("newTitle")}
                subtitle={t("newSubtitle")}
                actions={<Button type="submit" form="new-product-form">{form.submit}</Button>}
            />

            <form id="new-product-form" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.general}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <Label htmlFor="np-name">{form.name}</Label>
                                <Input id="np-name" placeholder={form.name} required />
                            </div>
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <Label htmlFor="np-slug">{form.slug}</Label>
                                <Input id="np-slug" placeholder={form.slug} />
                            </div>
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <Label htmlFor="np-desc">{form.shortDescription}</Label>
                                <Textarea id="np-desc" rows={4} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.pricing}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="np-regular">{form.regularPrice}</Label>
                                <Input id="np-regular" type="number" inputMode="numeric" required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="np-sale">{form.salePrice}</Label>
                                <Input id="np-sale" type="number" inputMode="numeric" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b pb-4">
                            <CardTitle className="text-sm">{form.inventory}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-4 pt-5 md:grid-cols-2">
                            <div className="flex items-center justify-between gap-2 md:col-span-2">
                                <Label htmlFor="np-manage" className="text-sm">
                                    {form.manageStock}
                                </Label>
                                <Switch id="np-manage" defaultChecked />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="np-stock">{form.stockQuantity}</Label>
                                <Input id="np-stock" type="number" inputMode="numeric" />
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
                                <Label htmlFor="np-category">{form.category}</Label>
                                <Input id="np-category" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="np-brand">{form.brand}</Label>
                                <Input id="np-brand" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="np-tags">{form.tags}</Label>
                                <Input id="np-tags" placeholder="new, sale, …" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </section>
    );
}
