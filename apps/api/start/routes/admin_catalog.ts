import router from "@adonisjs/core/services/router";

import AdminAttributeTermsController from "#controllers/admin/catalog/attribute_terms_controller";
import AdminAttributesController from "#controllers/admin/catalog/attributes_controller";
import AdminBrandsController from "#controllers/admin/catalog/brands_controller";
import AdminCategoriesController from "#controllers/admin/catalog/categories_controller";
import AdminProductsController from "#controllers/admin/catalog/products_controller";
import AdminReviewsController from "#controllers/admin/catalog/reviews_controller";
import AdminShippingClassesController from "#controllers/admin/catalog/shipping_classes_controller";
import AdminTagsController from "#controllers/admin/catalog/tags_controller";
import AdminTaxClassesController from "#controllers/admin/catalog/tax_classes_controller";
import AdminVariationsController from "#controllers/admin/catalog/variations_controller";

router
    .group(() => {
        router.get("/products", [AdminProductsController, "index"]).as("admin.products.index");
        router.get("/products/counts", [AdminProductsController, "counts"]).as("admin.products.counts");
        router.get("/products/check-slug", [AdminProductsController, "checkSlug"]).as("admin.products.checkSlug");
        router.post("/products", [AdminProductsController, "store"]).as("admin.products.store");
        router.post("/products/batch", [AdminProductsController, "batch"]).as("admin.products.batch");
        router.post("/products/restore", [AdminProductsController, "restoreBatch"]).as("admin.products.restoreBatch");
        router.get("/products/:id", [AdminProductsController, "show"]).as("admin.products.show");
        router.put("/products/:id", [AdminProductsController, "update"]).as("admin.products.update");
        router.patch("/products/:id", [AdminProductsController, "update"]).as("admin.products.patch");
        router.delete("/products/:id", [AdminProductsController, "destroy"]).as("admin.products.destroy");
        router.post("/products/:id/duplicate", [AdminProductsController, "duplicate"]).as("admin.products.duplicate");
        router.post("/products/:id/restore", [AdminProductsController, "restore"]).as("admin.products.restore");

        router.get("/products/:product_id/variations", [AdminVariationsController, "index"]).as("admin.variations.index");
        router.post("/products/:product_id/variations", [AdminVariationsController, "store"]).as("admin.variations.store");
        router.post("/products/:product_id/variations/batch", [AdminVariationsController, "batch"]).as("admin.variations.batch");
        router.put("/products/:product_id/variations/:id", [AdminVariationsController, "update"]).as("admin.variations.update");
        router.patch("/products/:product_id/variations/:id", [AdminVariationsController, "update"]).as("admin.variations.patch");
        router
            .delete("/products/:product_id/variations/:id", [AdminVariationsController, "destroy"])
            .as("admin.variations.destroy");

        router.get("/attributes", [AdminAttributesController, "index"]).as("admin.attributes.index");
        router.post("/attributes", [AdminAttributesController, "store"]).as("admin.attributes.store");
        router.get("/attributes/:id", [AdminAttributesController, "show"]).as("admin.attributes.show");
        router.put("/attributes/:id", [AdminAttributesController, "update"]).as("admin.attributes.update");
        router.patch("/attributes/:id", [AdminAttributesController, "update"]).as("admin.attributes.patch");
        router.delete("/attributes/:id", [AdminAttributesController, "destroy"]).as("admin.attributes.destroy");

        router.get("/attributes/:attribute_id/terms", [AdminAttributeTermsController, "index"]).as("admin.terms.index");
        router.post("/attributes/:attribute_id/terms", [AdminAttributeTermsController, "store"]).as("admin.terms.store");
        router.put("/attributes/:attribute_id/terms/:id", [AdminAttributeTermsController, "update"]).as("admin.terms.update");
        router.patch("/attributes/:attribute_id/terms/:id", [AdminAttributeTermsController, "update"]).as("admin.terms.patch");
        router
            .delete("/attributes/:attribute_id/terms/:id", [AdminAttributeTermsController, "destroy"])
            .as("admin.terms.destroy");

        router.get("/categories", [AdminCategoriesController, "index"]).as("admin.categories.index");
        router.post("/categories", [AdminCategoriesController, "store"]).as("admin.categories.store");
        router.get("/categories/:id", [AdminCategoriesController, "show"]).as("admin.categories.show");
        router.put("/categories/:id", [AdminCategoriesController, "update"]).as("admin.categories.update");
        router.patch("/categories/:id", [AdminCategoriesController, "update"]).as("admin.categories.patch");
        router.delete("/categories/:id", [AdminCategoriesController, "destroy"]).as("admin.categories.destroy");

        router.get("/tags", [AdminTagsController, "index"]).as("admin.tags.index");
        router.post("/tags", [AdminTagsController, "store"]).as("admin.tags.store");
        router.get("/tags/:id", [AdminTagsController, "show"]).as("admin.tags.show");
        router.put("/tags/:id", [AdminTagsController, "update"]).as("admin.tags.update");
        router.patch("/tags/:id", [AdminTagsController, "update"]).as("admin.tags.patch");
        router.delete("/tags/:id", [AdminTagsController, "destroy"]).as("admin.tags.destroy");

        router.get("/brands", [AdminBrandsController, "index"]).as("admin.brands.index");
        router.post("/brands", [AdminBrandsController, "store"]).as("admin.brands.store");
        router.get("/brands/:id", [AdminBrandsController, "show"]).as("admin.brands.show");
        router.put("/brands/:id", [AdminBrandsController, "update"]).as("admin.brands.update");
        router.patch("/brands/:id", [AdminBrandsController, "update"]).as("admin.brands.patch");
        router.delete("/brands/:id", [AdminBrandsController, "destroy"]).as("admin.brands.destroy");

        router.get("/shipping-classes", [AdminShippingClassesController, "index"]).as("admin.shippingClasses.index");
        router.post("/shipping-classes", [AdminShippingClassesController, "store"]).as("admin.shippingClasses.store");
        router.get("/shipping-classes/:id", [AdminShippingClassesController, "show"]).as("admin.shippingClasses.show");
        router.put("/shipping-classes/:id", [AdminShippingClassesController, "update"]).as("admin.shippingClasses.update");
        router.patch("/shipping-classes/:id", [AdminShippingClassesController, "update"]).as("admin.shippingClasses.patch");
        router.delete("/shipping-classes/:id", [AdminShippingClassesController, "destroy"]).as("admin.shippingClasses.destroy");

        router.get("/tax-classes", [AdminTaxClassesController, "index"]).as("admin.taxClasses.index");
        router.post("/tax-classes", [AdminTaxClassesController, "store"]).as("admin.taxClasses.store");
        router.get("/tax-classes/:id", [AdminTaxClassesController, "show"]).as("admin.taxClasses.show");
        router.put("/tax-classes/:id", [AdminTaxClassesController, "update"]).as("admin.taxClasses.update");
        router.patch("/tax-classes/:id", [AdminTaxClassesController, "update"]).as("admin.taxClasses.patch");
        router.delete("/tax-classes/:id", [AdminTaxClassesController, "destroy"]).as("admin.taxClasses.destroy");

        router.get("/reviews", [AdminReviewsController, "index"]).as("admin.reviews.index");
        router.patch("/reviews/:id", [AdminReviewsController, "update"]).as("admin.reviews.update");
        router.delete("/reviews/:id", [AdminReviewsController, "destroy"]).as("admin.reviews.destroy");
    })
    .prefix("/api/v1/admin");
