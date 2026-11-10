<?php
/**
 * Unit tests for the pure attribution helpers.
 *
 * @package HB_UTM_Tracker
 */

define( 'ABSPATH', __DIR__ . '/' );

require dirname( __DIR__, 2 ) . '/includes/class-hb-utm-attribution.php';

$failures = 0;

/**
 * @param mixed  $expected Expected value.
 * @param mixed  $actual   Actual value.
 * @param string $message  Assertion label.
 */
function hb_assert_same( $expected, $actual, $message ) {
	global $failures;
	if ( $expected !== $actual ) {
		$failures++;
		fwrite( STDERR, "FAIL: $message\n expected: " . var_export( $expected, true ) . "\n actual: " . var_export( $actual, true ) . "\n" );
		return;
	}
	echo "ok $message\n";
}

/**
 * @param bool   $condition Condition.
 * @param string $message   Assertion label.
 */
function hb_assert_true( $condition, $message ) {
	hb_assert_same( true, (bool) $condition, $message );
}

hb_assert_same( '.hintonbuildings.com', HB_UTM_Attribution::cookie_domain_for_host( 'dev.hintonbuildings.com' ), 'dev host uses the parent cookie domain' );
hb_assert_same( '.hintonbuildings.com', HB_UTM_Attribution::cookie_domain_for_host( 'www.hintonbuildings.com' ), 'www host uses the parent cookie domain' );
hb_assert_same( '.hintonbuildings.com', HB_UTM_Attribution::cookie_domain_for_host( 'decks.hintonbuildings.com' ), 'decks host uses the parent cookie domain' );
hb_assert_same( '.hintonbuildings.com', HB_UTM_Attribution::cookie_domain_for_host( 'hintonbuildings.com' ), 'apex host uses the parent cookie domain' );
hb_assert_same( '', HB_UTM_Attribution::cookie_domain_for_host( 'localhost' ), 'localhost is host-only' );
hb_assert_same( '', HB_UTM_Attribution::cookie_domain_for_host( '127.0.0.1' ), 'IP addresses are host-only' );
hb_assert_same( '.example.com', HB_UTM_Attribution::cookie_domain_for_host( 'shop.example.com' ), 'other sites use their registrable domain' );

hb_assert_true( HB_UTM_Attribution::host_matches( 'link.msgsndr.com', 'msgsndr.com' ), 'subdomain matches the HighLevel host' );
hb_assert_true( ! HB_UTM_Attribution::host_matches( 'msgsndr.com.evil.com', 'msgsndr.com' ), 'lookalike suffix does not match' );
hb_assert_true( ! HB_UTM_Attribution::host_matches( 'evilmsgsndr.com', 'msgsndr.com' ), 'concatenated host does not match' );
hb_assert_true( ! HB_UTM_Attribution::host_matches( 'not-hintonbuildings.com', 'hintonbuildings.com' ), 'near name does not match' );

$settings = HB_UTM_Attribution::sanitize_settings(
	array(
		'cookie_days'       => 0,
		'cookie_domain'     => 'https://evil.example/steal',
		'extra_domains'     => "https://Go.Example.com/book\nnot a host\nmsgsndr.com",
		'field_map'         => "utm_source=lt.utm_source\nbogus=ft.email\n# comment\nfirst_utm_source=ft.utm_source\n",
		'debug'             => '1',
		'decorate_internal' => '0',
	)
);
hb_assert_same( 1, $settings['cookie_days'], 'cookie days below 1 clamp to 1' );
hb_assert_same( '.evil.example', $settings['cookie_domain'], 'cookie domain drops scheme and path' );
hb_assert_same( array( 'go.example.com', 'msgsndr.com' ), $settings['extra_domains'], 'extra domains accept URLs and drop junk' );
hb_assert_same(
	array(
		'utm_source'       => 'lt.utm_source',
		'first_utm_source' => 'ft.utm_source',
	),
	$settings['field_map'],
	'field map keeps valid lines only'
);
hb_assert_same( true, $settings['debug'], 'debug flag accepts 1' );
hb_assert_same( false, $settings['decorate_internal'], 'unchecked decorate flag stays off' );

$clamped = HB_UTM_Attribution::sanitize_settings( array( 'cookie_days' => 9999, 'decorate_internal' => '1' ) );
hb_assert_same( 730, $clamped['cookie_days'], 'cookie days cap at 730' );
hb_assert_same( HB_UTM_Attribution::default_field_map(), $clamped['field_map'], 'empty field map restores the default' );
hb_assert_same( '', HB_UTM_Attribution::sanitize_settings( array( 'cookie_domain' => '.com' ) )['cookie_domain'], 'single-label cookie domain is rejected' );
hb_assert_same( '', HB_UTM_Attribution::sanitize_settings( array( 'cookie_domain' => 'javascript:alert(1)' ) )['cookie_domain'], 'script cookie domain is rejected' );

$store = HB_UTM_Attribution::parse_store(
	(string) json_encode(
		array(
			'v'  => 1,
			'ft' => array(
				'ts'           => 1,
				'utm_source'   => 'google',
				'landing_page' => 'https://hintonbuildings.com/land',
				'referrer'     => 'https://www.google.com/',
			),
			'lt' => array(
				'ts'           => 2,
				'utm_source'   => '<b>facebook</b>',
				'landing_page' => 'javascript:alert(1)',
			),
		)
	)
);
hb_assert_true( is_array( $store ), 'valid store parses' );
hb_assert_same( 'google', $store['ft']['utm_source'], 'first touch source is kept' );
hb_assert_same( 'facebook', $store['lt']['utm_source'], 'tags are stripped from values' );
hb_assert_true( ! isset( $store['lt']['landing_page'] ), 'non-http landing page is dropped' );
hb_assert_true( false === strpos( (string) json_encode( $store ), '<' ), 'parsed store has no angle brackets' );

hb_assert_same( null, HB_UTM_Attribution::parse_store( '{' ), 'malformed JSON is ignored' );
hb_assert_same( null, HB_UTM_Attribution::parse_store( '[]' ), 'a JSON list is ignored' );
hb_assert_same( null, HB_UTM_Attribution::parse_store( str_repeat( 'a', 9000 ) ), 'oversized payload is ignored' );

$flat = HB_UTM_Attribution::flatten( $store, HB_UTM_Attribution::default_field_map() );
hb_assert_same( 'facebook', $flat['utm_source'], 'utm_source maps to last touch' );
hb_assert_same( 'google', $flat['first_utm_source'], 'first_utm_source maps to first touch' );
hb_assert_same( 'https://hintonbuildings.com/land', $flat['landing_page'], 'landing_page maps to first touch' );
hb_assert_true( ! isset( $flat['gclid'] ), 'empty values are omitted' );

$summary = HB_UTM_Attribution::summary( $store );
hb_assert_true( false !== strpos( $summary, 'First touch:' ), 'summary names first touch' );
hb_assert_true( false !== strpos( $summary, 'utm_source=google' ), 'summary includes the first source' );
hb_assert_true( false !== strpos( $summary, 'utm_source=facebook' ), 'summary includes the last source' );
hb_assert_true( false === strpos( $summary, '<' ), 'summary contains no markup' );

if ( 0 !== $failures ) {
	fwrite( STDERR, "$failures failed\n" );
	exit( 1 );
}

echo "php unit tests passed\n";
