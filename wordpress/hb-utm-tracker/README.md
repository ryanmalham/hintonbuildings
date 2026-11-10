# HB UTM Tracker

WordPress plugin that keeps Hinton Buildings marketing attribution from the first page a person opens through every later page, and puts that attribution on the lead when a form is submitted.

It records `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, the original referrer, and the landing page URL. First touch and last touch are stored separately. A later visit with no campaign parameters does not wipe what is already stored.

Capture runs in the browser. Cached HTML is the same for every visitor. The plugin does not call HighLevel, Google, or any other service.

## Install on WordPress

1. Zip the plugin folder so the archive contains `hb-utm-tracker/hb-utm-tracker.php` at the top level. A ready-made archive is `hb-utm-tracker.zip`.
2. In WordPress go to **Plugins → Add New → Upload Plugin**, choose the zip, install, and activate.
3. Open **Settings → HB UTM Tracker**. The defaults are enough for `hintonbuildings.com`, `dev.hintonbuildings.com`, and `decks.hintonbuildings.com`. Save only if you change something.
4. Turn **Debug mode** on while you test. Messages in the browser console start with `[HB UTM]`. Turn it off when you are done.

To install without the zip, copy the `hb-utm-tracker` folder to `wp-content/plugins/hb-utm-tracker` and activate it.

Do this on `dev.hintonbuildings.com` first. Nothing in this repo deploys itself.

## What it does on a WordPress page

- Saves attribution in a first-party cookie on `.hintonbuildings.com` (90 days) and in `localStorage` on that host. Subdomains share the cookie. A HighLevel domain does not.
- Adds the stored parameters to links on Hinton Buildings hosts and to HighLevel hosts (`msgsndr.com`, `leadconnectorhq.com`, `gohighlevel.com`, `highlevel.com`, `leadconnector.com`). Add any custom funnel or booking domain under **Extra domains to decorate**.
- Leaves `mailto:`, `tel:`, `sms:`, in-page `#anchors`, and links that already have their own UTM or click-id parameters alone.
- Marks parameters it added to same-site links with `hb_carry=1`. On Hinton Buildings hosts those parameters are removed from the address bar after they are saved, so a later page does not look like a new ad click. The real ad landing URL keeps its parameters.
- Appends the mapped fields to HighLevel form, survey, and calendar iframe URLs, including iframes injected after the page loads. HighLevel can read its own iframe URL. The parent page cannot see inside that frame.
- Fills hidden fields on native `POST` forms, and sends a JSON copy in `hb_utm_payload`.

Built-in HighLevel hosts are always decorated. You cannot remove them from the settings page. Use **Extra domains** for a funnel on your own hostname.

## HighLevel form setup

HighLevel’s built-in attribution (the First / Latest panel on a contact) is filled from the iframe URL. The plugin puts `utm_*` and the click ids on that URL.

Custom fields on the contact are filled only when the form has a hidden field whose **query key** matches the parameter name. Create the fields once, then add them to every form, survey, and calendar that should record source.

In HighLevel:

1. Go to **Settings → Custom Fields** and add a text field for each name you want. Set the field key to the name itself, not a label like “UTM Source”.
2. Open **Sites → Forms → Builder**. Add each field and switch it to **Hidden**. Set the query key (sometimes shown as the parameter name) to the same key. Save.
3. Repeat for the other forms and for calendars.

| Hidden field / query key | Value |
| --- | --- |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | Last touch |
| `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid` | Last touch |
| `referrer`, `landing_page` | First touch |
| `first_utm_source`, `first_utm_medium`, `first_utm_campaign`, `first_utm_term`, `first_utm_content` | First touch |
| `first_gclid`, `first_gbraid`, `first_wbraid`, `first_fbclid`, `first_msclkid` | First touch |
| `last_referrer`, `last_landing_page` | Last touch |

You do not need every row. `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid`, `landing_page`, `referrer`, and `first_utm_source` are the useful set. The mapping can be edited under **Settings → HB UTM Tracker**. Clearing the box and saving restores this default.

Keep HighLevel’s embed code (the iframe plus `form_embed.js`). The plugin updates the iframe `src`. It does not replace the embed.

## Paste the snippet into HighLevel or decks.hintonbuildings.com

WordPress pages load the plugin automatically. A HighLevel funnel, a HighLevel website, or `decks.hintonbuildings.com` does not. Paste the same script there so attribution survives that hop.

1. In WordPress open **Settings → HB UTM Tracker** and copy the snippet at the bottom. That copy matches the settings you saved.
2. The file `standalone/hb-utm-snippet.js` in this folder is the same script with the zero-config defaults, if you are copying from git before the plugin is installed.
3. In HighLevel, open the funnel or website and go to **Settings → Tracking Code → Header**. Paste the whole snippet into the header. Do the same for each funnel that is not on WordPress.
4. On `decks.hintonbuildings.com`, paste it into the site header, as early as you can.

The snippet does not load any remote file. To override one setting before the snippet runs:

```html
<script>
  window.HB_UTM_CONFIG = { stripCarried: false, debug: true };
</script>
```

Use `stripCarried: false` when a HighLevel funnel is served on a `*.hintonbuildings.com` hostname. HighLevel reads the page URL, and the default on a Hinton Buildings host is to remove carried parameters from the address bar after saving them. Funnels on `msgsndr.com`, `leadconnectorhq.com`, or any non-Hinton domain already keep the parameters in the URL.

## Native WordPress forms

The browser fills matching hidden inputs on any `POST` form except comments and login. These plugins also read the cookie when the form is submitted, which still works if a caching plugin served the HTML:

