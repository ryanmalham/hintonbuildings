=== HB UTM Tracker ===
Contributors: hintonbuildings
Tags: attribution, utm, forms, highlevel
Requires at least: 5.8
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Keeps first-touch and last-touch campaign data across Hinton Buildings pages and adds it to forms and HighLevel embeds.

== Description ==

HB UTM Tracker stores utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, gbraid, wbraid, fbclid, msclkid, the original referrer, and the landing page URL.

A later visit with no campaign parameters does not erase the stored visit. Capture runs in the browser, so full-page caching does not pin one visitor’s campaign onto the next page view. The plugin makes no external requests.

HighLevel form, survey, and calendar iframes get the parameters on their URL. Native POST forms get hidden fields. WooCommerce orders, Gravity Forms entries, Contact Form 7 mail tags, WPForms entries, and Elementor notifications can store the same values when those plugins are present. Missing plugins are ignored.

The full install and test steps are in README.md. A paste-ready script for HighLevel funnels and decks.hintonbuildings.com is in standalone/hb-utm-snippet.js, and on Settings → HB UTM Tracker after activation.

== Installation ==

1. Upload the plugin zip via Plugins → Add New → Upload Plugin, or copy the `hb-utm-tracker` folder to `wp-content/plugins/`.
2. Activate HB UTM Tracker.
3. Review Settings → HB UTM Tracker. The defaults work for hintonbuildings.com and its subdomains.
4. Add hidden fields to HighLevel forms using the query keys in README.md.
5. Paste the standalone snippet into any HighLevel funnel that is not a WordPress page.

== Frequently Asked Questions ==

= Does this work with a cached page? =

Yes. The HTML does not contain the visitor’s campaign. The browser reads the URL and stores attribution after the page loads.

= Will an empty visit wipe the original source? =

No. First touch stays. Last touch changes only when a new visit actually brings campaign parameters.

= What if JavaScript is disabled? =

The form still submits. Attribution is omitted. The page does not error.

== Changelog ==

= 1.0.0 =
* First release.
