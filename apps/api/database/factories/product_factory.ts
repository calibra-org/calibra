import factory from "@adonisjs/lucid/factories";

import Media from "#models/media";
import Product from "#models/product";
import ProductBrand from "#models/product_brand";
import ProductCategory from "#models/product_category";
import ProductImage from "#models/product_image";
import ProductTranslation from "#models/product_translation";

/**
 * Factories for catalog entities. Each factory generates a deterministic-ish but unique row so
 * functional tests can compose them (`ProductFactory.merge({...}).with('translations', 2).create()`)
 * without colliding on unique constraints between runs.
 *
 * Translations are added via the `withTranslations` state, since the test usually wants both fa + en
 * locales on the same row to exercise the i18n flow.
 */
export const ProductCategoryFactory = factory
    .define(ProductCategory, ({ faker }) => ({
        parentId: null,
        display: "default",
        imageMediaId: null,
        menuOrder: faker.number.int({ min: 1, max: 100 }),
        attributes: {},
    }))
    .build();

export const ProductBrandFactory = factory
    .define(ProductBrand, ({ faker }) => ({
        imageMediaId: null,
        menuOrder: faker.number.int({ min: 1, max: 100 }),
        attributes: {},
    }))
    .build();

export const MediaFactory = factory
    .define(Media, ({ faker }) => ({
        kind: "image",
        url: `http://localhost/uploads/test/${faker.string.uuid()}.jpg`,
        mime: "image/jpeg",
        width: 600,
        height: 600,
        alt: faker.commerce.productName(),
        attributes: {},
    }))
    .build();

export const ProductFactory = factory
    .define(Product, ({ faker }) => ({
        type: "simple",
        sku: `SKU-${faker.string.alphanumeric(8).toUpperCase()}`,
        status: "publish",
        catalogVisibility: "visible",
        featured: false,
        virtual: false,
        downloadable: false,
        regularPrice: faker.number.int({ min: 1_000_000, max: 50_000_000 }),
        salePrice: null,
        taxStatus: "taxable",
        soldIndividually: false,
        reviewsAllowed: true,
        menuOrder: 0,
        attributes: {},
    }))
    .state("variable", (row) => (row.type = "variable"))
    .state("draft", (row) => (row.status = "draft"))
    .state("featured", (row) => (row.featured = true))
    .state("onSale", (row) => {
        row.regularPrice = 10_000_000;
        row.salePrice = 7_500_000;
    })
    .after("create", async (_factory, product) => {
        await ProductTranslation.createMany([
            {
                productId: product.id,
                locale: "fa",
                name: `محصول ${product.id}`,
                slug: `محصول-${product.id}`,
                description: "توضیحات محصول",
                shortDescription: "خلاصه",
                purchaseNote: null,
                externalButtonText: null,
            },
            {
                productId: product.id,
                locale: "en",
                name: `Product ${product.id}`,
                slug: `product-${product.id}`,
                description: "Product description",
                shortDescription: "Summary",
                purchaseNote: null,
                externalButtonText: null,
            },
        ]);
    })
    .build();

export const ProductImageFactory = factory
    .define(ProductImage, () => ({
        productId: 0 as unknown as bigint,
        mediaId: 0 as unknown as bigint,
        position: 0,
    }))
    .build();
