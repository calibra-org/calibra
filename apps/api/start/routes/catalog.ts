import router from "@adonisjs/core/services/router";

import AttributesController from "#controllers/catalog/attributes_controller";
import BrandsController from "#controllers/catalog/brands_controller";
import CategoriesController from "#controllers/catalog/categories_controller";
import ProductsController from "#controllers/catalog/products_controller";
import ReviewsController from "#controllers/catalog/reviews_controller";
import TagsController from "#controllers/catalog/tags_controller";

router
    .group(() => {
        router.get("/products", [ProductsController, "index"]).as("catalog.products.index");
        router.get("/products/:slug", [ProductsController, "show"]).as("catalog.products.show");
        router.get("/products/:id/variations", [ProductsController, "variations"]).as("catalog.products.variations");
        router.get("/products/:id/reviews", [ReviewsController, "index"]).as("catalog.reviews.index");
        router.post("/products/:id/reviews", [ReviewsController, "store"]).as("catalog.reviews.store");

        router.get("/categories", [CategoriesController, "index"]).as("catalog.categories.index");
        router.get("/categories/:slug", [CategoriesController, "show"]).as("catalog.categories.show");

        router.get("/tags", [TagsController, "index"]).as("catalog.tags.index");
        router.get("/brands", [BrandsController, "index"]).as("catalog.brands.index");

        router.get("/attributes", [AttributesController, "index"]).as("catalog.attributes.index");
        router.get("/attributes/:id/terms", [AttributesController, "terms"]).as("catalog.attributes.terms");
    })
    .prefix("/api/v1");
