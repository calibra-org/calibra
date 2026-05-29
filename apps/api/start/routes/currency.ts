import router from "@adonisjs/core/services/router";

const CurrencyController = () => import("#controllers/currency_controller");

router
    .group(() => {
        router.get("/currency", [CurrencyController, "show"]).as("currency.show");
    })
    .prefix("/api/v1");