| Plugin | What you get without extra fields | What to add so the value is a normal field |
| --- | --- | --- |
| WooCommerce checkout | Order meta, an order note, and the source on the admin new-order email. Works for classic and block checkout. | Nothing required. |
| Gravity Forms | Entry meta plus an entry note. | Hidden field, “Allow field to be populated dynamically” on, parameter name `utm_source` (and the other names). |
| Contact Form 7 | Nothing in the email until you add a tag. | Put `[_hb_utm_summary]` in the mail body, or add `[hidden utm_source]` (and the other names) to the form and the mail. |
| WPForms | Entry meta when that API is available. | Hidden field whose label is `utm_source`. |
| Elementor forms | A short attribution block on the notification email. | Hidden field with custom id `utm_source`. |

Search forms, comment forms, and `wp-login.php` are skipped. Add `data-hb-utm-skip="1"` to a form or link that should never be touched.

## Check a test lead on dev.hintonbuildings.com

1. Activate the plugin on `dev.hintonbuildings.com` only. Turn debug mode on.
2. Open a private window. Old cookies will otherwise reuse an earlier test.
3. Visit:

   `https://dev.hintonbuildings.com/?utm_source=hb_test&utm_medium=cpc&utm_campaign=plugin_check&utm_term=windows&utm_content=ad_a&gclid=test-gclid-123`

4. Open the browser console. You should see `[HB UTM]` and a stored first touch and last touch, both with `utm_source` `hb_test`.
5. In the browser’s application storage, confirm a `hb_utm` cookie on `.hintonbuildings.com` and a `hb_utm` localStorage entry for the site.
6. Click through to a second page that has no campaign parameters of its own. The address bar should not keep `hb_carry`. The cookie should still show `hb_test`. That second page must not blank the first touch.
7. On a page with an embedded HighLevel form, inspect the iframe. Its `src` should contain `utm_source=hb_test` and `gclid=test-gclid-123`. If the iframe appears a moment later, the plugin adds the parameters when it appears.
8. Submit the form with an email you can search, such as `hb-utm-test@hintonbuildings.com`. Use a name that is obviously a test.
9. In HighLevel go to **Contacts** and search for that email. Open the contact.
10. Find **Attribution**. Latest (and, on a first visit, First) should show source `hb_test`, medium `cpc`, campaign `plugin_check`, and Google click id `test-gclid-123`. The page URL is often the iframe URL, because that is the document HighLevel can see.
11. Scroll to the contact’s custom fields. `utm_source` and the other keys appear here only after the hidden fields from the table above are on that form. If Attribution is filled and the custom fields are empty, the iframe pass worked and the form is missing hidden fields. Add them and submit one more test.
12. Optional cross-domain check: from the dev site, click a link to a HighLevel funnel that has the snippet installed. The funnel URL should include `utm_source=hb_test`. Submit a form on the funnel and confirm the same contact fields.

WooCommerce, if you test checkout on dev: place a test order after the campaign URL. On the order screen, under the billing address, **Marketing attribution** shows the first and last touch. The same source is on the admin new-order email.

## Caching and analytics

- Do not delay or defer the `hb-utm-tracker` script. The tag is marked `data-no-optimize` and `data-cfasync="false"`, which many optimizers honor. Exclude the handle in LiteSpeed, WP Rocket, or FlyingPress if a test visit is not recorded.
- The plugin never prints the visitor’s campaign into the HTML, so a full-page cache is safe.
- Ad landing URLs keep their UTMs, so Google Analytics can still see the original click. Parameters added only to carry attribution between our own pages are removed from the address bar after save. A tag that runs before this script, or the raw request URL in a server log, can still see them.

## Privacy

No external requests. No name, email, or phone is collected by this plugin. Referrer and landing URLs have common sensitive query keys removed (`email`, `phone`, `name`, `token`, `password`, and similar). Values are length-capped and stripped of tags before they are stored. With JavaScript off, forms still submit and attribution is simply absent.

## Limitations

- A HighLevel iframe is a different site. The plugin can change the iframe URL. It cannot read or type inside the frame. If `form_embed.js` replaces the iframe `src`, the plugin writes the parameters back, and then stops after eight tries so the two scripts cannot reload the frame forever.
- Custom funnel domains are not decorated until they are listed under **Extra domains**. The known LeadConnector and HighLevel hosts are included.
- The `.hintonbuildings.com` cookie is not visible on another registrable domain. The link parameters and the standalone snippet carry attribution across that gap. Safari and other browsers may expire a JavaScript cookie earlier than 90 days. `localStorage` remains on that exact host.
- Links that already contain a UTM or click id are left unchanged, on purpose.
- Gravity Forms, WPForms, and Elementor only show a value in their own field list when a field with the matching name or parameter exists. The entry note, entry meta, or email summary is the fallback.
- Block checkout has no normal hidden inputs to fill. The order is stamped from the cookie, which the checkout request sends.
- This plugin does not create or update the HighLevel contact itself. The form submission does that. It also does not change the contact’s pipeline or the separate Source dropdown unless a HighLevel workflow copies the UTM fields there.

## Develop

From the repository root:

```bash
npm test
```

That runs the JavaScript tests (parsing, first and last touch, link decoration, iframe rewriting), the PHP unit tests, `php -l`, and a check that `standalone/hb-utm-snippet.js` matches the shared script.

Rebuild the snippet or the install zip:

```bash
node wordpress/hb-utm-tracker/scripts/build-standalone.js
wordpress/hb-utm-tracker/scripts/build-zip.sh /tmp/hb-utm-tracker.zip
```

The install zip contains the plugin, the snippet, and this README. It does not contain the tests.
