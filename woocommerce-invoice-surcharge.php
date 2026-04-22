<?php
/**
 * WooCommerce: Add a 3% invoice surcharge when paying by credit card.
 *
 * Add this snippet to your theme's functions.php file or to a custom plugin.
 */

add_action('woocommerce_cart_calculate_fees', 'hb_add_invoice_surcharge');

/**
 * Adds a 3% surcharge based on product line totals in the cart.
 * The surcharge applies only when the chosen payment gateway is a credit card gateway.
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

    if (!hb_is_credit_card_payment_selected()) {
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
    $cart->add_fee(__('Credit Card Surcharge (3%)', 'hintonbuildings'), $surcharge_amount, false);
}

/**
 * Determines whether the selected payment method should be treated as credit card.
 *
 * @return bool
 */
function hb_is_credit_card_payment_selected()
{
    if (!function_exists('WC') || null === WC()->session) {
        return false;
    }

    $chosen_method = WC()->session->get('chosen_payment_method');

    if (empty($chosen_method)) {
        return false;
    }

    $credit_card_gateway_ids = array(
        'stripe',
        'woocommerce_payments',
        'square_credit_card',
        'authorize_net_cim_credit_card',
        'braintree_credit_card',
    );

    /**
     * Filter: Override which gateway IDs are considered credit-card payments.
     */
    $credit_card_gateway_ids = apply_filters('hb_credit_card_gateway_ids', $credit_card_gateway_ids);

    return in_array($chosen_method, $credit_card_gateway_ids, true);
}
