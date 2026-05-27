import { belongsTo, hasMany, manyToMany, scope } from "@adonisjs/lucid/orm";
import type { ModelQueryBuilderContract } from "@adonisjs/lucid/types/model";
import type { BelongsTo, HasMany, ManyToMany } from "@adonisjs/lucid/types/relations";

import { ProductSchema } from "#database/schema";
import InventoryItem from "#models/inventory_item";
import ProductAttributeLink from "#models/product_attribute_link";
import ProductBrand from "#models/product_brand";
import ProductCategory from "#models/product_category";
import ProductCustomAttribute from "#models/product_custom_attribute";
import ProductDownload from "#models/product_download";
import ProductImage from "#models/product_image";
import ProductReview from "#models/product_review";
import ProductShippingClass from "#models/product_shipping_class";
import ProductTag from "#models/product_tag";
import ProductTranslation from "#models/product_translation";
import ProductVariation from "#models/product_variation";
import TaxClass from "#models/tax_class";

/**
 * The active product. `notTrashed` excludes the deleted_at sentinel; `published` further restricts
 * to the storefront-visible subset. Both compose with normal query builders.
 */
type ProductQuery = ModelQueryBuilderContract<typeof Product>;

export default class Product extends ProductSchema {
    static table = "products";

    @hasMany(() => ProductTranslation, { foreignKey: "productId" })
    declare translations: HasMany<typeof ProductTranslation>;

    @hasMany(() => ProductVariation, { foreignKey: "productId" })
    declare variations: HasMany<typeof ProductVariation>;

    @hasMany(() => ProductImage, { foreignKey: "productId" })
    declare images: HasMany<typeof ProductImage>;

    @hasMany(() => ProductAttributeLink, { foreignKey: "productId" })
    declare attributeLinks: HasMany<typeof ProductAttributeLink>;

    @hasMany(() => ProductCustomAttribute, { foreignKey: "productId" })
    declare customAttributes: HasMany<typeof ProductCustomAttribute>;

    @hasMany(() => ProductReview, { foreignKey: "productId" })
    declare reviews: HasMany<typeof ProductReview>;

    @hasMany(() => ProductDownload, { foreignKey: "productId" })
    declare downloads: HasMany<typeof ProductDownload>;

    @hasMany(() => InventoryItem, { foreignKey: "productId" })
    declare inventoryItems: HasMany<typeof InventoryItem>;

    @manyToMany(() => ProductCategory, {
        pivotTable: "product_category_links",
        localKey: "id",
        pivotForeignKey: "product_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "category_id",
    })
    declare categories: ManyToMany<typeof ProductCategory>;

    @manyToMany(() => ProductTag, {
        pivotTable: "product_tag_links",
        localKey: "id",
        pivotForeignKey: "product_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "tag_id",
    })
    declare tags: ManyToMany<typeof ProductTag>;

    @manyToMany(() => ProductBrand, {
        pivotTable: "product_brand_links",
        localKey: "id",
        pivotForeignKey: "product_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "brand_id",
    })
    declare brands: ManyToMany<typeof ProductBrand>;

    @manyToMany(() => Product, {
        pivotTable: "product_cross_sells",
        localKey: "id",
        pivotForeignKey: "product_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "related_product_id",
        pivotColumns: ["position"],
    })
    declare crossSells: ManyToMany<typeof Product>;

    @manyToMany(() => Product, {
        pivotTable: "product_upsells",
        localKey: "id",
        pivotForeignKey: "product_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "related_product_id",
        pivotColumns: ["position"],
    })
    declare upsells: ManyToMany<typeof Product>;

    @manyToMany(() => Product, {
        pivotTable: "product_group_members",
        localKey: "id",
        pivotForeignKey: "group_product_id",
        relatedKey: "id",
        pivotRelatedForeignKey: "member_product_id",
        pivotColumns: ["position"],
    })
    declare groupedMembers: ManyToMany<typeof Product>;

    @belongsTo(() => TaxClass, { foreignKey: "taxClassId" })
    declare taxClass: BelongsTo<typeof TaxClass>;

    @belongsTo(() => ProductShippingClass, { foreignKey: "shippingClassId" })
    declare shippingClass: BelongsTo<typeof ProductShippingClass>;

    static notTrashed = scope((query: ProductQuery) => {
        query.whereNull("deleted_at");
    });

    static published = scope((query: ProductQuery) => {
        query.where("status", "publish").whereNull("deleted_at");
    });
}
