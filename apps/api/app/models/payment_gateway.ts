import { PaymentGatewaySchema } from "#database/schema";

export default class PaymentGateway extends PaymentGatewaySchema {
    static table = "payment_gateways";
}
