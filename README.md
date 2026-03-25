# hintonbuildings

## WooCommerce 3% invoice surcharge snippet

Use `woocommerce-invoice-surcharge.php` to add a **3% surcharge** to the cart's product total.

### How to use

1. Copy the code from `woocommerce-invoice-surcharge.php`.
2. Paste it into:
   - your child theme's `functions.php`, or
   - a small custom plugin.
3. Save and test checkout.

### What it does

- Hooks into `woocommerce_cart_calculate_fees`.
- Calculates 3% from product line totals in the cart.
- Adds a fee called **Invoice Surcharge (3%)**.
- Applies only on storefront/cart/checkout (not standard wp-admin screens).
