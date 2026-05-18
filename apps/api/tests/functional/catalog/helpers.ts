import Product from "#models/product";
import ProductAttribute from "#models/product_attribute";
import ProductAttributeTerm from "#models/product_attribute_term";
import ProductAttributeTermTranslation from "#models/product_attribute_term_translation";
import ProductAttributeTranslation from "#models/product_attribute_translation";
import ProductBrand from "#models/product_brand";
import ProductBrandTranslation from "#models/product_brand_translation";
import ProductCategory from "#models/product_category";
import ProductCategoryTranslation from "#models/product_category_translation";
import ProductTag from "#models/product_tag";
import ProductTagTranslation from "#models/product_tag_translation";
import ProductTranslation from "#models/product_translation";

let serial = 1;

/** Internal counter that guarantees unique slugs across the test run without leaking state. */
function nextSerial() {
    return serial++;
}

/** Seed a single product with fa + en translations. */
export async function createProduct(opts: {
    fa: { name: string; slug?: string };
    en: { name: string; slug?: string };
    type?: "simple" | "variable";
    status?: "publish" | "draft";
    regularPrice?: number;
    salePrice?: number | null;
    featured?: boolean;
}): Promise<Product> {
    const product = await Product.create({
        type: opts.type ?? "simple",
        sku: `SKU-${nextSerial()}`,
        status: opts.status ?? "publish",
        catalogVisibility: "visible",
        featured: opts.featured ?? false,
        virtual: false,
        downloadable: false,
        regularPrice: opts.regularPrice ?? 1_000_000,
        salePrice: opts.salePrice ?? null,
        taxStatus: "taxable",
        soldIndividually: false,
        reviewsAllowed: true,
        menuOrder: 0,
        attributes: {},
    });
    const id = nextSerial();
    await ProductTranslation.create({
        productId: product.id,
        locale: "fa",
        name: opts.fa.name,
        slug: opts.fa.slug ?? `محصول-${id}`,
        description: "توضیحات تستی",
        shortDescription: "تستی",
        purchaseNote: null,
        externalButtonText: null,
    });
    await ProductTranslation.create({
        productId: product.id,
        locale: "en",
        name: opts.en.name,
        slug: opts.en.slug ?? `product-${id}`,
        description: "Test description",
        shortDescription: "Test",
        purchaseNote: null,
        externalButtonText: null,
    });
    return product;
}

/** Seed a category with fa + en translations and optionally attach products. */
export async function createCategory(opts: {
    fa: { name: string; slug?: string };
    en: { name: string; slug?: string };
    parentId?: bigint | number | null;
    products?: Product[];
}): Promise<ProductCategory> {
    const category = await ProductCategory.create({
        parentId: opts.parentId ?? null,
        display: "default",
        imageMediaId: null,
        menuOrder: 0,
        attributes: {},
    });
    const id = nextSerial();
    await ProductCategoryTranslation.create({
        categoryId: category.id,
        locale: "fa",
        name: opts.fa.name,
        slug: opts.fa.slug ?? `cat-fa-${id}`,
    });
    await ProductCategoryTranslation.create({
        categoryId: category.id,
        locale: "en",
        name: opts.en.name,
        slug: opts.en.slug ?? `cat-en-${id}`,
    });
    if (opts.products) await category.related("products").attach(opts.products.map((p) => String(p.id)));
    return category;
}

export async function createTag(opts: {
    fa: { name: string; slug: string };
    en: { name: string; slug: string };
}): Promise<ProductTag> {
    const tag = await ProductTag.create({ menuOrder: 0, attributes: {} });
    await ProductTagTranslation.create({ tagId: tag.id, locale: "fa", name: opts.fa.name, slug: opts.fa.slug });
    await ProductTagTranslation.create({ tagId: tag.id, locale: "en", name: opts.en.name, slug: opts.en.slug });
    return tag;
}

export async function createBrand(opts: {
    fa: { name: string; slug: string };
    en: { name: string; slug: string };
}): Promise<ProductBrand> {
    const brand = await ProductBrand.create({ imageMediaId: null, menuOrder: 0, attributes: {} });
    await ProductBrandTranslation.create({ brandId: brand.id, locale: "fa", name: opts.fa.name, slug: opts.fa.slug });
    await ProductBrandTranslation.create({ brandId: brand.id, locale: "en", name: opts.en.name, slug: opts.en.slug });
    return brand;
}

export async function createAttributeWithTerm(opts: {
    code: string;
    attrFa: string;
    attrEn: string;
    term: { fa: string; en: string; slug: string };
}): Promise<{ attribute: ProductAttribute; term: ProductAttributeTerm }> {
    const attribute = await ProductAttribute.create({
        code: opts.code,
        orderBy: "menu_order",
        hasArchives: false,
        attributes: {},
    });
    await ProductAttributeTranslation.create({ attributeId: attribute.id, locale: "fa", name: opts.attrFa });
    await ProductAttributeTranslation.create({ attributeId: attribute.id, locale: "en", name: opts.attrEn });
    const term = await ProductAttributeTerm.create({ attributeId: attribute.id, menuOrder: 0, attributes: {} });
    await ProductAttributeTermTranslation.create({
        termId: term.id,
        locale: "fa",
        name: opts.term.fa,
        slug: `${opts.code}-${opts.term.slug}-fa`,
    });
    await ProductAttributeTermTranslation.create({
        termId: term.id,
        locale: "en",
        name: opts.term.en,
        slug: `${opts.code}-${opts.term.slug}`,
    });
    return { attribute, term };
}
