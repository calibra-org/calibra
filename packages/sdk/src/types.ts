/**
 * Re-export of the WooCommerce Store API response shapes consumed by the storefront.
 *
 * The single source of truth for these is the official `@woocommerce/types` package — keep this file
 * as a thin re-export layer rather than duplicating field definitions. If you need a richer shape
 * (variations, attributes, payment methods, …), import it directly from `@woocommerce/types` in the
 * consuming module instead of widening this file.
 */

export type {
    CartResponse as WcCart,
    CartResponseItem as WcCartItem,
    CartResponseTotals as WcCartTotals,
    ProductResponseImage as WcImage,
    ProductResponseItem as WcProduct,
    ProductResponseItemPrices as WcPrices,
} from "@woocommerce/types";
