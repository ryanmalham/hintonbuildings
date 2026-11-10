<?php
/**
 * Plugin Name:       HB UTM Tracker
 * Plugin URI:        https://hintonbuildings.com
 * Description:       Preserves first-touch and last-touch marketing attribution across Hinton Buildings pages and passes it into forms and HighLevel embeds.
 * Version:           1.0.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Hinton Buildings
 * Author URI:        https://hintonbuildings.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       hb-utm-tracker
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'HB_UTM_VERSION', '1.0.0' );
define( 'HB_UTM_FILE', __FILE__ );
define( 'HB_UTM_DIR', plugin_dir_path( __FILE__ ) );

require_once HB_UTM_DIR . 'includes/class-hb-utm-attribution.php';
require_once HB_UTM_DIR . 'includes/class-hb-utm-settings.php';
require_once HB_UTM_DIR . 'includes/class-hb-utm-request.php';
require_once HB_UTM_DIR . 'includes/class-hb-utm-frontend.php';
require_once HB_UTM_DIR . 'includes/class-hb-utm-forms.php';

/**
 * Load translations and integration hooks.
 */
function hb_utm_tracker_boot() {
	load_plugin_textdomain( 'hb-utm-tracker', false, dirname( plugin_basename( HB_UTM_FILE ) ) . '/languages' );
	HB_UTM_Settings::init();
	HB_UTM_Frontend::init();
	HB_UTM_Forms::init();
}
add_action( 'plugins_loaded', 'hb_utm_tracker_boot' );

/**
 * Store defaults on first activation. Existing settings are left alone.
 */
function hb_utm_tracker_activate() {
	if ( false === get_option( HB_UTM_Settings::OPTION, false ) ) {
		add_option( HB_UTM_Settings::OPTION, HB_UTM_Attribution::defaults(), '', true );
	}
}
register_activation_hook( HB_UTM_FILE, 'hb_utm_tracker_activate' );
