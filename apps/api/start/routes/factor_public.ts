import router from "@adonisjs/core/services/router";

import { factorPaymentLimiter } from "#start/limiter";

const FactorPublicController = () => import("#controllers/factor_public_controller");

router.get("/api/v1/factor/pay/:code", [FactorPublicController, "show"]).as("factor.public.show");
router.post("/api/v1/factor/pay/:code/init", [FactorPublicController, "init"]).as("factor.public.init").use(factorPaymentLimiter);
