<?php
/**
 * Print the canonical PHP defaults as JSON for the JS parity test.
 *
 * @package HB_UTM_Tracker
 */

define( 'ABSPATH', __DIR__ . '/' );

require dirname( __DIR__, 2 ) . '/includes/class-hb-utm-attribution.php';

echo json_encode(
	array(
		'fieldMap'   => HB_UTM_Attribution::default_field_map(),
		'ghlDomains' => HB_UTM_Attribution::ghl_domains(),
		'limits'     => HB_UTM_Attribution::limits(),
		'tracked'    => HB_UTM_Attribution::tracked_keys(),
	)
);
