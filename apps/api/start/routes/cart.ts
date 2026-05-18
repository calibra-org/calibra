import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";

const CartController = () => import("#controllers/cart_controller");

router
    .group(() => {
        router.get("/", [CartController, "show"]).as("cart.show");
        router.post("/items", [CartController, "addItem"]).as("cart.items.store");
        router.patch("/items/:line_id", [CartController, "updateItem"]).as("cart.items.update");
        router.delete("/items/:line_id", [CartController, "removeItem"]).as("cart.items.destroy");
        router.delete("/items", [CartController, "clear"]).as("cart.items.clear");
        router.post("/customer", [CartController, "updateCustomer"]).as("cart.customer.update");
        router.post("/shipping-rate", [CartController, "selectShippingRate"]).as("cart.shipping_rate.select");
    })
    .prefix("/api/v1/cart")
    .use(middleware.cart());
