<?php
/**
 * WooCommerce: Add a 3% invoice surcharge to cart totals.
 *
 * Add this snippet to your theme's functions.php file or to a custom plugin.
 */

add_action('woocommerce_cart_calculate_fees', 'hb_add_invoice_surcharge');

/**
 * Adds a 3% surcharge based on product line totals in the cart.
 *
 * @param WC_Cart $cart WooCommerce cart object.
 * @return void
 */
function hb_add_invoice_surcharge($cart)
{
    if (is_admin() && !defined('DOING_AJAX')) {
        return;
    }

    if (!$cart instanceof WC_Cart || $cart->is_empty()) {
        return;
    }

    $surcharge_rate = 0.03;
    $base_total = 0.0;

    foreach ($cart->get_cart() as $cart_item) {
        if (!isset($cart_item['line_total'])) {
            continue;
        }

        $base_total += (float) $cart_item['line_total'];
    }

    if ($base_total <= 0) {
        return;
    }

    $surcharge_amount = $base_total * $surcharge_rate;

    // Third argument (false) means the fee itself is not taxable. Set to true if needed.
    $cart->add_fee(__('Invoice Surcharge (3%)', 'hintonbuildings'), $surcharge_amount, false);
}
