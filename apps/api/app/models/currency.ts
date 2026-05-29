import { CurrencySchema } from "#database/schema";

/**
 * Reference table of supported currencies — the option list behind the General settings currency
 * picker plus each currency's display defaults. `base_ratio` is how many stored-base (Rial) minor
 * units equal one major unit (IRR=1, IRT=10, IRHR=1000, IRHT=10000); only the Rial family is
 * `enabled`. Non-Rial rows ship disabled with `base_ratio = 0` until a cross-currency FX mechanism
 * lands. Mirrors WooCommerce's `get_woocommerce_currencies()` + symbol/position metadata.
 */
export default class Currency extends CurrencySchema {
    static table = "currencies";
}
