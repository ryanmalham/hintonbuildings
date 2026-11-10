<?php
/**
 * Settings screen.
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HB_UTM_Settings {

	const OPTION = 'hb_utm_tracker_settings';

	const PAGE = 'hb-utm-tracker';

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
	}

	/**
	 * Saved settings merged over the defaults.
	 *
	 * @return array<string, mixed>
	 */
	public static function get() {
		$stored = get_option( self::OPTION, null );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		$clean = HB_UTM_Attribution::sanitize_settings( $stored );
		// A missing checkbox in a stored array from an upgrade should keep the default.
		if ( ! array_key_exists( 'decorate_internal', $stored ) ) {
			$clean['decorate_internal'] = true;
		}
		if ( ! array_key_exists( 'debug', $stored ) ) {
			$clean['debug'] = false;
		}
		return $clean;
	}

	/**
	 * @param mixed $input Raw option value.
	 * @return array<string, mixed>
	 */
	public static function sanitize( $input ) {
		return HB_UTM_Attribution::sanitize_settings( $input );
	}

	/**
	 * Register the option and fields.
	 */
	public static function register() {
		register_setting(
			'hb_utm_tracker',
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => HB_UTM_Attribution::defaults(),
			)
		);
	}

	/**
	 * Add Settings → HB UTM Tracker.
	 */
	public static function menu() {
		add_options_page(
			__( 'HB UTM Tracker', 'hb-utm-tracker' ),
			__( 'HB UTM Tracker', 'hb-utm-tracker' ),
			'manage_options',
			self::PAGE,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * Render the settings page.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings = self::get();
		$host     = (string) wp_parse_url( home_url(), PHP_URL_HOST );
		$detected = '' !== $settings['cookie_domain']
			? $settings['cookie_domain']
			: HB_UTM_Attribution::cookie_domain_for_host( $host );
		$example  = add_query_arg(
			array(
				'utm_source'   => 'hb_test',
				'utm_medium'   => 'cpc',
				'utm_campaign' => 'plugin_check',
				'utm_term'     => 'windows',
				'utm_content'  => 'ad_a',
				'gclid'        => 'test-gclid-123',
			),
			home_url( '/' )
		);
		$builtin  = implode( ', ', HB_UTM_Attribution::ghl_domains() );
		$snippet  = self::standalone_snippet();
		?>
		<div class="wrap hb-utm-settings">
			<style>
				.hb-utm-settings textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;width:100%;max-width:46rem;}
				.hb-utm-settings .description,.hb-utm-settings .hb-utm-intro{max-width:46rem;}
				.hb-utm-settings .hb-utm-snippet{margin-top:1.5rem;max-width:46rem;}
			</style>
			<h1><?php echo esc_html__( 'HB UTM Tracker', 'hb-utm-tracker' ); ?></h1>
			<p class="hb-utm-intro">
				<?php echo esc_html__( 'Stores the campaign data from a visitor’s first arrival and most recent arrival, carries it across Hinton Buildings pages, and adds it to forms and HighLevel embeds. Capture runs in the browser, so a cached page still keeps the visit that brought someone in. A later visit with no campaign parameters does not erase what was already stored.', 'hb-utm-tracker' ); ?>
			</p>
			<p class="hb-utm-intro">
				<?php
				echo wp_kses(
					sprintf(
						/* translators: %s: example URL */
						__( 'Test URL for this site: <a href="%s">open a sample campaign visit</a>. Use a private window so an old test does not get in the way.', 'hb-utm-tracker' ),
						esc_url( $example )
					),
					array(
						'a' => array( 'href' => array() ),
					)
				);
				?>
			</p>

			<form action="options.php" method="post">
				<?php settings_fields( 'hb_utm_tracker' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">
							<label for="hb-utm-cookie-days"><?php echo esc_html__( 'Cookie lifetime (days)', 'hb-utm-tracker' ); ?></label>
						</th>
						<td>
							<input
								name="<?php echo esc_attr( self::OPTION ); ?>[cookie_days]"
								id="hb-utm-cookie-days"
								type="number"
								min="1"
								max="730"
								value="<?php echo esc_attr( (string) $settings['cookie_days'] ); ?>"
								class="small-text"
							/>
							<p class="description"><?php echo esc_html__( 'Default is 90 days. Browsers can expire JavaScript cookies sooner. The same value is written to localStorage as a fallback on this host.', 'hb-utm-tracker' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="hb-utm-cookie-domain"><?php echo esc_html__( 'Cookie domain', 'hb-utm-tracker' ); ?></label>
						</th>
						<td>
							<input
								name="<?php echo esc_attr( self::OPTION ); ?>[cookie_domain]"
								id="hb-utm-cookie-domain"
								type="text"
								value="<?php echo esc_attr( $settings['cookie_domain'] ); ?>"
								class="regular-text"
								placeholder="<?php echo esc_attr( $detected ); ?>"
							/>
							<p class="description">
								<?php
								echo esc_html(
									sprintf(
										/* translators: %s: detected cookie domain */
										__( 'Leave blank to use the detected domain (%s). Use a leading dot only when attribution should be shared across subdomains. The domain must cover this site or the browser will reject the cookie.', 'hb-utm-tracker' ),
										$detected ? $detected : __( 'host-only', 'hb-utm-tracker' )
									)
								);
								?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php echo esc_html__( 'Decorate internal links', 'hb-utm-tracker' ); ?></th>
						<td>
							<input type="hidden" name="<?php echo esc_attr( self::OPTION ); ?>[decorate_internal]" value="0" />
							<label for="hb-utm-decorate-internal">
								<input
									name="<?php echo esc_attr( self::OPTION ); ?>[decorate_internal]"
									id="hb-utm-decorate-internal"
									type="checkbox"
									value="1"
									<?php checked( $settings['decorate_internal'] ); ?>
								/>
								<?php echo esc_html__( 'Add stored campaign parameters to links on this site and its subdomains.', 'hb-utm-tracker' ); ?>
							</label>
							<p class="description"><?php echo esc_html__( 'Parameters added this way are marked so they do not overwrite the original landing page. They are removed from the address bar after they are saved. Links that already have their own UTM or click-id parameters are left alone. mailto, tel, and in-page anchors are left alone.', 'hb-utm-tracker' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="hb-utm-extra-domains"><?php echo esc_html__( 'Extra domains to decorate', 'hb-utm-tracker' ); ?></label>
						</th>
						<td>
							<textarea name="<?php echo esc_attr( self::OPTION ); ?>[extra_domains]" id="hb-utm-extra-domains" rows="6" cols="50"><?php echo esc_textarea( implode( "\n", $settings['extra_domains'] ) ); ?></textarea>
							<p class="description">
								<?php
								echo esc_html(
									sprintf(
										/* translators: %s: comma-separated hostnames */
										__( 'One hostname per line. Links and iframes on these hosts get the stored parameters. These HighLevel hosts are always included: %s. Add a custom funnel or booking domain here.', 'hb-utm-tracker' ),
										$builtin
									)
								);
								?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="hb-utm-field-map"><?php echo esc_html__( 'Form field mapping', 'hb-utm-tracker' ); ?></label>
						</th>
						<td>
							<textarea name="<?php echo esc_attr( self::OPTION ); ?>[field_map]" id="hb-utm-field-map" rows="16" cols="50"><?php echo esc_textarea( HB_UTM_Attribution::field_map_text( $settings['field_map'] ) ); ?></textarea>
							<p class="description"><?php echo esc_html__( 'One field per line: field_name=ft.utm_source or field_name=lt.utm_source. ft is the first touch, lt is the last touch. These names are written into native forms and onto HighLevel iframe URLs. HighLevel only saves a value when the form has a hidden field whose query key matches the name. Clearing the box and saving restores the default map.', 'hb-utm-tracker' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php echo esc_html__( 'Debug mode', 'hb-utm-tracker' ); ?></th>
						<td>
							<input type="hidden" name="<?php echo esc_attr( self::OPTION ); ?>[debug]" value="0" />
							<label for="hb-utm-debug">
								<input
									name="<?php echo esc_attr( self::OPTION ); ?>[debug]"
									id="hb-utm-debug"
									type="checkbox"
									value="1"
									<?php checked( $settings['debug'] ); ?>
								/>
								<?php echo esc_html__( 'Log attribution to the browser console.', 'hb-utm-tracker' ); ?>
							</label>
							<p class="description"><?php echo esc_html__( 'Messages are prefixed with [HB UTM]. Leave this off unless you are checking a test visit.', 'hb-utm-tracker' ); ?></p>
						</td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<div class="hb-utm-snippet">
				<h2><?php echo esc_html__( 'Standalone snippet', 'hb-utm-tracker' ); ?></h2>
				<p class="description">
					<?php echo esc_html__( 'Paste this into a HighLevel funnel or website header tracking code, and into the header of any Hinton Buildings page that is not running this plugin (for example decks.hintonbuildings.com). It uses the settings above. It does not load anything from another server.', 'hb-utm-tracker' ); ?>
				</p>
				<p>
					<button type="button" class="button" id="hb-utm-copy-snippet"><?php echo esc_html__( 'Copy snippet', 'hb-utm-tracker' ); ?></button>
				</p>
				<textarea id="hb-utm-snippet" rows="14" readonly="readonly"><?php echo esc_textarea( $snippet ); ?></textarea>
			</div>
			<script>
				(function () {
					var button = document.getElementById('hb-utm-copy-snippet');
					var area = document.getElementById('hb-utm-snippet');
					if (!button || !area) {
						return;
					}
					button.addEventListener('click', function () {
						area.focus();
						area.select();
						var text = area.value;
						if (navigator.clipboard && navigator.clipboard.writeText) {
							navigator.clipboard.writeText(text).then(function () {
								button.textContent = <?php echo wp_json_encode( __( 'Copied', 'hb-utm-tracker' ) ); ?>;
							}).catch(function () {
								button.textContent = <?php echo wp_json_encode( __( 'Selected — press Cmd/Ctrl+C', 'hb-utm-tracker' ) ); ?>;
							});
						}
					});
				})();
			</script>
		</div>
		<?php
	}

	/**
	 * Snippet text reflecting the current settings.
	 *
	 * @return string
	 */
	public static function standalone_snippet() {
		$path = HB_UTM_DIR . 'assets/js/hb-utm-tracker.js';
		$js   = is_readable( $path ) ? file_get_contents( $path ) : '';
		if ( ! is_string( $js ) || '' === $js ) {
			return '';
		}
		$config = HB_UTM_Frontend::script_config( false );
		$json   = wp_json_encode( $config );
		if ( ! is_string( $json ) ) {
			$json = '{}';
		}
		$header = "/**\n"
			. " * Hinton Buildings attribution snippet.\n"
			. " * Paste into HighLevel header tracking code or a non-WordPress page header.\n"
			. " * Generated from HB UTM Tracker settings. No external requests.\n"
			. " */\n"
			. "(function (w) {\n"
			. "  var defaults = " . $json . ";\n"
			. "  var extra = w.HB_UTM_CONFIG || {};\n"
			. "  var merged = {};\n"
			. "  var key;\n"
			. "  for (key in defaults) {\n"
			. "    if (Object.prototype.hasOwnProperty.call(defaults, key)) { merged[key] = defaults[key]; }\n"
			. "  }\n"
			. "  for (key in extra) {\n"
			. "    if (Object.prototype.hasOwnProperty.call(extra, key)) { merged[key] = extra[key]; }\n"
			. "  }\n"
			. "  w.HB_UTM_CONFIG = merged;\n"
			. "})(window);\n";
		return $header . $js;
	}
}
