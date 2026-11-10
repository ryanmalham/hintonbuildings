#!/usr/bin/env node
/**
 * Build the paste-ready snippet from the shared tracker script.
 * `node scripts/build-standalone.js --check` fails when the committed file is stale.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const api = require(path.join(root, 'assets/js/hb-utm-tracker.js'));
const library = fs.readFileSync(path.join(root, 'assets/js/hb-utm-tracker.js'), 'utf8');

const config = {
  cookieName: 'hb_utm',
  cookieDays: 90,
  cookieDomain: '.hintonbuildings.com',
  extraDomains: [],
  fieldMap: api.DEFAULT_FIELD_MAP,
  debug: false,
  decorateInternal: true,
  siteHost: 'hintonbuildings.com'
};

const header = `/**
 * Hinton Buildings attribution snippet.
 * Paste into HighLevel header tracking code, or into the header of a
 * non-WordPress page such as decks.hintonbuildings.com.
 * This copy uses the zero-config defaults. After you change plugin settings,
 * copy the snippet from Settings → HB UTM Tracker so the two stay in step.
 * No external requests.
 */
(function (w) {
  var defaults = ${JSON.stringify(config)};
  var extra = w.HB_UTM_CONFIG || {};
  var merged = {};
  var key;
  for (key in defaults) {
    if (Object.prototype.hasOwnProperty.call(defaults, key)) { merged[key] = defaults[key]; }
  }
  for (key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) { merged[key] = extra[key]; }
  }
  w.HB_UTM_CONFIG = merged;
})(typeof window !== 'undefined' ? window : {});
`;

const output = header + library;
const dest = path.join(root, 'standalone/hb-utm-snippet.js');

if (process.argv.indexOf('--check') !== -1) {
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  if (current !== output) {
    console.error('standalone/hb-utm-snippet.js is out of date. Run: node wordpress/hb-utm-tracker/scripts/build-standalone.js');
    process.exit(1);
  }
  console.log('standalone snippet is current');
  process.exit(0);
}

fs.writeFileSync(dest, output);
console.log('wrote ' + dest);
