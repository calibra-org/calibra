"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader } from "#/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import { FolderTree, Pencil, Plus, Tags, Trash2 } from "#/icons";
import { formatNumber } from "#/lib/format";

import { useContentTaxonomy, useTaxonomyMutation } from "./queries";
import { SectionTitle } from "./ui";
import type { ContentCategory, ContentTag } from "./types";

type EditableTaxonomy =
    | { kind: "category"; id: number; name: string; description: string; parentId: string; position: number; isActive: boolean }
    | { kind: "tag"; id: number; name: string; description: string };

const ROOT_CATEGORY = "__root__";

export function ContentTaxonomyPage() {
    const locale = useLocale() as Locale;
    const taxonomy = useContentTaxonomy();
    const mutations = useTaxonomyMutation();
    const [categoryName, setCategoryName] = useState("");
    const [categoryDescription, setCategoryDescription] = useState("");
    const [categoryParentId, setCategoryParentId] = useState(ROOT_CATEGORY);
    const [tagName, setTagName] = useState("");
    const [editing, setEditing] = useState<EditableTaxonomy | null>(null);
    const categories = taxonomy.data?.data.categories ?? [];
    const tags = taxonomy.data?.data.tags ?? [];
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

    async function createCategory() {
        if (!categoryName.trim()) return;
        try {
            await mutations.create.mutateAsync({
                kind: "category",
                name: categoryName.trim(),
                description: categoryDescription.trim() || null,
                parent_id: categoryParentId === ROOT_CATEGORY ? null : Number(categoryParentId),
                position: categories.length,
                is_active: true,
            });
            setCategoryName("");
            setCategoryDescription("");
            setCategoryParentId(ROOT_CATEGORY);
            toast.add({ title: "دسته ساخته شد", data: { tone: "success" } });
        } catch {
            toast.add({
                title: "ساخت دسته ناموفق بود",
                description: "نام، والد و یکتایی دسته را بررسی کنید.",
                data: { tone: "error" },
            });
        }
    }

    async function createTag() {
        if (!tagName.trim()) return;
        try {
            await mutations.create.mutateAsync({ kind: "tag", name: tagName.trim() });
            setTagName("");
            toast.add({ title: "برچسب ساخته شد", data: { tone: "success" } });
        } catch {
            toast.add({ title: "ساخت برچسب ناموفق بود", description: "نام برچسب باید یکتا باشد.", data: { tone: "error" } });
        }
    }

    function editCategory(category: ContentCategory) {
        setEditing({
            kind: "category",
            id: category.id,
            name: category.name,
            description: category.description ?? "",
            parentId: category.parent_id ? String(category.parent_id) : ROOT_CATEGORY,
            position: category.position,
            isActive: category.is_active,
        });
    }

    function editTag(tag: ContentTag) {
        setEditing({ kind: "tag", id: tag.id, name: tag.name, description: tag.description ?? "" });
    }

    async function saveEditing() {
        if (!editing?.name.trim()) return;
        try {
            if (editing.kind === "category") {
                await mutations.update.mutateAsync({
                    id: editing.id,
                    kind: "category",
                    name: editing.name.trim(),
                    description: editing.description.trim() || null,
                    parent_id: editing.parentId === ROOT_CATEGORY ? null : Number(editing.parentId),
                    position: editing.position,
                    is_active: editing.isActive,
                });
            } else {
                await mutations.update.mutateAsync({
                    id: editing.id,
                    kind: "tag",
                    name: editing.name.trim(),
                    description: editing.description.trim() || null,
                });
            }
            setEditing(null);
            toast.add({ title: "تغییرات ذخیره شد", data: { tone: "success" } });
        } catch {
            toast.add({
                title: "ذخیره تغییرات ناموفق بود",
                description: "ساختار والد، نام و یکتایی Slug را بررسی کنید.",
                data: { tone: "error" },
            });
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <PageHeader title="دسته‌ها و برچسب‌ها" subtitle="ساخت معماری محتوایی منظم برای جست‌وجو، فیلتر، لینک‌سازی و گزارش‌گیری." />
            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <SectionTitle
                            title="دسته‌ها"
                            description="ساختار اصلی و پایدار محتوا؛ دسته والد، ترتیب و وضعیت انتشار را مدیریت کنید."
                        />
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-lg border bg-muted/20 p-4">
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="category-name">نام دسته</Label>
                                    <Input
                                        id="category-name"
                                        value={categoryName}
                                        onChange={(event) => setCategoryName(event.target.value)}
                                        placeholder="مثلاً راهنمای انتخاب"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="category-description">توضیح کوتاه</Label>
                                    <Textarea
                                        id="category-description"
                                        value={categoryDescription}
                                        onChange={(event) => setCategoryDescription(event.target.value)}
                                        rows={3}
                                        placeholder="دامنه و هدف دسته را مشخص کنید."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>دسته والد</Label>
                                    <Select
                                        value={categoryParentId}
                                        onValueChange={(value) => {
                                            if (typeof value === "string") setCategoryParentId(value);
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ROOT_CATEGORY}>بدون والد؛ دسته اصلی</SelectItem>
                                            {categories
                                                .filter((category) => category.is_active)
                                                .map((category) => (
                                                    <SelectItem key={category.id} value={String(category.id)}>
                                                        {category.name}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button disabled={!categoryName.trim() || mutations.create.isPending} onClick={createCategory}>
                                    <Plus className="size-4" />
                                    افزودن دسته
                                </Button>
                            </div>
                        </div>
                        {taxonomy.isPending ? (
                            ["category-1", "category-2", "category-3", "category-4"].map((key) => (
                                <Skeleton key={key} className="h-16" />
                            ))
                        ) : taxonomy.isError ? (
                            <EmptyState icon={FolderTree} title="دریافت دسته‌ها ناموفق بود" />
                        ) : categories.length === 0 ? (
                            <EmptyState
                                icon={FolderTree}
                                title="دسته‌ای ساخته نشده است"
                                description="اولین دسته اصلی محتوا را اضافه کنید."
                            />
                        ) : (
                            <div className="space-y-2">
                                {categories.map((category) => (
                                    <div
                                        key={category.id}
                                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-sm">{category.name}</p>
                                                {!category.is_active ? (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                                        غیرفعال
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="mt-1 truncate text-muted-foreground text-xs">
                                                {category.parent_id
                                                    ? `زیرمجموعه ${categoryNames.get(category.parent_id) ?? "دسته حذف‌شده"}`
                                                    : "دسته اصلی"}{" "}
                                                · <span dir="ltr">/{category.slug}</span>
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="me-1 whitespace-nowrap text-muted-foreground text-xs">
                                                {formatNumber(category.posts_count, locale)} نوشته
                                            </span>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={`ویرایش دسته ${category.name}`}
                                                onClick={() => editCategory(category)}
                                            >
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                aria-label={`حذف دسته ${category.name}`}
                                                disabled={category.posts_count > 0 || mutations.remove.isPending}
                                                onClick={() => mutations.remove.mutate({ id: category.id, kind: "category" })}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <SectionTitle
                            title="برچسب‌ها"
                            description="برای موضوعات عرضی و قابل استفاده در چند دسته؛ نام و توضیح برچسب‌ها قابل ویرایش است."
                        />
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="rounded-lg border bg-muted/20 p-4">
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="tag-name">نام برچسب</Label>
                                    <Input
                                        id="tag-name"
                                        value={tagName}
                                        onChange={(event) => setTagName(event.target.value)}
                                        placeholder="مثلاً مقایسه محصول"
                                    />
                                </div>
                                <Button disabled={!tagName.trim() || mutations.create.isPending} onClick={createTag}>
                                    <Plus className="size-4" />
                                    افزودن برچسب
                                </Button>
                            </div>
                        </div>
                        {taxonomy.isPending ? (
                            ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5"].map((key) => <Skeleton key={key} className="h-12" />)
                        ) : taxonomy.isError ? (
                            <EmptyState icon={Tags} title="دریافت برچسب‌ها ناموفق بود" />
                        ) : tags.length === 0 ? (
                            <EmptyState icon={Tags} title="برچسبی ساخته نشده است" />
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <div
                                        key={tag.id}
                                        className="inline-flex items-center gap-1 rounded-lg border bg-card px-2 py-1.5"
                                    >
                                        <span className="px-1 text-sm">{tag.name}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {formatNumber(tag.posts_count, locale)}
                                        </span>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-7"
                                            aria-label={`ویرایش برچسب ${tag.name}`}
                                            onClick={() => editTag(tag)}
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-7"
                                            aria-label={`حذف برچسب ${tag.name}`}
                                            disabled={tag.posts_count > 0 || mutations.remove.isPending}
                                            onClick={() => mutations.remove.mutate({ id: tag.id, kind: "tag" })}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing?.kind === "category" ? "ویرایش دسته" : "ویرایش برچسب"}</DialogTitle>
                        <DialogDescription>تغییرات پس از ذخیره در فیلترها، ویرایشگر و گزارش‌ها اعمال می‌شوند.</DialogDescription>
                    </DialogHeader>
                    {editing ? (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="taxonomy-edit-name">نام</Label>
                                <Input
                                    id="taxonomy-edit-name"
                                    value={editing.name}
                                    onChange={(event) =>
                                        setEditing((current) => (current ? { ...current, name: event.target.value } : current))
                                    }
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="taxonomy-edit-description">توضیح</Label>
                                <Textarea
                                    id="taxonomy-edit-description"
                                    rows={3}
                                    value={editing.description}
                                    onChange={(event) =>
                                        setEditing((current) =>
                                            current ? { ...current, description: event.target.value } : current,
                                        )
                                    }
                                />
                            </div>
                            {editing.kind === "category" ? (
                                <>
                                    <div className="space-y-1.5">
                                        <Label>دسته والد</Label>
                                        <Select
                                            value={editing.parentId}
                                            onValueChange={(value) =>
                                                setEditing((current) =>
                                                    current?.kind === "category"
                                                        ? {
                                                              ...current,
                                                              parentId: typeof value === "string" ? value : current.parentId,
                                                          }
                                                        : current,
                                                )
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={ROOT_CATEGORY}>بدون والد؛ دسته اصلی</SelectItem>
                                                {categories
                                                    .filter((category) => category.id !== editing.id && category.is_active)
                                                    .map((category) => (
                                                        <SelectItem key={category.id} value={String(category.id)}>
                                                            {category.name}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="taxonomy-edit-position">ترتیب نمایش</Label>
                                        <Input
                                            id="taxonomy-edit-position"
                                            type="number"
                                            min={0}
                                            max={100000}
                                            value={editing.position}
                                            onChange={(event) =>
                                                setEditing((current) =>
                                                    current?.kind === "category"
                                                        ? { ...current, position: Math.max(0, Number(event.target.value) || 0) }
                                                        : current,
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                                        <span>
                                            <span className="block font-medium text-sm">دسته فعال باشد</span>
                                            <span className="mt-1 block text-muted-foreground text-xs">
                                                دسته غیرفعال در انتخاب نوشته‌های جدید نمایش داده نمی‌شود.
                                            </span>
                                        </span>
                                        <Switch
                                            checked={editing.isActive}
                                            onCheckedChange={(value) =>
                                                setEditing((current) =>
                                                    current?.kind === "category"
                                                        ? { ...current, isActive: value === true }
                                                        : current,
                                                )
                                            }
                                        />
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>
                            انصراف
                        </Button>
                        <Button disabled={!editing?.name.trim() || mutations.update.isPending} onClick={saveEditing}>
                            ذخیره تغییرات
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
