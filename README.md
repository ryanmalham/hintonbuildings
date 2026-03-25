# hintonbuildings

## WooCommerce 3% credit card surcharge snippet

Use `woocommerce-invoice-surcharge.php` to add a **3% surcharge** to the cart's product total **only when the customer chooses a credit card payment method**.

### How to use

1. Copy the code from `woocommerce-invoice-surcharge.php`.
2. Paste it into:
   - your child theme's `functions.php`, or
   - a small custom plugin.
3. (Optional) Customize the gateway IDs considered as credit card using the `hb_credit_card_gateway_ids` filter.
4. Save and test checkout by switching payment methods.

### What it does

- Hooks into `woocommerce_cart_calculate_fees`.
- Checks the selected payment method from the WooCommerce session.
- Adds the fee **Credit Card Surcharge (3%)** only for configured card gateways.
- Calculates 3% from product line totals in the cart.
- Applies only on storefront/cart/checkout (not standard wp-admin screens).
