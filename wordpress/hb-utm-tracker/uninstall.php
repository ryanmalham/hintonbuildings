<?php
/**
 * Remove plugin settings. Attribution cookies expire on their own.
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'hb_utm_tracker_settings' );
