import { BaseTransformer } from "@adonisjs/core/transformers";

import type InventoryItem from "#models/inventory_item";
import type Product from "#models/product";
import { resolvePrice } from "#services/price_resolver";
import { pickTranslation } from "#transformers/i18n_helpers";

/** Final fallback when neither the per-row nor the global low-stock threshold is configured. */
const FALLBACK_LOW_STOCK_THRESHOLD = 5;

export interface ProductTransformerOptions {
    /**
     * Global low-stock threshold from the `inventory.low_stock_threshold` setting. Per-row
     * `inventory_items.low_stock_threshold` overrides this; this is the fallback when the row
     * leaves it null (which is the common case — operators rarely set it per-row).
     */
    defaultLowStockThreshold?: number;
}

export default class ProductTransformer extends BaseTransformer<Product> {
    constructor(
        resource: Product,
        protected locale: string = "fa",
        protected options: ProductTransformerOptions = {},
    ) {
        super(resource);
    }

    toObject() {
        const p = this.resource;
        const translation = pickTranslation(p.translations, this.locale);
        const price = resolvePrice({
            regularPrice: p.regularPrice,
            salePrice: p.salePrice,
            saleStartsAt: p.saleStartsAt,
            saleEndsAt: p.saleEndsAt,
        });

        const images = (p.images ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((img) => ({
                id: Number(img.id),
                media_id: Number(img.mediaId),
                position: img.position,
                url: img.media?.url ?? null,
                alt: img.media?.alt ?? null,
            }));

        return {
            id: Number(p.id),
            type: p.type,
            sku: p.sku,
            gtin: (p as unknown as { gtin?: string | null }).gtin ?? null,
            status: p.status,
            catalog_visibility: p.catalogVisibility,
            featured: p.featured,
            virtual: p.virtual,
            downloadable: p.downloadable,
            regular_price: p.regularPrice === null ? null : Number(p.regularPrice),
            sale_price: p.salePrice === null ? null : Number(p.salePrice),
            effective_price: price.effectivePrice === null ? null : Number(price.effectivePrice),
            on_sale: price.onSale,
            sale_starts_at: p.saleStartsAt?.toISO() ?? null,
            sale_ends_at: p.saleEndsAt?.toISO() ?? null,
            tax_class_id: p.taxClassId === null ? null : Number(p.taxClassId),
            tax_status: p.taxStatus,
            shipping_class_id: p.shippingClassId === null ? null : Number(p.shippingClassId),
            weight_grams: p.weightGrams,
            length_mm: p.lengthMm,
            width_mm: p.widthMm,
            height_mm: p.heightMm,
            sold_individually: p.soldIndividually,
            reviews_allowed: p.reviewsAllowed,
            external_url: p.externalUrl,
            menu_order: p.menuOrder,
            name: translation?.name ?? null,
            slug: translation?.slug ?? null,
            short_description: translation?.shortDescription ?? null,
            locale: translation?.locale ?? this.locale,
            featured_image_url: images[0]?.url ?? null,
            gallery_image_urls: images.map((img) => img.url).filter((url): url is string => typeof url === "string"),
        };
    }

    forDetail() {
        const p = this.resource;
        const translation = pickTranslation(p.translations, this.locale);
        const base = this.toObject();

        const images = (p.images ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((img) => ({
                id: Number(img.id),
                media_id: Number(img.mediaId),
                position: img.position,
                url: img.media?.url ?? null,
                alt: img.media?.alt ?? null,
            }));

        const variations = (p.variations ?? []).map((v) => {
            const variationPrice = resolvePrice(
                { regularPrice: p.regularPrice, salePrice: p.salePrice, saleStartsAt: p.saleStartsAt, saleEndsAt: p.saleEndsAt },
                v,
            );
            return {
                id: Number(v.id),
                sku: v.sku,
                gtin: (v as unknown as { gtin?: string | null }).gtin ?? null,
                regular_price: v.regularPrice === null ? null : Number(v.regularPrice),
                sale_price: v.salePrice === null ? null : Number(v.salePrice),
                effective_price: variationPrice.effectivePrice === null ? null : Number(variationPrice.effectivePrice),
                on_sale: variationPrice.onSale,
                manage_stock_mode: v.manageStockMode,
                attribute_pins: (v.attributePins ?? []).map((pin) => ({
                    attribute_id: Number(pin.attributeId),
                    term_id: Number(pin.termId),
                })),
            };
        });

        const attributeLinks = (p.attributeLinks ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((link) => ({
                id: Number(link.id),
                attribute_id: Number(link.attributeId),
                position: link.position,
                visible: link.visible,
                used_for_variation: link.usedForVariation,
                term_ids: (link.terms ?? []).map((t) => Number(t.id)),
            }));

        const customAttributes = (
            (
                p as unknown as {
                    customAttributes?: {
                        id: bigint | number;
                        position: number;
                        name: string;
                        values: unknown;
                        visible: boolean;
                    }[];
                }
            ).customAttributes ?? []
        )
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((row) => ({
                id: Number(row.id),
                position: row.position,
                name: row.name,
                values: Array.isArray(row.values) ? (row.values as string[]) : [],
                visible: Boolean(row.visible),
            }));

        const categories = (p.categories ?? []).map((c) => ({
            id: Number(c.id),
            name: pickTranslation(c.translations, this.locale)?.name ?? null,
            slug: pickTranslation(c.translations, this.locale)?.slug ?? null,
        }));
        const tags = (p.tags ?? []).map((t) => ({
            id: Number(t.id),
            name: pickTranslation(t.translations, this.locale)?.name ?? null,
            slug: pickTranslation(t.translations, this.locale)?.slug ?? null,
        }));
        const brands = (p.brands ?? []).map((b) => ({
            id: Number(b.id),
            name: pickTranslation(b.translations, this.locale)?.name ?? null,
            slug: pickTranslation(b.translations, this.locale)?.slug ?? null,
        }));

        return {
            ...base,
            description: translation?.description ?? null,
            purchase_note: translation?.purchaseNote ?? null,
            images,
            variations,
            attribute_links: attributeLinks,
            custom_attributes: customAttributes,
            categories,
            tags,
            brands,
            inventory: this.buildInventoryAggregate(p.inventoryItems ?? []),
        };
    }

    forAdmin() {
        const p = this.resource;
        const detail = this.forDetail();
        const upsellIds = ((p as unknown as { upsells?: Product[] }).upsells ?? [])
            .slice()
            .sort((a, b) => Number(a.$extras.pivot_position ?? 0) - Number(b.$extras.pivot_position ?? 0))
            .map((row) => Number(row.id));
        const crossSellIds = ((p as unknown as { crossSells?: Product[] }).crossSells ?? [])
            .slice()
            .sort((a, b) => Number(a.$extras.pivot_position ?? 0) - Number(b.$extras.pivot_position ?? 0))
            .map((row) => Number(row.id));
        const groupedMemberIds = ((p as unknown as { groupedMembers?: Product[] }).groupedMembers ?? [])
            .slice()
            .sort((a, b) => Number(a.$extras.pivot_position ?? 0) - Number(b.$extras.pivot_position ?? 0))
            .map((row) => Number(row.id));
        const downloads = (p.downloads ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((row) => ({
                id: Number(row.id),
                media_id: Number(row.mediaId),
                file_label: row.fileLabel,
                download_limit: row.downloadLimit,
                download_expiry_days: row.downloadExpiryDays,
                position: row.position,
                url: row.media?.url ?? null,
            }));
        return {
            ...detail,
            global_unique_id: p.globalUniqueId,
            attributes: p.attributes ?? {},
            pos_available: (p as unknown as { posAvailable?: boolean }).posAvailable ?? true,
            default_variation_id:
                (p as unknown as { defaultVariationId?: number | null }).defaultVariationId === null ||
                (p as unknown as { defaultVariationId?: number | null }).defaultVariationId === undefined
                    ? null
                    : Number((p as unknown as { defaultVariationId: number }).defaultVariationId),
            upsell_ids: upsellIds,
            cross_sell_ids: crossSellIds,
            grouped_member_ids: groupedMemberIds,
            downloads,
            translations: (p.translations ?? []).map((t) => ({
                locale: t.locale,
                name: t.name,
                slug: t.slug,
                description: t.description,
                short_description: t.shortDescription,
                purchase_note: t.purchaseNote,
                external_button_text: t.externalButtonText,
            })),
            created_at: p.createdAt?.toISO(),
            updated_at: p.updatedAt?.toISO(),
            deleted_at: p.deletedAt?.toISO() ?? null,
        };
    }

    /**
     * Rolls up inventory across both product-level rows and variation-level rows. The list cell
     * needs the *operator-meaningful* total — for a variable product that's the sum across every
     * variation's stock; for a simple product it's the per-product row. The `locations` slot
     * still surfaces only the product-level rows so the per-warehouse editor (Prompt 2) doesn't
     * accidentally try to edit a variation row as if it were a warehouse.
     *
     * `low_stock` resolves the threshold in priority order:
     *   1. `inventory_items.low_stock_threshold` (per-row override)
     *   2. `this.options.defaultLowStockThreshold` (global `inventory.low_stock_threshold` setting)
     *   3. `FALLBACK_LOW_STOCK_THRESHOLD` (hard-coded baseline)
     */
    private buildInventoryAggregate(items: InventoryItem[]) {
        const productLevel = items.filter((i) => i.variationId === null || i.variationId === undefined);
        const total = items.reduce((sum, i) => sum + Number(i.stockQuantity ?? 0), 0);
        const defaultThreshold = this.options.defaultLowStockThreshold ?? FALLBACK_LOW_STOCK_THRESHOLD;
        const locations = productLevel.map((i) => ({
            id: Number(i.id),
            location_id: i.locationId === null || i.locationId === undefined ? null : Number(i.locationId),
            stock_quantity: Number(i.stockQuantity ?? 0),
            manage_stock: !!i.manageStock,
            low_stock_threshold: i.lowStockThreshold ?? null,
            backorders: i.backorders ?? "no",
            stock_status: i.stockStatus ?? "instock",
        }));
        const lowStockHit = items.some((i) => {
            if (!i.manageStock) return false;
            const qty = Number(i.stockQuantity ?? 0);
            if (qty <= 0) return false;
            const threshold = i.lowStockThreshold ?? defaultThreshold;
            return qty <= threshold;
        });
        return {
            total,
            low_stock: lowStockHit,
            default_low_stock_threshold: defaultThreshold,
            locations,
        };
    }
}
