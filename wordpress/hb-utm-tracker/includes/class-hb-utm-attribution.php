<?php
/**
 * Pure attribution helpers.
 *
 * No WordPress calls. The settings screen, form hooks, and unit tests all use this.
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HB_UTM_Attribution {

	const COOKIE_NAME = 'hb_utm';

	const MAX_STORE_CHARS = 8192;

	/**
	 * Marketing parameters we persist.
	 *
	 * @return string[]
	 */
	public static function tracked_keys() {
		return array(
			'utm_source',
			'utm_medium',
			'utm_campaign',
			'utm_term',
			'utm_content',
			'gclid',
			'gbraid',
			'wbraid',
			'fbclid',
			'msclkid',
		);
	}

	/**
	 * Maximum stored length for each touch value.
	 *
	 * @return array<string, int>
	 */
	public static function limits() {
		return array(
			'utm_source'   => 200,
			'utm_medium'   => 200,
			'utm_campaign' => 200,
			'utm_term'     => 200,
			'utm_content'  => 200,
			'gclid'        => 200,
			'gbraid'       => 200,
			'wbraid'       => 200,
			'fbclid'       => 200,
			'msclkid'      => 200,
			'referrer'     => 500,
			'landing_page' => 700,
		);
	}

	/**
	 * Hosts that always receive attribution on links and iframes.
	 *
	 * @return string[]
	 */
	public static function ghl_domains() {
		return array(
			'msgsndr.com',
			'leadconnectorhq.com',
			'gohighlevel.com',
			'highlevel.com',
			'leadconnector.com',
		);
	}

	/**
	 * Hidden-field name => first-touch (ft) or last-touch (lt) value.
	 *
	 * @return array<string, string>
	 */
	public static function default_field_map() {
		return array(
			'utm_source'         => 'lt.utm_source',
			'utm_medium'         => 'lt.utm_medium',
			'utm_campaign'       => 'lt.utm_campaign',
			'utm_term'           => 'lt.utm_term',
			'utm_content'        => 'lt.utm_content',
			'gclid'              => 'lt.gclid',
			'gbraid'             => 'lt.gbraid',
			'wbraid'             => 'lt.wbraid',
			'fbclid'             => 'lt.fbclid',
			'msclkid'            => 'lt.msclkid',
			'referrer'           => 'ft.referrer',
			'landing_page'       => 'ft.landing_page',
			'first_utm_source'   => 'ft.utm_source',
			'first_utm_medium'   => 'ft.utm_medium',
			'first_utm_campaign' => 'ft.utm_campaign',
			'first_utm_term'     => 'ft.utm_term',
			'first_utm_content'  => 'ft.utm_content',
			'first_gclid'        => 'ft.gclid',
			'first_gbraid'       => 'ft.gbraid',
			'first_wbraid'       => 'ft.wbraid',
			'first_fbclid'       => 'ft.fbclid',
			'first_msclkid'      => 'ft.msclkid',
			'last_referrer'      => 'lt.referrer',
			'last_landing_page'  => 'lt.landing_page',
		);
	}

	/**
	 * Plugin defaults. An empty cookie domain means "detect from this site".
	 *
	 * @return array<string, mixed>
	 */
	public static function defaults() {
		return array(
			'cookie_days'        => 90,
			'cookie_domain'      => '',
			'extra_domains'      => array(),
			'field_map'          => self::default_field_map(),
			'debug'              => false,
			'decorate_internal'  => true,
		);
	}

	/**
	 * Parent cookie domain for a hostname, or an empty string when a cookie
	 * should stay host-only (localhost, IP addresses).
	 *
	 * @param string $host Hostname, optionally with a port.
	 * @return string
	 */
	public static function cookie_domain_for_host( $host ) {
		$host = strtolower( (string) $host );
		$host = preg_replace( '/:\d+$/', '', $host );
		$host = preg_replace( '/^www\./', '', $host );
		$host = trim( $host, '.' );

		if ( '' === $host || 'localhost' === $host || filter_var( $host, FILTER_VALIDATE_IP ) ) {
			return '';
		}

		if ( 'hintonbuildings.com' === $host || self::host_matches( $host, 'hintonbuildings.com' ) ) {
			return '.hintonbuildings.com';
		}

		if ( ! self::is_valid_host( $host ) ) {
			return '';
		}

		$parts = explode( '.', $host );
		if ( count( $parts ) < 2 ) {
			return '';
		}

		return '.' . $parts[ count( $parts ) - 2 ] . '.' . $parts[ count( $parts ) - 1 ];
	}

	/**
	 * @param string $hostname Hostname to test.
	 * @param string $domain   Parent domain, with or without a leading dot.
	 * @return bool
	 */
	public static function host_matches( $hostname, $domain ) {
		$hostname = strtolower( rtrim( (string) $hostname, '.' ) );
		$domain   = strtolower( trim( (string) $domain, '.' ) );

		if ( '' === $hostname || '' === $domain ) {
			return false;
		}
		if ( $hostname === $domain ) {
			return true;
		}

		$suffix = '.' . $domain;
		return strlen( $hostname ) > strlen( $domain ) && substr( $hostname, -strlen( $suffix ) ) === $suffix;
	}

	/**
	 * @param string $host Hostname.
	 * @return bool
	 */
	public static function is_valid_host( $host ) {
		$host = strtolower( trim( (string) $host ) );
		if ( '' === $host || strlen( $host ) > 253 ) {
			return false;
		}
		return 1 === preg_match( '/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/', $host );
	}

	/**
	 * Accept a textarea, a list, or full URLs and return unique hostnames.
	 *
	 * @param mixed $value Raw setting.
	 * @return string[]
	 */
	public static function parse_domain_list( $value ) {
		if ( is_array( $value ) ) {
			$text = implode( "\n", $value );
		} else {
			$text = (string) $value;
		}

		$lines = preg_split( '/\r\n|\r|\n|,/', $text );
		$out   = array();
		if ( ! is_array( $lines ) ) {
			return $out;
		}

		foreach ( $lines as $line ) {
			if ( count( $out ) >= 50 ) {
				break;
			}
			$host = strtolower( trim( (string) $line ) );
			$host = preg_replace( '#^[a-z][a-z0-9+.-]*://#', '', $host );
			$host = preg_replace( '#/.*$#', '', $host );
			$host = preg_replace( '/:\d+$/', '', $host );
			$host = preg_replace( '/^\*\./', '', $host );
			$host = trim( (string) $host, '.' );
			if ( self::is_valid_host( $host ) && ! in_array( $host, $out, true ) ) {
				$out[] = $host;
			}
		}

		return $out;
	}

	/**
	 * @param mixed $value Textarea lines or an associative array.
	 * @return array<string, string>
	 */
	public static function parse_field_map( $value ) {
		$defaults = self::default_field_map();
		$lines    = array();

		if ( is_array( $value ) ) {
			if ( array() === $value ) {
				return $defaults;
			}
			$keys    = array_keys( $value );
			$is_list = $keys === range( 0, count( $value ) - 1 );
			if ( $is_list ) {
				$lines = $value;
			} else {
				foreach ( $value as $name => $path ) {
					$lines[] = $name . '=' . $path;
				}
			}
		} else {
			$text = trim( (string) $value );
			if ( '' === $text ) {
				return $defaults;
			}
			$split = preg_split( '/\r\n|\r|\n/', $text );
			$lines = is_array( $split ) ? $split : array();
		}

		$out = array();
		foreach ( $lines as $line ) {
			if ( count( $out ) >= 100 ) {
				break;
			}
			$line = trim( (string) $line );
			if ( '' === $line || '#' === substr( $line, 0, 1 ) ) {
				continue;
			}
			$eq = strpos( $line, '=' );
			if ( false === $eq ) {
				continue;
			}
			$name = trim( substr( $line, 0, $eq ) );
			$path = trim( substr( $line, $eq + 1 ) );
			if ( ! self::is_field_name( $name ) || ! self::is_field_path( $path ) ) {
				continue;
			}
			$out[ $name ] = $path;
		}

		return $out ? $out : $defaults;
	}

	/**
	 * @param string $name Field name.
	 * @return bool
	 */
	public static function is_field_name( $name ) {
		return 1 === preg_match( '/^[A-Za-z0-9_-]{1,64}$/', (string) $name );
	}

	/**
	 * @param string $path ft.key or lt.key.
	 * @return bool
	 */
	public static function is_field_path( $path ) {
		return 1 === preg_match( '/^(ft|lt)\.(utm_source|utm_medium|utm_campaign|utm_term|utm_content|gclid|gbraid|wbraid|fbclid|msclkid|referrer|landing_page)$/', (string) $path );
	}

	/**
	 * Clean a settings payload. Invalid values fall back to defaults.
	 *
	 * @param mixed $input Raw settings.
	 * @return array<string, mixed>
	 */
	public static function sanitize_settings( $input ) {
		$defaults = self::defaults();
		if ( ! is_array( $input ) ) {
			return $defaults;
		}

		$days = isset( $input['cookie_days'] ) ? (int) $input['cookie_days'] : $defaults['cookie_days'];
		if ( $days < 1 ) {
			$days = 1;
		}
		if ( $days > 730 ) {
			$days = 730;
		}

		$domain = isset( $input['cookie_domain'] ) ? strtolower( trim( (string) $input['cookie_domain'] ) ) : '';
		$domain = preg_replace( '#^[a-z][a-z0-9+.-]*://#', '', $domain );
		$domain = preg_replace( '#/.*$#', '', (string) $domain );
		if ( '' !== $domain ) {
			$bare = ltrim( $domain, '.' );
			if ( ! self::is_valid_host( $bare ) ) {
				$domain = '';
			} else {
				$domain = '.' . $bare;
			}
		}

		$debug = false;
		if ( isset( $input['debug'] ) ) {
			$debug = true === $input['debug'] || 1 === $input['debug'] || '1' === $input['debug'] || 'true' === $input['debug'];
		}

		$decorate = false;
		if ( isset( $input['decorate_internal'] ) ) {
			$value     = $input['decorate_internal'];
			$decorate  = true === $value || 1 === $value || '1' === $value || 'true' === $value;
		}

		return array(
			'cookie_days'       => $days,
			'cookie_domain'     => $domain,
			'extra_domains'     => self::parse_domain_list( isset( $input['extra_domains'] ) ? $input['extra_domains'] : array() ),
			'field_map'         => self::parse_field_map( isset( $input['field_map'] ) ? $input['field_map'] : '' ),
			'debug'             => $debug,
			'decorate_internal' => $decorate,
		);
	}

	/**
	 * Turn a field map into textarea lines.
	 *
	 * @param array<string, string> $map Field map.
	 * @return string
	 */
	public static function field_map_text( $map ) {
		$lines = array();
		if ( ! is_array( $map ) ) {
			$map = self::default_field_map();
		}
		foreach ( $map as $name => $path ) {
			if ( self::is_field_name( $name ) && self::is_field_path( $path ) ) {
				$lines[] = $name . '=' . $path;
			}
		}
		return implode( "\n", $lines );
	}

	/**
	 * Validate a JSON store written by the browser script.
	 *
	 * @param mixed $raw JSON string.
	 * @return array<string, mixed>|null
	 */
	public static function parse_store( $raw ) {
		if ( ! is_string( $raw ) ) {
			return null;
		}
		$raw = trim( $raw );
		if ( '' === $raw || strlen( $raw ) > self::MAX_STORE_CHARS ) {
			return null;
		}

		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return null;
		}

		$ft = self::sanitize_touch( isset( $data['ft'] ) ? $data['ft'] : null );
		$lt = self::sanitize_touch( isset( $data['lt'] ) ? $data['lt'] : null );
		if ( ! $ft && ! $lt ) {
			return null;
		}

		return array(
			'v'  => 1,
			'ft' => $ft,
			'lt' => $lt,
		);
	}

	/**
	 * @param mixed $touch Touch payload.
	 * @return array<string, mixed>|null
	 */
	public static function sanitize_touch( $touch ) {
		if ( ! is_array( $touch ) ) {
			return null;
		}

		$limits = self::limits();
		$clean  = array();
		$ts     = isset( $touch['ts'] ) ? (int) $touch['ts'] : 0;
		if ( $ts < 0 ) {
			$ts = 0;
		}
		$clean['ts'] = $ts;
		$any         = false;

		$keys = array_merge( self::tracked_keys(), array( 'referrer', 'landing_page' ) );
		foreach ( $keys as $key ) {
			if ( ! isset( $touch[ $key ] ) || is_array( $touch[ $key ] ) ) {
				continue;
			}
			$value = self::clean_text( $touch[ $key ], isset( $limits[ $key ] ) ? $limits[ $key ] : 200 );
			if ( '' === $value ) {
				continue;
			}
			if ( ( 'landing_page' === $key || 'referrer' === $key ) && ! self::is_http_url( $value ) ) {
				continue;
			}
			$clean[ $key ] = $value;
			$any           = true;
		}

		if ( ! $any && 0 === $clean['ts'] ) {
			return null;
		}

		return $clean;
	}

	/**
	 * @param mixed $value Raw value.
	 * @param int   $max   Maximum length.
	 * @return string
	 */
	public static function clean_text( $value, $max ) {
		$text = trim( (string) $value );
		$text = preg_replace( '/[\x00-\x1F\x7F]/', '', $text );
		$text = strip_tags( (string) $text );
		$text = str_replace( array( '<', '>' ), '', (string) $text );
		if ( strlen( $text ) > $max ) {
			$text = substr( $text, 0, $max );
		}
		return trim( $text );
	}

	/**
	 * @param string $value URL.
	 * @return bool
	 */
	public static function is_http_url( $value ) {
		return 1 === preg_match( '#^https?://#i', (string) $value );
	}

	/**
	 * Resolve the configured field map against a store.
	 *
	 * @param array<string, mixed>  $store Store.
	 * @param array<string, string> $map   Field map.
	 * @return array<string, string>
	 */
	public static function flatten( $store, $map ) {
		$out = array();
		if ( ! is_array( $store ) || ! is_array( $map ) ) {
			return $out;
		}
		foreach ( $map as $name => $path ) {
			if ( ! self::is_field_name( $name ) || ! self::is_field_path( $path ) ) {
				continue;
			}
			$parts = explode( '.', $path );
			$touch = isset( $store[ $parts[0] ] ) && is_array( $store[ $parts[0] ] ) ? $store[ $parts[0] ] : array();
			if ( ! isset( $touch[ $parts[1] ] ) ) {
				continue;
			}
			$value = self::clean_text( $touch[ $parts[1] ], 700 );
			if ( '' !== $value ) {
				$out[ $name ] = $value;
			}
		}
		return $out;
	}

	/**
	 * Plain-text summary safe to store on an order or form entry.
	 *
	 * @param array<string, mixed> $store Store.
	 * @return string
	 */
	public static function summary( $store ) {
		if ( ! is_array( $store ) ) {
			return '';
		}
		$lines = array();
		if ( ! empty( $store['ft'] ) && is_array( $store['ft'] ) ) {
			$lines[] = 'First touch: ' . self::touch_summary( $store['ft'] );
		}
		if ( ! empty( $store['lt'] ) && is_array( $store['lt'] ) ) {
			$lines[] = 'Last touch: ' . self::touch_summary( $store['lt'] );
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param array<string, mixed> $touch Touch.
	 * @return string
	 */
	private static function touch_summary( $touch ) {
		$parts = array();
		$keys  = array_merge( self::tracked_keys(), array( 'landing_page', 'referrer' ) );
		foreach ( $keys as $key ) {
			if ( empty( $touch[ $key ] ) || is_array( $touch[ $key ] ) ) {
				continue;
			}
			$parts[] = $key . '=' . self::clean_text( $touch[ $key ], 700 );
		}
		return $parts ? implode( ', ', $parts ) : 'direct';
	}
}
