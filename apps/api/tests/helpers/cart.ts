import db from "@adonisjs/lucid/services/db";

import InventoryItem from "#models/inventory_item";
import Product from "#models/product";
import ProductTranslation from "#models/product_translation";
import ProductVariation from "#models/product_variation";
import ProductVariationTranslation from "#models/product_variation_translation";

let seq = 0;

/**
 * Truncate every phase-04 table along with the catalog rows tests seed. RESTART IDENTITY keeps
 * primary keys deterministic across tests, CASCADE wipes child rows in one statement. The carts
 * table cascade also clears `cart_items` and `cart_applied_coupons` through the FK chain.
 */
export async function truncatePhase04Tables(): Promise<void> {
    const tables = [
        "cart_applied_coupons",
        "cart_items",
        "carts",
        "inventory_movements",
        "inventory_items",
        "product_variation_translations",
        "product_variations",
        "product_translations",
        "products",
        "customer_iran_profiles",
        "customer_addresses",
        "customers",
        "auth_access_tokens",
        "password_reset_tokens",
        "users",
    ];
    await db.rawQuery(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    seq = 0;
}

/**
 * Reset every phase-04 table AND repopulate the foundation/shipping/tax seed rows so functional
 * tests see the same world a fresh deployment would. The catalog seeder is intentionally not
 * re-run — tests assemble their own products through {@link createTaxableProduct} et al.
 *
 * The foundation seed is the long pole of the CI test suite (hundreds of `updateOrCreate` calls
 * per reset × hundreds of tests easily blew the 6-min CI timeout). The truncate scope doesn't
 * touch the foundation tables on its own, but other helpers (e.g. `resetPhase08`) `TRUNCATE …
 * CASCADE` chains that can wipe `payment_gateways`. A single cheap COUNT probe tells us whether
 * the foundation needs reseeding — skip it when it's still intact, run it when it isn't.
 */
export async function resetWithFoundation(): Promise<void> {
    await truncatePhase04Tables();
    const probe = (await db.from("payment_gateways").count("* as c").first()) as
        | { c: number | string }
        | undefined;
    if (Number(probe?.c ?? 0) > 0) return;
    const FoundationSeeder = (await import("#database/seed_modules/0001_foundation_seeder")).default;
    const seeder = new FoundationSeeder(db.connection());
    await seeder.run();
}

interface CreateProductOptions {
    regularPrice: number;
    salePrice?: number | null;
    soldIndividually?: boolean;
    virtual?: boolean;
    stockStatus?: "instock" | "outofstock" | "onbackorder";
    type?: "simple" | "variable";
    taxStatus?: "taxable" | "shipping" | "none";
}

/**
 * Materialize a publishable, taxable product with a matching inventory row. Defaults align with
 * the Iran-VAT MVP catalog (taxable, in stock, not sold-individually). Returns the persisted
 * `Product` so tests can grab the id for cart actions.
 */
export async function createTaxableProduct(options: CreateProductOptions): Promise<Product> {
    seq += 1;
    const taxClass = await db.from("tax_classes").where("slug", "standard").select("id").first();
    const product = await Product.create({
        type: options.type ?? "simple",
        sku: `SKU-${seq}-${Date.now()}`,
        status: "publish",
        catalogVisibility: "visible",
        featured: false,
        virtual: options.virtual ?? false,
        downloadable: false,
        regularPrice: options.regularPrice,
        salePrice: options.salePrice ?? null,
        taxStatus: options.taxStatus ?? "taxable",
        taxClassId: taxClass?.id ? Number(taxClass.id) : null,
        soldIndividually: options.soldIndividually ?? false,
        reviewsAllowed: true,
        menuOrder: 0,
        attributes: {},
    });

    await ProductTranslation.createMany([
        {
            productId: product.id,
            locale: "fa",
            name: `محصول ${seq}`,
            slug: `محصول-${seq}-${Date.now()}`,
            description: "تستی",
            shortDescription: "تستی",
            purchaseNote: null,
            externalButtonText: null,
        },
        {
            productId: product.id,
            locale: "en",
            name: `Product ${seq}`,
            slug: `product-${seq}-${Date.now()}`,
            description: "Test",
            shortDescription: "Test",
            purchaseNote: null,
            externalButtonText: null,
        },
    ]);

    if (!options.virtual) {
        await InventoryItem.create({
            productId: product.id,
            variationId: null,
            locationId: null,
            stockQuantity: 100,
            manageStock: true,
            backorders: "no",
            lowStockThreshold: null,
            stockStatus: options.stockStatus ?? "instock",
        });
    }

    return product;
}

/**
 * Materialize a single variation for a variable product, with its own inventory row. Returns the
 * persisted variation so tests can add it to a cart by id.
 */
export async function createVariation(product: Product, regularPrice: number): Promise<ProductVariation> {
    seq += 1;
    const variation = await ProductVariation.create({
        productId: product.id,
        sku: `VAR-${seq}-${Date.now()}`,
        regularPrice,
        salePrice: null,
        weightGrams: null,
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        imageMediaId: null,
        virtual: false,
        downloadable: false,
        taxClassId: null,
        manageStockMode: "own",
        menuOrder: 0,
        attributes: {},
    });

    await ProductVariationTranslation.create({
        variationId: variation.id,
        locale: "fa",
        description: "تستی",
    });

    await InventoryItem.create({
        productId: product.id,
        variationId: variation.id,
        locationId: null,
        stockQuantity: 50,
        manageStock: true,
        backorders: "no",
        lowStockThreshold: null,
        stockStatus: "instock",
    });

    return variation;
}
