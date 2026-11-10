<?php
/**
 * Front-end script.
 *
 * The script is static. Visitor values are read in the browser, so a cached
 * page cannot pin one person's campaign onto the next person.
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HB_UTM_Frontend {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ), 1 );
		add_filter( 'script_loader_tag', array( __CLASS__, 'script_tag' ), 10, 2 );
	}

	/**
	 * Print the tracker in the head, before deferred theme scripts.
	 */
	public static function enqueue() {
		if ( is_admin() ) {
			return;
		}

		wp_enqueue_script(
			'hb-utm-tracker',
			plugins_url( 'assets/js/hb-utm-tracker.js', HB_UTM_FILE ),
			array(),
			HB_UTM_VERSION,
			false
		);

		$json = wp_json_encode( self::script_config( true ) );
		if ( ! is_string( $json ) ) {
			return;
		}
		wp_add_inline_script( 'hb-utm-tracker', 'window.HB_UTM_CONFIG=' . $json . ';', 'before' );
	}

	/**
	 * Ask common optimizers not to defer the capture script.
	 *
	 * @param string $tag    Script tag.
	 * @param string $handle Script handle.
	 * @return string
	 */
	public static function script_tag( $tag, $handle ) {
		if ( 'hb-utm-tracker' !== $handle || ! is_string( $tag ) ) {
			return $tag;
		}
		if ( false !== strpos( $tag, 'data-cfasync' ) ) {
			return $tag;
		}
		return str_replace( '<script ', '<script data-cfasync="false" data-no-optimize="1" data-no-defer="1" ', $tag );
	}

	/**
	 * Config consumed by hb-utm-tracker.js.
	 *
	 * @param bool $for_wordpress True on WordPress pages, false for the paste-in snippet.
	 * @return array<string, mixed>
	 */
	public static function script_config( $for_wordpress ) {
		$settings = HB_UTM_Settings::get();
		$host     = (string) wp_parse_url( home_url(), PHP_URL_HOST );
		$domain   = '' !== $settings['cookie_domain']
			? $settings['cookie_domain']
			: HB_UTM_Attribution::cookie_domain_for_host( $host );
		$site     = ltrim( (string) $domain, '.' );
		if ( '' === $site ) {
			$site = preg_replace( '/^www\./', '', strtolower( $host ) );
		}

		$config = array(
			'cookieName'       => HB_UTM_Attribution::COOKIE_NAME,
			'cookieDays'       => (int) $settings['cookie_days'],
			'cookieDomain'     => (string) $domain,
			'extraDomains'     => array_values( $settings['extra_domains'] ),
			'fieldMap'         => $settings['field_map'],
			'debug'            => (bool) $settings['debug'],
			'decorateInternal' => (bool) $settings['decorate_internal'],
			'siteHost'         => $site,
		);

		// WordPress pages clean carried parameters so analytics that run after
		// this script see the real page URL. The standalone snippet decides from
		// the hostname: brand hosts are cleaned, HighLevel hosts keep the query
		// string because HighLevel reads it.
		if ( $for_wordpress ) {
			$config['stripCarried'] = true;
		}

		/**
		 * Filter the tracker config before it is printed.
		 *
		 * @param array<string, mixed> $config        Script config.
		 * @param bool                 $for_wordpress True for the WordPress enqueue.
		 */
		$filtered = apply_filters( 'hb_utm_tracker_config', $config, $for_wordpress );
		return is_array( $filtered ) ? $filtered : $config;
	}
}
