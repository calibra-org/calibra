import { BaseSeeder } from "@adonisjs/lucid/seeders";

import Product from "#models/product";

/**
 * Seeds three sample products so the storefront has something to render on a fresh DB. Idempotent
 * via `updateOrCreate` keyed on `slug`.
 */
export default class extends BaseSeeder {
    async run() {
        await Product.updateOrCreateMany("slug", [
            {
                slug: "sample-tee",
                name: "Sample Tee",
                description: "A soft cotton tee that ships from the seed file.",
                priceCents: 2_500,
                currency: "USD",
                stockQuantity: 100,
                imageUrl: null,
            },
            {
                slug: "sample-mug",
                name: "Sample Mug",
                description: "Ceramic mug, 12oz. Replace with real product data.",
                priceCents: 1_500,
                currency: "USD",
                stockQuantity: 50,
                imageUrl: null,
            },
            {
                slug: "sample-notebook",
                name: "Sample Notebook",
                description: "A5 dotted notebook, 200 pages.",
                priceCents: 1_800,
                currency: "USD",
                stockQuantity: 25,
                imageUrl: null,
            },
        ]);
    }
}
