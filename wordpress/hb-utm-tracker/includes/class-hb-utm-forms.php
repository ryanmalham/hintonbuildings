<?php
/**
 * Save attribution when a supported form or checkout is submitted.
 *
 * Every callback is defensive. A missing plugin, or a failure while saving
 * meta, must not stop the lead from being stored.
 *
 * @package HB_UTM_Tracker
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class HB_UTM_Forms {

	/**
	 * Register integration hooks. Absent plugins simply never fire them.
	 */
	public static function init() {
		add_action( 'woocommerce_checkout_create_order', array( __CLASS__, 'stamp_order' ), 20, 2 );
		add_action( 'woocommerce_store_api_checkout_update_order_from_request', array( __CLASS__, 'stamp_order' ), 20, 2 );
		add_action( 'woocommerce_admin_order_data_after_billing_address', array( __CLASS__, 'render_order_attribution' ), 20, 1 );
		add_filter( 'woocommerce_email_order_meta_fields', array( __CLASS__, 'email_order_meta' ), 20, 3 );

		add_action( 'gform_pre_submission', array( __CLASS__, 'gravity_pre_submission' ), 5, 1 );
		add_action( 'gform_entry_created', array( __CLASS__, 'gravity_entry_created' ), 10, 2 );

		add_filter( 'wpcf7_posted_data', array( __CLASS__, 'cf7_posted_data' ), 10, 1 );
		add_filter( 'wpcf7_special_mail_tags', array( __CLASS__, 'cf7_mail_tag' ), 10, 3 );

		add_filter( 'wpforms_process_filter', array( __CLASS__, 'wpforms_process' ), 10, 3 );
		add_action( 'wpforms_process_complete', array( __CLASS__, 'wpforms_complete' ), 10, 4 );

		add_action( 'elementor_pro/forms/new_record', array( __CLASS__, 'elementor_record' ), 10, 2 );
		add_filter( 'elementor_pro/forms/wp_mail_message', array( __CLASS__, 'elementor_mail' ), 10, 1 );
	}

	/**
	 * Copy attribution onto a WooCommerce order. Safe to call more than once.
	 *
	 * @param mixed $order Order object.
	 * @param mixed $data  Unused checkout context.
	 */
	public static function stamp_order( $order, $data = null ) {
		unset( $data );
		try {
			if ( is_numeric( $order ) && function_exists( 'wc_get_order' ) ) {
				$order = wc_get_order( $order );
			}
			if ( ! is_object( $order ) || ! method_exists( $order, 'update_meta_data' ) || ! method_exists( $order, 'get_meta' ) ) {
				return;
			}
			if ( '1' === (string) $order->get_meta( '_hb_utm_stamped' ) ) {
				return;
			}
			$store = HB_UTM_Request::store();
			if ( ! $store ) {
				return;
			}
			$fields = HB_UTM_Request::fields();
			$order->update_meta_data( '_hb_utm', wp_json_encode( $store ) );
			$order->update_meta_data( '_hb_utm_stamped', '1' );
			$map = array(
				'_hb_utm_source'   => 'utm_source',
				'_hb_utm_medium'   => 'utm_medium',
				'_hb_utm_campaign' => 'utm_campaign',
				'_hb_utm_term'     => 'utm_term',
				'_hb_utm_content'  => 'utm_content',
				'_hb_gclid'        => 'gclid',
				'_hb_fbclid'       => 'fbclid',
				'_hb_landing_page' => 'landing_page',
				'_hb_referrer'     => 'referrer',
				'_hb_first_source' => 'first_utm_source',
			);
			foreach ( $map as $meta_key => $field_key ) {
				if ( ! empty( $fields[ $field_key ] ) ) {
					$order->update_meta_data( $meta_key, $fields[ $field_key ] );
				}
			}
			if ( method_exists( $order, 'add_order_note' ) ) {
				$summary = HB_UTM_Attribution::summary( $store );
				if ( '' !== $summary ) {
					$order->add_order_note( __( 'Marketing attribution', 'hb-utm-tracker' ) . "\n" . $summary );
				}
			}
		} catch ( \Throwable $e ) {
			return;
		}
	}

	/**
	 * Show attribution on the WooCommerce order screen.
	 *
	 * @param mixed $order Order object.
	 */
	public static function render_order_attribution( $order ) {
		try {
			if ( is_numeric( $order ) && function_exists( 'wc_get_order' ) ) {
				$order = wc_get_order( $order );
			}
			if ( ! is_object( $order ) || ! method_exists( $order, 'get_meta' ) ) {
				return;
			}
			$raw = $order->get_meta( '_hb_utm' );
			if ( ! is_string( $raw ) || '' === $raw ) {
				return;
			}
			$store = HB_UTM_Attribution::parse_store( $raw );
			if ( ! $store ) {
				return;
			}
			echo '<div class="hb-utm-order-attribution"><p><strong>' . esc_html__( 'Marketing attribution', 'hb-utm-tracker' ) . '</strong></p>';
			echo '<p>' . nl2br( esc_html( HB_UTM_Attribution::summary( $store ) ) ) . '</p></div>';
		} catch ( \Throwable $e ) {
			return;
		}
	}

	/**
	 * Include attribution on the admin new-order email only.
	 *
	 * @param array<string, mixed> $fields       Email meta fields.
	 * @param bool                 $sent_to_admin Whether this email goes to the shop.
	 * @param mixed                $order         Order.
	 * @return array<string, mixed>
	 */
	public static function email_order_meta( $fields, $sent_to_admin, $order ) {
		try {
			if ( ! $sent_to_admin || ! is_array( $fields ) || ! is_object( $order ) || ! method_exists( $order, 'get_meta' ) ) {
				return $fields;
			}
			$pairs = array(
				'hb_utm_source'   => array( '_hb_utm_source', __( 'UTM source', 'hb-utm-tracker' ) ),
				'hb_utm_medium'   => array( '_hb_utm_medium', __( 'UTM medium', 'hb-utm-tracker' ) ),
				'hb_utm_campaign' => array( '_hb_utm_campaign', __( 'UTM campaign', 'hb-utm-tracker' ) ),
				'hb_landing_page' => array( '_hb_landing_page', __( 'Landing page', 'hb-utm-tracker' ) ),
				'hb_referrer'     => array( '_hb_referrer', __( 'Referrer', 'hb-utm-tracker' ) ),
			);
			foreach ( $pairs as $key => $spec ) {
				$value = $order->get_meta( $spec[0] );
				if ( is_string( $value ) && '' !== $value ) {
					$fields[ $key ] = array(
						'label' => $spec[1],
						'value' => $value,
					);
				}
			}
		} catch ( \Throwable $e ) {
			return $fields;
		}
		return $fields;
	}

	/**
	 * Fill Gravity Forms fields whose parameter name matches the field map.
	 *
	 * Dynamic population in the form HTML is cached, so the value is applied
	 * here, when the form is submitted.
	 *
	 * @param mixed $form Form object or array.
	 */
	public static function gravity_pre_submission( $form ) {
		try {
			if ( ! is_array( $form ) || empty( $form['fields'] ) || ! is_array( $form['fields'] ) ) {
				return;
			}
			$fields = HB_UTM_Request::fields();
			if ( ! $fields ) {
				return;
			}
			foreach ( $form['fields'] as $field ) {
				if ( ! is_object( $field ) ) {
					continue;
				}
				if ( ! empty( $field->inputs ) && is_array( $field->inputs ) ) {
					continue;
				}
				$param = isset( $field->inputName ) ? (string) $field->inputName : '';
				$id    = isset( $field->id ) ? (string) $field->id : '';
				if ( '' === $param || '' === $id || ! isset( $fields[ $param ] ) ) {
					continue;
				}
				$post_key = 'input_' . $id;
				$existing = isset( $_POST[ $post_key ] ) ? wp_unslash( $_POST[ $post_key ] ) : '';
				if ( is_array( $existing ) ) {
					continue;
				}
				$type = isset( $field->type ) ? (string) $field->type : '';
				if ( 'hidden' !== $type && '' !== $existing ) {
					continue;
				}
				$_POST[ $post_key ] = $fields[ $param ];
			}
		} catch ( \Throwable $e ) {
			return;
		}
	}

	/**
	 * Store the full attribution blob on the Gravity Forms entry.
	 *
	 * @param mixed $entry Entry.
	 * @param mixed $form  Form.
	 */
	public static function gravity_entry_created( $entry, $form ) {
		unset( $form );
		try {
			if ( ! is_array( $entry ) || empty( $entry['id'] ) ) {
				return;
			}
			$store = HB_UTM_Request::store();
			if ( ! $store ) {
				return;
			}
			$entry_id = (int) $entry['id'];
			$encoded  = wp_json_encode( $store );
			if ( function_exists( 'gform_update_meta' ) && is_string( $encoded ) ) {
				gform_update_meta( $entry_id, 'hb_utm', $encoded );
			}
			$note = HB_UTM_Attribution::summary( $store );
			if ( '' === $note ) {
				return;
			}
			$label = __( 'HB UTM Tracker', 'hb-utm-tracker' );
			if ( class_exists( 'GFAPI' ) && method_exists( 'GFAPI', 'add_note' ) ) {
				GFAPI::add_note( $entry_id, 0, $label, $note );
			} elseif ( class_exists( 'GFFormsModel' ) && method_exists( 'GFFormsModel', 'add_note' ) ) {
				GFFormsModel::add_note( $entry_id, 0, $label, $note );
			}
		} catch ( \Throwable $e ) {
			return;
		}
	}

	/**
	 * Add empty mapped keys to Contact Form 7 posted data.
	 *
	 * @param mixed $posted Posted data.
	 * @return mixed
	 */
	public static function cf7_posted_data( $posted ) {
		try {
			if ( ! is_array( $posted ) ) {
				return $posted;
			}
			$fields = HB_UTM_Request::fields();
			foreach ( $fields as $key => $value ) {
				if ( ! isset( $posted[ $key ] ) || '' === $posted[ $key ] ) {
					$posted[ $key ] = $value;
				}
			}
		} catch ( \Throwable $e ) {
			return $posted;
		}
		return $posted;
	}

	/**
	 * Mail tags: [_hb_utm_source], [_hb_utm_medium], [_hb_utm_campaign],
	 * [_hb_utm_term], [_hb_utm_content], [_hb_utm_summary].
	 *
	 * @param string $output Current replacement.
	 * @param string $name   Tag name.
	 * @param bool   $html   Whether the mail body is HTML.
	 * @return string
	 */
	public static function cf7_mail_tag( $output, $name, $html = false ) {
		try {
			if ( ! is_string( $name ) || 0 !== strpos( $name, '_hb_utm' ) ) {
				return $output;
			}
			$store = HB_UTM_Request::store();
			if ( ! $store ) {
				return '';
			}
			if ( '_hb_utm_summary' === $name ) {
				$text = HB_UTM_Attribution::summary( $store );
				return $html ? nl2br( esc_html( $text ) ) : esc_html( $text );
			}
			$map = array(
				'_hb_utm_source'   => 'utm_source',
				'_hb_utm_medium'   => 'utm_medium',
				'_hb_utm_campaign' => 'utm_campaign',
				'_hb_utm_term'     => 'utm_term',
				'_hb_utm_content'  => 'utm_content',
			);
			if ( ! isset( $map[ $name ] ) ) {
				return $output;
			}
			$fields = HB_UTM_Request::fields();
			$value  = isset( $fields[ $map[ $name ] ] ) ? $fields[ $map[ $name ] ] : '';
			return esc_html( $value );
		} catch ( \Throwable $e ) {
			return $output;
		}
	}

	/**
	 * Fill WPForms fields whose label matches a mapped name and whose value is empty.
	 *
	 * @param mixed $fields    Processed fields.
	 * @param mixed $entry     Entry values.
	 * @param mixed $form_data Form data.
	 * @return mixed
	 */
	public static function wpforms_process( $fields, $entry, $form_data ) {
		unset( $entry );
		try {
			if ( ! is_array( $fields ) ) {
				return $fields;
			}
			$mapped = HB_UTM_Request::fields();
			if ( ! $mapped ) {
				return $fields;
			}
			foreach ( $fields as $id => $field ) {
				if ( ! is_array( $field ) ) {
					continue;
				}
				$label = '';
				if ( isset( $field['name'] ) && is_string( $field['name'] ) ) {
					$label = $field['name'];
				} elseif ( isset( $form_data['fields'][ $id ]['label'] ) ) {
					$label = (string) $form_data['fields'][ $id ]['label'];
				}
				$key = strtolower( trim( str_replace( array( ' ', '-' ), '_', $label ) ) );
				if ( '' === $key || ! isset( $mapped[ $key ] ) ) {
					continue;
				}
				$current = isset( $field['value'] ) ? $field['value'] : '';
				if ( '' === $current || null === $current ) {
					$fields[ $id ]['value'] = $mapped[ $key ];
				}
			}
		} catch ( \Throwable $e ) {
			return $fields;
		}
		return $fields;
	}

	/**
	 * Store the raw attribution JSON on the WPForms entry when the API exists.
	 *
	 * @param mixed $fields    Fields.
	 * @param mixed $entry     Entry.
	 * @param mixed $form_data Form data.
	 * @param int   $entry_id  Entry ID.
	 */
	public static function wpforms_complete( $fields, $entry, $form_data, $entry_id ) {
		unset( $fields, $entry );
		try {
			$store = HB_UTM_Request::store();
			if ( ! $store || ! $entry_id || ! function_exists( 'wpforms' ) ) {
				return;
			}
			$instance = wpforms();
			if ( ! is_object( $instance ) || ! isset( $instance->entry_meta ) || ! is_object( $instance->entry_meta ) || ! method_exists( $instance->entry_meta, 'add' ) ) {
				return;
			}
			$form_id = 0;
			if ( is_array( $form_data ) && isset( $form_data['id'] ) ) {
				$form_id = (int) $form_data['id'];
			}
			$instance->entry_meta->add(
				array(
					'entry_id' => (int) $entry_id,
					'form_id'  => $form_id,
					'user_id'  => function_exists( 'get_current_user_id' ) ? (int) get_current_user_id() : 0,
					'type'     => 'hb_utm',
					'data'     => wp_json_encode( $store ),
				)
			);
		} catch ( \Throwable $e ) {
			return;
		}
	}

	/**
	 * Add mapped values to an Elementor form record when the record allows it.
	 *
	 * Elementor drops inputs that are not part of the form widget. Existing
	 * hidden fields with a matching custom id are updated. The rest are added
	 * to the record so the notification email can include them.
	 *
	 * @param mixed $record  Form record.
	 * @param mixed $handler Ajax handler.
	 */
	public static function elementor_record( $record, $handler = null ) {
		unset( $handler );
		try {
			if ( ! is_object( $record ) || ! method_exists( $record, 'get' ) || ! method_exists( $record, 'set' ) ) {
				return;
			}
			$store = HB_UTM_Request::store();
			if ( ! $store ) {
				return;
			}
			$mapped = HB_UTM_Request::fields();
			$fields = $record->get( 'fields' );
			if ( ! is_array( $fields ) ) {
				$fields = array();
			}
			foreach ( $mapped as $key => $value ) {
				if ( isset( $fields[ $key ] ) && is_array( $fields[ $key ] ) ) {
					$fields[ $key ]['value'] = $value;
				}
			}
			$record->set( 'fields', $fields );
			$meta = $record->get( 'meta' );
			if ( ! is_array( $meta ) ) {
				$meta = array();
			}
			$meta['hb_utm'] = wp_json_encode( $store );
			$record->set( 'meta', $meta );
		} catch ( \Throwable $e ) {
			return;
		}
	}

	/**
	 * Append a text summary to Elementor email notifications.
	 *
	 * @param string $message Email body.
	 * @return string
	 */
	public static function elementor_mail( $message ) {
		try {
			if ( ! is_string( $message ) ) {
				return $message;
			}
			$store = HB_UTM_Request::store();
			if ( ! $store ) {
				return $message;
			}
			$summary = HB_UTM_Attribution::summary( $store );
			if ( '' === $summary ) {
				return $message;
			}
			return $message . "\n\n" . __( 'Marketing attribution', 'hb-utm-tracker' ) . "\n" . $summary;
		} catch ( \Throwable $e ) {
			return $message;
		}
	}
}
