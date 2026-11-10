<?php
/**
 * Read the attribution store from the form post or the cookie.
 *
 * Page HTML is never built from this. It only runs when a form or checkout is submitted.
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HB_UTM_Request {

	/**
	 * Prefer the payload the browser put on the form, then the cookie.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function store() {
		try {
			$posted = self::raw_post_field( 'hb_utm_payload' );
			$store  = HB_UTM_Attribution::parse_store( $posted );
			if ( $store ) {
				return $store;
			}
			return HB_UTM_Attribution::parse_store( self::raw_cookie( HB_UTM_Attribution::COOKIE_NAME ) );
		} catch ( \Throwable $e ) {
			return null;
		}
	}

	/**
	 * Flattened field map for the current submission.
	 *
	 * @return array<string, string>
	 */
	public static function fields() {
		$store = self::store();
		if ( ! $store ) {
			return array();
		}
		$settings = HB_UTM_Settings::get();
		$map      = isset( $settings['field_map'] ) ? $settings['field_map'] : array();
		return HB_UTM_Attribution::flatten( $store, $map );
	}

	/**
	 * @param string $key POST field name.
	 * @return string
	 */
	private static function raw_post_field( $key ) {
		if ( ! isset( $_POST[ $key ] ) || is_array( $_POST[ $key ] ) ) {
			return '';
		}
		$value = wp_unslash( $_POST[ $key ] );
		return is_string( $value ) ? $value : '';
	}

	/**
	 * @param string $name Cookie name.
	 * @return string
	 */
	private static function raw_cookie( $name ) {
		if ( ! isset( $_COOKIE[ $name ] ) || is_array( $_COOKIE[ $name ] ) ) {
			return '';
		}
		$value = wp_unslash( $_COOKIE[ $name ] );
		return is_string( $value ) ? $value : '';
	}
}
