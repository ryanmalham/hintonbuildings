# Hinton Buildings

This repository is the home for Hinton Buildings code: WordPress plugins, snippets, and other site work for [hintonbuildings.com](https://hintonbuildings.com).

| Site | Role |
| --- | --- |
| `hintonbuildings.com` | Live WordPress and WooCommerce site |
| `dev.hintonbuildings.com` | WordPress development site |
| `decks.hintonbuildings.com` | Decks site. Not necessarily WordPress |
| HighLevel funnels | Landing pages and forms, often embedded back onto the WordPress sites |

## HB UTM Tracker

`wordpress/hb-utm-tracker/` is a WordPress plugin that keeps marketing attribution (UTM parameters, ad click ids, referrer, and landing page) from the first page through later pages and form submissions, including HighLevel embeds.

- Install and test steps: [wordpress/hb-utm-tracker/README.md](wordpress/hb-utm-tracker/README.md)
- Paste-ready script for HighLevel and non-WordPress pages: [wordpress/hb-utm-tracker/standalone/hb-utm-snippet.js](wordpress/hb-utm-tracker/standalone/hb-utm-snippet.js)

```bash
npm test
```

The test command checks the JavaScript attribution logic, the PHP helpers, PHP syntax, and that the standalone snippet is built from the same script as the plugin.
