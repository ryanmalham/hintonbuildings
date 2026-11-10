/**
 * HB UTM Tracker.
 *
 * Client-side first-touch and last-touch attribution for Hinton Buildings.
 * Works inside WordPress (window.HB_UTM_CONFIG is printed by the plugin)
 * and as a standalone paste-in snippet. No network calls and no libraries.
 *
 * A visit with no campaign parameters must not erase stored attribution.
 * Parameters we added ourselves are marked hb_carry=1 so they refresh the
 * URL without looking like a new campaign landing.
 */
(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.HBUtmTracker = api;
    if (root.document && root.HB_UTM_CONFIG && root.HB_UTM_CONFIG.manual !== true) {
      try {
        api.boot(root, root.HB_UTM_CONFIG);
      } catch (err) {
        if (root.console && root.HB_UTM_CONFIG && root.HB_UTM_CONFIG.debug) {
          root.console.log('[HB UTM] failed to start', err);
        }
      }
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var COOKIE_NAME = 'hb_utm';
  var CARRY_FLAG = 'hb_carry';
  var MAX_STORE_CHARS = 8192;
  var MAX_COOKIE_ENCODED = 3500;

  var TRACKED_KEYS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'gbraid',
    'wbraid',
    'fbclid',
    'msclkid'
  ];

  var LIMITS = {
    utm_source: 200,
    utm_medium: 200,
    utm_campaign: 200,
    utm_term: 200,
    utm_content: 200,
    gclid: 200,
    gbraid: 200,
    wbraid: 200,
    fbclid: 200,
    msclkid: 200,
    referrer: 500,
    landing_page: 700
  };

  var TOUCH_KEYS = TRACKED_KEYS.concat(['referrer', 'landing_page']);

  var DEFAULT_GHL_DOMAINS = [
    'msgsndr.com',
    'leadconnectorhq.com',
    'gohighlevel.com',
    'highlevel.com',
    'leadconnector.com'
  ];

  var DEFAULT_FIELD_MAP = {
    utm_source: 'lt.utm_source',
    utm_medium: 'lt.utm_medium',
    utm_campaign: 'lt.utm_campaign',
    utm_term: 'lt.utm_term',
    utm_content: 'lt.utm_content',
    gclid: 'lt.gclid',
    gbraid: 'lt.gbraid',
    wbraid: 'lt.wbraid',
    fbclid: 'lt.fbclid',
    msclkid: 'lt.msclkid',
    referrer: 'ft.referrer',
    landing_page: 'ft.landing_page',
    first_utm_source: 'ft.utm_source',
    first_utm_medium: 'ft.utm_medium',
    first_utm_campaign: 'ft.utm_campaign',
    first_utm_term: 'ft.utm_term',
    first_utm_content: 'ft.utm_content',
    first_gclid: 'ft.gclid',
    first_gbraid: 'ft.gbraid',
    first_wbraid: 'ft.wbraid',
    first_fbclid: 'ft.fbclid',
    first_msclkid: 'ft.msclkid',
    last_referrer: 'lt.referrer',
    last_landing_page: 'lt.landing_page'
  };

  var FIRST_TOUCH_QUERY = {
    hb_fts: 'utm_source',
    hb_ftm: 'utm_medium',
    hb_ftc: 'utm_campaign',
    hb_ftt: 'utm_term',
    hb_ftn: 'utm_content',
    hb_ft_gclid: 'gclid',
    hb_ft_gbraid: 'gbraid',
    hb_ft_wbraid: 'wbraid',
    hb_ft_fbclid: 'fbclid',
    hb_ft_msclkid: 'msclkid'
  };

  var PRIVATE_QUERY_KEYS = [
    'hb_carry',
    'hb_lp',
    'hb_rf',
    'hb_fts',
    'hb_ftm',
    'hb_ftc',
    'hb_ftt',
    'hb_ftn',
    'hb_ft_gclid',
    'hb_ft_gbraid',
    'hb_ft_wbraid',
    'hb_ft_fbclid',
    'hb_ft_msclkid'
  ];

  var SENSITIVE_KEYS = {
    email: true,
    e_mail: true,
    mail: true,
    phone: true,
    tel: true,
    mobile: true,
    name: true,
    first_name: true,
    last_name: true,
    full_name: true,
    fullname: true,
    token: true,
    password: true,
    passwd: true,
    pwd: true,
    auth: true,
    code: true,
    session: true,
    ssn: true,
    address: true,
    street: true,
    zip: true,
    postal: true,
    credit_card: true,
    cc: true,
    cvv: true
  };

  var FIELD_PATH = /^(ft|lt)\.(utm_source|utm_medium|utm_campaign|utm_term|utm_content|gclid|gbraid|wbraid|fbclid|msclkid|referrer|landing_page)$/;
  var FIELD_NAME = /^[A-Za-z0-9_-]{1,64}$/;
  var HOST_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

  function own(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function cleanValue(value, max) {
    if (value === undefined || value === null) {
      return '';
    }
    var text = String(value).replace(/[\u0000-\u001F\u007F]/g, '').replace(/[<>]/g, '').trim();
    if (!max) {
      max = 200;
    }
    if (text.length > max) {
      text = text.slice(0, max);
    }
    return text;
  }

  function isSensitiveKey(key) {
    var normalized = String(key || '').toLowerCase().replace(/-/g, '_');
    if (SENSITIVE_KEYS[normalized]) {
      return true;
    }
    return normalized.indexOf('password') !== -1 ||
      normalized.indexOf('token') !== -1 ||
      normalized.indexOf('email') !== -1 ||
      normalized.indexOf('secret') !== -1;
  }

  function stripSensitiveParams(url) {
    var drop = [];
    url.searchParams.forEach(function (_value, key) {
      if (isSensitiveKey(key)) {
        drop.push(key);
      }
    });
    for (var i = 0; i < drop.length; i++) {
      url.searchParams.delete(drop[i]);
    }
  }

  function stripPrivateParams(url) {
    for (var i = 0; i < PRIVATE_QUERY_KEYS.length; i++) {
      url.searchParams.delete(PRIVATE_QUERY_KEYS[i]);
    }
  }

  function cleanHttpUrl(value, max) {
    var text = cleanValue(value, 2000);
    if (!text) {
      return '';
    }
    try {
      var url = new URL(text);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return '';
      }
      url.hash = '';
      stripSensitiveParams(url);
      stripPrivateParams(url);
      var out = url.toString();
      if (out.length > max) {
        out = out.slice(0, max);
      }
      return out;
    } catch (err) {
      return '';
    }
  }

  function cleanReferrer(value) {
    return cleanHttpUrl(value, LIMITS.referrer);
  }

  function cleanLanding(value) {
    return cleanHttpUrl(value, LIMITS.landing_page);
  }

  function hostMatches(hostname, domain) {
    hostname = String(hostname || '').toLowerCase().replace(/\.$/, '');
    domain = String(domain || '').toLowerCase().replace(/^\./, '').replace(/\.$/, '');
    if (!hostname || !domain || hostname === domain) {
      return hostname !== '' && hostname === domain;
    }
    return hostname.length > domain.length && hostname.slice(-(domain.length + 1)) === '.' + domain;
  }

  function registrableHost(hostname) {
    var parts = String(hostname || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length < 2) {
      return parts.join('.');
    }
    return parts.slice(-2).join('.');
  }

  function rootFor(hostname, siteHost) {
    hostname = String(hostname || '').toLowerCase().replace(/\.$/, '');
    if (!hostname) {
      return '';
    }
    if (siteHost && hostMatches(hostname, siteHost)) {
      return String(siteHost).replace(/^\./, '').toLowerCase();
    }
    return registrableHost(hostname);
  }

  function isValidHost(host) {
    return HOST_NAME.test(String(host || '').toLowerCase());
  }

  function normalizeDomains(list) {
    var out = [];
    var seen = {};
    var items = list;
    if (typeof list === 'string') {
      items = list.split(/[\s,]+/);
    }
    if (!items || !items.length) {
      return out;
    }
    for (var i = 0; i < items.length && out.length < 50; i++) {
      var host = String(items[i] || '').trim().toLowerCase();
      host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
      host = host.replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^\*\./, '');
      if (!isValidHost(host) || seen[host]) {
        continue;
      }
      seen[host] = true;
      out.push(host);
    }
    return out;
  }

  function sanitizeFieldMap(map) {
    var out = {};
    var count = 0;
    if (!map || typeof map !== 'object') {
      return null;
    }
    for (var name in map) {
      if (!own(map, name) || count >= 100) {
        continue;
      }
      if (!FIELD_NAME.test(name) || !FIELD_PATH.test(String(map[name]))) {
        continue;
      }
      out[name] = String(map[name]);
      count++;
    }
    return count ? out : null;
  }

  function cloneFieldMap(map) {
    var out = {};
    var key;
    for (key in map) {
      if (own(map, key)) {
        out[key] = map[key];
      }
    }
    return out;
  }

  function clampDays(value) {
    var days = parseInt(value, 10);
    if (isNaN(days)) {
      return 90;
    }
    if (days < 1) {
      return 1;
    }
    if (days > 730) {
      return 730;
    }
    return days;
  }

  function normalizeConfig(config, location) {
    config = config || {};
    var hostname = location && location.hostname ? location.hostname : '';
    var siteHost = config.siteHost ? String(config.siteHost).replace(/^\./, '').toLowerCase() : '';
    if (!isValidHost(siteHost)) {
      siteHost = registrableHost(hostname);
    }
    var extra = normalizeDomains(config.extraDomains);
    var fieldMap = sanitizeFieldMap(config.fieldMap) || cloneFieldMap(DEFAULT_FIELD_MAP);
    var cookieName = String(config.cookieName || COOKIE_NAME);
    if (!/^[A-Za-z0-9_]{1,64}$/.test(cookieName)) {
      cookieName = COOKIE_NAME;
    }
    return {
      cookieName: cookieName,
      cookieDays: clampDays(config.cookieDays),
      cookieDomain: config.cookieDomain ? String(config.cookieDomain) : '',
      extraDomains: extra,
      iframeDomains: DEFAULT_GHL_DOMAINS.concat(extra),
      fieldMap: fieldMap,
      debug: config.debug === true || config.debug === 1 || config.debug === '1',
      decorateInternal: config.decorateInternal !== false && config.decorateInternal !== 0 && config.decorateInternal !== '0',
      siteHost: siteHost,
      stripCarried: config.stripCarried
    };
  }

  function parseQuery(search) {
    var out = {};
    var text = search ? String(search) : '';
    if (text.charAt(0) === '?') {
      text = text.slice(1);
    }
    if (!text) {
      return out;
    }
    var params = new URLSearchParams(text);
    params.forEach(function (value, key) {
      if (!own(out, key)) {
        out[key] = value;
      }
    });
    return out;
  }

  function pickMarketing(query) {
    var out = {};
    for (var i = 0; i < TRACKED_KEYS.length; i++) {
      var key = TRACKED_KEYS[i];
      if (!query || !own(query, key)) {
        continue;
      }
      var value = cleanValue(query[key], LIMITS[key]);
      if (value) {
        out[key] = value;
      }
    }
    return out;
  }

  function hasMarketing(marketing) {
    for (var key in marketing) {
      if (own(marketing, key) && marketing[key]) {
        return true;
      }
    }
    return false;
  }

  function makeTouch(marketing, landing, referrer, now) {
    var touch = { ts: now };
    for (var i = 0; i < TRACKED_KEYS.length; i++) {
      var key = TRACKED_KEYS[i];
      if (marketing && marketing[key]) {
        touch[key] = cleanValue(marketing[key], LIMITS[key]);
      }
    }
    var landingClean = cleanLanding(landing);
    var referrerClean = cleanReferrer(referrer);
    if (landingClean) {
      touch.landing_page = landingClean;
    }
    if (referrerClean) {
      touch.referrer = referrerClean;
    }
    return touch;
  }

  function cloneTouch(touch) {
    if (!touch) {
      return null;
    }
    var copy = { ts: touch.ts || 0 };
    for (var i = 0; i < TOUCH_KEYS.length; i++) {
      var key = TOUCH_KEYS[i];
      if (touch[key]) {
        copy[key] = touch[key];
      }
    }
    return copy;
  }

  function scoreTouch(touch) {
    var score = 0;
    if (!touch) {
      return 0;
    }
    for (var i = 0; i < TOUCH_KEYS.length; i++) {
      if (touch[TOUCH_KEYS[i]]) {
        score++;
      }
    }
    return score;
  }

  function sanitizeTouch(touch) {
    if (!touch || typeof touch !== 'object' || Array.isArray(touch)) {
      return null;
    }
    var clean = {};
    var ts = parseInt(touch.ts, 10);
    clean.ts = isNaN(ts) || ts < 0 ? 0 : ts;
    var any = false;
    for (var i = 0; i < TOUCH_KEYS.length; i++) {
      var key = TOUCH_KEYS[i];
      if (!own(touch, key)) {
        continue;
      }
      var value;
      if (key === 'landing_page') {
        value = cleanLanding(touch[key]);
      } else if (key === 'referrer') {
        value = cleanReferrer(touch[key]);
      } else {
        value = cleanValue(touch[key], LIMITS[key]);
      }
      if (value) {
        clean[key] = value;
        any = true;
      }
    }
    if (!any && !clean.ts) {
      return null;
    }
    return clean;
  }

  function parseStore(raw) {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    if (raw.length > MAX_STORE_CHARS) {
      return null;
    }
    var data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }
    var ft = sanitizeTouch(data.ft);
    var lt = sanitizeTouch(data.lt);
    if (!ft && !lt) {
      return null;
    }
    return { v: 1, ft: ft, lt: lt };
  }

  function serializeStore(store) {
    if (!store) {
      return '';
    }
    return JSON.stringify({
      v: 1,
      ft: store.ft || null,
      lt: store.lt || null
    });
  }

  function slimStore(store) {
    function slim(touch) {
      if (!touch) {
        return null;
      }
      var copy = cloneTouch(touch);
      delete copy.landing_page;
      delete copy.referrer;
      return copy;
    }
    return { v: 1, ft: slim(store.ft), lt: slim(store.lt) };
  }

  function pickEarlier(a, b) {
    if (!a) {
      return cloneTouch(b);
    }
    if (!b) {
      return cloneTouch(a);
    }
    if ((a.ts || 0) !== (b.ts || 0)) {
      return cloneTouch((a.ts || 0) <= (b.ts || 0) ? a : b);
    }
    return cloneTouch(scoreTouch(a) >= scoreTouch(b) ? a : b);
  }

  function pickLater(a, b) {
    if (!a) {
      return cloneTouch(b);
    }
    if (!b) {
      return cloneTouch(a);
    }
    if ((a.ts || 0) !== (b.ts || 0)) {
      return cloneTouch((a.ts || 0) >= (b.ts || 0) ? a : b);
    }
    return cloneTouch(scoreTouch(a) >= scoreTouch(b) ? a : b);
  }

  function reconcileStores(a, b) {
    if (!a && !b) {
      return null;
    }
    if (!a) {
      return { v: 1, ft: cloneTouch(b.ft), lt: cloneTouch(b.lt) };
    }
    if (!b) {
      return { v: 1, ft: cloneTouch(a.ft), lt: cloneTouch(a.lt) };
    }
    return {
      v: 1,
      ft: pickEarlier(a.ft, b.ft),
      lt: pickLater(a.lt, b.lt)
    };
  }

  function carriedFlag(query) {
    if (!query) {
      return false;
    }
    return query[CARRY_FLAG] === '1' || query[CARRY_FLAG] === 'true';
  }

  function firstTouchFromCarry(query, fallbackTouch, now) {
    var marketing = {};
    var found = false;
    for (var key in FIRST_TOUCH_QUERY) {
      if (!own(FIRST_TOUCH_QUERY, key) || !query || !own(query, key)) {
        continue;
      }
      var value = cleanValue(query[key], LIMITS[FIRST_TOUCH_QUERY[key]]);
      if (!value) {
        continue;
      }
      marketing[FIRST_TOUCH_QUERY[key]] = value;
      found = true;
    }
    var landing = query && query.hb_lp ? cleanLanding(query.hb_lp) : '';
    var referrer = query && query.hb_rf ? cleanReferrer(query.hb_rf) : '';
    if (!found && !landing && !referrer) {
      return cloneTouch(fallbackTouch);
    }
    if (!found) {
      for (var i = 0; i < TRACKED_KEYS.length; i++) {
        var tracked = TRACKED_KEYS[i];
        if (fallbackTouch && fallbackTouch[tracked]) {
          marketing[tracked] = fallbackTouch[tracked];
        }
      }
    }
    return makeTouch(
      marketing,
      landing || (fallbackTouch && fallbackTouch.landing_page) || '',
      referrer || (fallbackTouch && fallbackTouch.referrer) || '',
      now
    );
  }

  /**
   * Pure attribution update.
   *
   * - Real campaign URL (marketing params, no hb_carry): sets first touch once,
   *   replaces last touch. A new last touch drops click IDs that are not in the
   *   new URL so Google and Meta clicks do not get mixed together.
   * - hb_carry=1: our own link decoration. Never overwrites an existing store.
   *   If storage was empty, the carried params restore it, preferring hb_lp / hb_rf
   *   and hb_ft* for the original first touch.
   * - No marketing params: records a direct/organic landing only when nothing
   *   is stored. A later empty visit leaves the store alone.
   */
  function updateStore(store, query, context) {
    context = context || {};
    var now = typeof context.now === 'number' ? context.now : Date.now();
    var landing = context.landingPage || '';
    var referrer = context.referrer || '';
    var next = {
      v: 1,
      ft: store && store.ft ? cloneTouch(store.ft) : null,
      lt: store && store.lt ? cloneTouch(store.lt) : null
    };
    var marketing = pickMarketing(query);
    var campaign = hasMarketing(marketing);
    var carried = carriedFlag(query);

    if (campaign && !carried) {
      var current = makeTouch(marketing, landing, referrer, now);
      if (!next.ft) {
        next.ft = firstTouchFromCarry(query, current, now);
      }
      next.lt = current;
      return next;
    }

    if (campaign && carried && (!next.ft || !next.lt)) {
      var restoredLanding = (query && query.hb_lp && cleanLanding(query.hb_lp)) || landing;
      var restoredReferrer = (query && query.hb_rf && cleanReferrer(query.hb_rf)) || referrer;
      var restored = makeTouch(marketing, restoredLanding, restoredReferrer, now);
      if (!next.ft) {
        next.ft = firstTouchFromCarry(query, restored, now);
      }
      if (!next.lt) {
        next.lt = cloneTouch(restored);
        if (query && query.hb_lp && cleanLanding(query.hb_lp)) {
          next.lt.landing_page = cleanLanding(query.hb_lp);
        }
      }
      return next;
    }

    if (!next.ft && !next.lt) {
      var organic = makeTouch({}, landing, referrer, now);
      next.ft = organic;
      next.lt = cloneTouch(organic);
    }

    return next;
  }

  function valueAt(store, path) {
    if (!store || !FIELD_PATH.test(path)) {
      return '';
    }
    var parts = path.split('.');
    var touch = store[parts[0]];
    if (!touch || !touch[parts[1]]) {
      return '';
    }
    return String(touch[parts[1]]);
  }

  function resolveFields(store, fieldMap) {
    var map = sanitizeFieldMap(fieldMap) || DEFAULT_FIELD_MAP;
    var out = {};
    for (var name in map) {
      if (!own(map, name)) {
        continue;
      }
      var value = valueAt(store, map[name]);
      if (value) {
        out[name] = value;
      }
    }
    return out;
  }

  function linkParamsFromStore(store, options) {
    var params = {};
    if (!store) {
      return params;
    }
    var source = store.lt || store.ft;
    var first = store.ft;
    var key;
    if (source) {
      for (var i = 0; i < TRACKED_KEYS.length; i++) {
        key = TRACKED_KEYS[i];
        if (source[key]) {
          params[key] = source[key];
        }
      }
    }
    if (first) {
      if (first.landing_page) {
        params.hb_lp = first.landing_page;
      }
      if (first.referrer) {
        params.hb_rf = first.referrer;
      }
      var encoded = {
        hb_fts: 'utm_source',
        hb_ftm: 'utm_medium',
        hb_ftc: 'utm_campaign',
        hb_ftt: 'utm_term',
        hb_ftn: 'utm_content',
        hb_ft_gclid: 'gclid',
        hb_ft_gbraid: 'gbraid',
        hb_ft_wbraid: 'wbraid',
        hb_ft_fbclid: 'fbclid',
        hb_ft_msclkid: 'msclkid'
      };
      for (key in encoded) {
        if (own(encoded, key) && first[encoded[key]]) {
          params[key] = first[encoded[key]];
        }
      }
    }
    if (options && options.internal) {
      params[CARRY_FLAG] = '1';
    }
    return params;
  }

  function startsWithScheme(raw) {
    var lower = String(raw || '').slice(0, 14).toLowerCase();
    return lower.indexOf('mailto:') === 0 ||
      lower.indexOf('tel:') === 0 ||
      lower.indexOf('sms:') === 0 ||
      lower.indexOf('javascript:') === 0 ||
      lower.indexOf('data:') === 0 ||
      lower.indexOf('blob:') === 0;
  }

  function hasTrackedParam(url) {
    for (var i = 0; i < TRACKED_KEYS.length; i++) {
      if (url.searchParams.has(TRACKED_KEYS[i])) {
        return true;
      }
    }
    return false;
  }

  function formatLikeInput(raw, url) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      return url.origin + url.pathname + url.search + url.hash;
    }
    if (raw.slice(0, 2) === '//') {
      return '//' + url.host + url.pathname + url.search + url.hash;
    }
    return url.pathname + url.search + url.hash;
  }

  function decorateUrl(href, baseHref, params) {
    if (href === undefined || href === null) {
      return href;
    }
    var raw = String(href).trim();
    if (!raw || raw.charAt(0) === '#') {
      return href;
    }
    if (startsWithScheme(raw)) {
      return href;
    }
    var url;
    try {
      url = new URL(raw, baseHref || 'https://hintonbuildings.com/');
    } catch (err) {
      return href;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return href;
    }
    // An intentional campaign link keeps its own parameters.
    if (hasTrackedParam(url)) {
      return href;
    }
    var changed = false;
    for (var key in params) {
      if (!own(params, key)) {
        continue;
      }
      var value = params[key];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (url.searchParams.has(key)) {
        continue;
      }
      url.searchParams.append(key, String(value));
      changed = true;
    }
    if (!changed) {
      return href;
    }
    return formatLikeInput(raw, url);
  }

  function matchesList(hostname, list) {
    if (!list) {
      return false;
    }
    for (var i = 0; i < list.length; i++) {
      if (hostMatches(hostname, list[i])) {
        return true;
      }
    }
    return false;
  }

  function classifyHref(href, baseHref, options) {
    options = options || {};
    var raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') {
      return 'skip';
    }
    if (startsWithScheme(raw)) {
      return 'skip';
    }
    var url;
    var base;
    try {
      base = new URL(baseHref);
      url = new URL(raw, base);
    } catch (err) {
      return 'skip';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'skip';
    }
    var siteHost = options.siteHost || '';
    var sameBrand = siteHost && hostMatches(base.hostname, siteHost) && hostMatches(url.hostname, siteHost);
    if (options.decorateInternal !== false) {
      var currentRoot = rootFor(base.hostname, siteHost);
      var targetRoot = rootFor(url.hostname, siteHost);
      if (currentRoot && currentRoot === targetRoot) {
        return 'internal';
      }
    } else if (sameBrand) {
      return 'skip';
    }
    var extras = options.extraDomains || [];
    if (matchesList(url.hostname, DEFAULT_GHL_DOMAINS) || matchesList(url.hostname, extras)) {
      return 'external';
    }
    // Funnel page linking back to the brand site. Carry attribution, and mark it
    // so the brand site does not treat the return click as a new campaign.
    if (siteHost && hostMatches(url.hostname, siteHost) && !hostMatches(base.hostname, siteHost)) {
      return 'brand';
    }
    return 'skip';
  }

  function planLink(href, baseHref, store, options) {
    var kind = classifyHref(href, baseHref, options);
    if (kind === 'skip') {
      return href;
    }
    var internal = kind === 'internal' || kind === 'brand';
    return decorateUrl(href, baseHref, linkParamsFromStore(store, { internal: internal }));
  }

  function rewriteIframeSrc(src, baseHref, params, options) {
    if (!src) {
      return src;
    }
    var raw = String(src).trim();
    if (!raw || raw.indexOf('about:') === 0) {
      return src;
    }
    if (startsWithScheme(raw)) {
      return src;
    }
    var url;
    try {
      url = new URL(raw, baseHref || 'https://hintonbuildings.com/');
    } catch (err) {
      return src;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return src;
    }
    var hosts = (options && options.hosts) || DEFAULT_GHL_DOMAINS;
    if (!matchesList(url.hostname, hosts)) {
      return src;
    }
    var changed = false;
    for (var key in params) {
      if (!own(params, key)) {
        continue;
      }
      if (params[key] === undefined || params[key] === null || params[key] === '') {
        continue;
      }
      if (url.searchParams.has(key)) {
        continue;
      }
      url.searchParams.append(key, String(params[key]));
      changed = true;
    }
    if (!changed) {
      return src;
    }
    return formatLikeInput(raw, url);
  }

  function stripCarriedUrl(href) {
    var url;
    try {
      url = new URL(href);
    } catch (err) {
      return '';
    }
    if (url.searchParams.get(CARRY_FLAG) !== '1') {
      return '';
    }
    url.searchParams.delete(CARRY_FLAG);
    for (var i = 0; i < TRACKED_KEYS.length; i++) {
      url.searchParams.delete(TRACKED_KEYS[i]);
    }
    for (var j = 0; j < PRIVATE_QUERY_KEYS.length; j++) {
      url.searchParams.delete(PRIVATE_QUERY_KEYS[j]);
    }
    return url.pathname + url.search + url.hash;
  }

  function readCookieValue(cookieHeader, name) {
    if (!cookieHeader) {
      return '';
    }
    var parts = String(cookieHeader).split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].replace(/^\s+/, '');
      var eq = part.indexOf('=');
      if (eq === -1) {
        continue;
      }
      if (part.slice(0, eq) !== name) {
        continue;
      }
      var raw = part.slice(eq + 1);
      try {
        return decodeURIComponent(raw);
      } catch (err) {
        return raw;
      }
    }
    return '';
  }

  function cookieString(name, value, options) {
    options = options || {};
    var out = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + options.maxAge + '; SameSite=Lax';
    if (options.domain) {
      out += '; Domain=' + options.domain;
    }
    if (options.secure) {
      out += '; Secure';
    }
    return out;
  }

  function effectiveCookieDomain(requested, hostname) {
    if (!requested) {
      return '';
    }
    var bare = String(requested).replace(/^\./, '').toLowerCase();
    hostname = String(hostname || '').toLowerCase();
    if (!isValidHost(bare)) {
      return '';
    }
    if (hostname === bare || hostMatches(hostname, bare)) {
      return '.' + bare;
    }
    return '';
  }

  function externalReferrer(referrer, currentHost, siteHost) {
    var clean = cleanReferrer(referrer);
    if (!clean) {
      return '';
    }
    var host;
    try {
      host = new URL(clean).hostname;
    } catch (err) {
      return '';
    }
    // Ignore same-site referrers. On a HighLevel domain, a Hinton Buildings
    // referrer is external and should be kept.
    var currentRoot = rootFor(currentHost, siteHost);
    if (currentRoot && hostMatches(host, currentRoot)) {
      return '';
    }
    if (currentHost && registrableHost(host) === registrableHost(currentHost)) {
      return '';
    }
    return clean;
  }

  function readLocal(win, key) {
    try {
      if (!win.localStorage) {
        return '';
      }
      return win.localStorage.getItem(key) || '';
    } catch (err) {
      return '';
    }
  }

  function writeLocal(win, key, value) {
    try {
      if (!win.localStorage) {
        return false;
      }
      win.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function persist(win, cfg, store) {
    var json = serializeStore(store);
    var localSaved = writeLocal(win, cfg.cookieName, json);
    var cookieJson = json;
    if (encodeURIComponent(json).length > MAX_COOKIE_ENCODED) {
      cookieJson = serializeStore(slimStore(store));
    }
    var hostname = win.location && win.location.hostname ? win.location.hostname : '';
    var domain = effectiveCookieDomain(cfg.cookieDomain, hostname);
    var secure = win.location && win.location.protocol === 'https:';
    var written = cookieString(cfg.cookieName, cookieJson, {
      domain: domain,
      secure: secure,
      maxAge: cfg.cookieDays * 86400
    });
    var cookieSaved = false;
    try {
      win.document.cookie = written;
      cookieSaved = readCookieValue(win.document.cookie, cfg.cookieName).length > 0;
    } catch (err) {
      cookieSaved = false;
    }
    return { local: localSaved, cookie: cookieSaved, cookieText: written };
  }

  function shouldStrip(hostname, cfg) {
    if (cfg.stripCarried === false || cfg.stripCarried === 0 || cfg.stripCarried === '0') {
      return false;
    }
    if (cfg.stripCarried === true || cfg.stripCarried === 1 || cfg.stripCarried === '1') {
      return true;
    }
    return !!(cfg.siteHost && hostMatches(hostname, cfg.siteHost));
  }

  function inSkipScope(el) {
    var node = el;
    while (node) {
      if (node.id === 'wpadminbar') {
        return true;
      }
      if (node.getAttribute && node.getAttribute('data-hb-utm-skip-scope') === '1') {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function findFields(form, name) {
    var found = [];
    var list = form.elements || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === name) {
        found.push(list[i]);
      }
    }
    return found;
  }

  function setOrCreateHidden(form, name, value) {
    var existing = findFields(form, name);
    if (existing.length) {
      for (var i = 0; i < existing.length; i++) {
        var field = existing[i];
        var type = (field.getAttribute ? (field.getAttribute('type') || '') : (field.type || '')).toLowerCase();
        var owned = field.getAttribute && field.getAttribute('data-hb-utm') === '1';
        if (type === 'hidden' || owned || !field.value) {
          field.value = value;
        }
      }
      return;
    }
    var doc = form.ownerDocument || (form.getRootNode && form.getRootNode());
    if (!doc || !doc.createElement) {
      return;
    }
    var input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    if (input.setAttribute) {
      input.setAttribute('data-hb-utm', '1');
      input.setAttribute('autocomplete', 'off');
    }
    form.appendChild(input);
  }

  function boot(win, config) {
    if (!win || !win.document || win.__hbUtmBooted) {
      return;
    }
    win.__hbUtmBooted = true;

    var doc = win.document;
    var loc = win.location || { href: '', search: '', hostname: '', protocol: '', pathname: '', hash: '' };
    var cfg = normalizeConfig(config, loc);

    function log() {
      if (!cfg.debug || !win.console || !win.console.log) {
        return;
      }
      var args = ['[HB UTM]'];
      for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
      }
      win.console.log.apply(win.console, args);
    }

    var query = parseQuery(loc.search || '');
    var landing = cleanLanding(loc.href || '');
    var referrer = externalReferrer(doc.referrer || '', loc.hostname || '', cfg.siteHost);
    var existing = reconcileStores(
      parseStore(readCookieValue(doc.cookie || '', cfg.cookieName)),
      parseStore(readLocal(win, cfg.cookieName))
    );
    var store = updateStore(existing, query, {
      landingPage: landing,
      referrer: referrer,
      now: Date.now()
    });
    var saved = persist(win, cfg, store);
    log('stored attribution', store, saved);

    if ((saved.local || saved.cookie) && shouldStrip(loc.hostname || '', cfg) && win.history && win.history.replaceState) {
      var stripped = stripCarriedUrl(loc.href || '');
      var current = (loc.pathname || '') + (loc.search || '') + (loc.hash || '');
      if (stripped && stripped !== current) {
        try {
          win.history.replaceState(win.history.state, '', stripped);
          log('removed carried parameters from the address bar');
        } catch (err) {
          log('could not clean the address bar', err);
        }
      }
    }

    var linkOptions = {
      siteHost: cfg.siteHost,
      extraDomains: cfg.extraDomains,
      decorateInternal: cfg.decorateInternal
    };

    function decorateAnchor(anchor) {
      if (!anchor || !anchor.getAttribute || anchor.getAttribute('data-hb-utm-skip') === '1' || inSkipScope(anchor)) {
        return;
      }
      var href = anchor.getAttribute('href');
      if (!href) {
        return;
      }
      var baseHref = (win.location && win.location.href) || loc.href;
      var next = planLink(href, baseHref, store, linkOptions);
      if (!next || next === href) {
        return;
      }
      if (anchor.getAttribute('data-hb-utm-done') === next) {
        return;
      }
      anchor.setAttribute('data-hb-utm-done', next);
      anchor.setAttribute('href', next);
    }

    function decorateIframe(iframe) {
      if (!iframe || !iframe.getAttribute || iframe.getAttribute('data-hb-utm-skip') === '1' || inSkipScope(iframe)) {
        return;
      }
      var tries = parseInt(iframe.getAttribute('data-hb-utm-tries') || '0', 10);
      if (isNaN(tries)) {
        tries = 0;
      }
      if (tries > 8) {
        return;
      }
      var fields = resolveFields(store, cfg.fieldMap);
      var names = ['src', 'data-src', 'data-lazy-src'];
      for (var i = 0; i < names.length; i++) {
        var attr = names[i];
        var src = iframe.getAttribute(attr);
        if (!src) {
          continue;
        }
        var next = rewriteIframeSrc(src, (win.location && win.location.href) || loc.href, fields, {
          hosts: cfg.iframeDomains
        });
        if (!next || next === src) {
          continue;
        }
        iframe.setAttribute('data-hb-utm-tries', String(tries + 1));
        iframe.setAttribute(attr, next);
        log('updated iframe', attr, next);
      }
    }

    function decorateForm(form) {
      if (!form || !form.getAttribute || form.getAttribute('data-hb-utm-skip') === '1' || inSkipScope(form)) {
        return;
      }
      var method = (form.getAttribute('method') || 'get').toLowerCase();
      if (method !== 'post') {
        return;
      }
      var formId = String(form.id || form.getAttribute('id') || '');
      if (formId === 'commentform' || formId === 'loginform' || formId === 'registerform' || formId === 'lostpasswordform') {
        return;
      }
      var action = (form.getAttribute('action') || '').toLowerCase();
      if (action.indexOf('wp-login.php') !== -1 || action.indexOf('wp-comments-post.php') !== -1) {
        return;
      }
      var fields = resolveFields(store, cfg.fieldMap);
      for (var name in fields) {
        if (own(fields, name)) {
          setOrCreateHidden(form, name, fields[name]);
        }
      }
      var payload = serializeStore(store);
      if (payload) {
        setOrCreateHidden(form, 'hb_utm_payload', payload);
      }
    }

  function walk(node) {
    if (!node) {
      return;
    }
    if (node.nodeType === 11 || node.nodeType === 9) {
      var children = node.childNodes || [];
      for (var c = 0; c < children.length; c++) {
        walk(children[c]);
      }
      return;
    }
    if (node.nodeType !== 1) {
      return;
    }
      if (node.tagName === 'A') {
        decorateAnchor(node);
      } else if (node.tagName === 'IFRAME') {
        decorateIframe(node);
      } else if (node.tagName === 'FORM') {
        decorateForm(node);
      }
      if (!node.querySelectorAll) {
        return;
      }
      var links = node.querySelectorAll('a[href]');
      var frames = node.querySelectorAll('iframe');
      var forms = node.querySelectorAll('form');
      var i;
      for (i = 0; i < links.length; i++) {
        decorateAnchor(links[i]);
      }
      for (i = 0; i < frames.length; i++) {
        decorateIframe(frames[i]);
      }
      for (i = 0; i < forms.length; i++) {
        decorateForm(forms[i]);
      }
    }

    function decorateAll() {
      if (!doc.querySelectorAll) {
        return;
      }
      var links = doc.querySelectorAll('a[href]');
      var frames = doc.querySelectorAll('iframe');
      var forms = doc.querySelectorAll('form');
      var i;
      for (i = 0; i < links.length; i++) {
        decorateAnchor(links[i]);
      }
      for (i = 0; i < frames.length; i++) {
        decorateIframe(frames[i]);
      }
      for (i = 0; i < forms.length; i++) {
        decorateForm(forms[i]);
      }
    }

    function scheduleDecorate() {
      if (doc.readyState === 'loading' && doc.addEventListener) {
        doc.addEventListener('DOMContentLoaded', decorateAll);
      } else {
        decorateAll();
      }
    }

    scheduleDecorate();

    if (doc.addEventListener) {
      doc.addEventListener('submit', function (event) {
        var target = event.target;
        if (target && target.tagName === 'FORM') {
          decorateForm(target);
        }
      }, true);
      doc.addEventListener('click', function (event) {
        var node = event.target;
        while (node && node.tagName !== 'A') {
          node = node.parentNode;
        }
        if (node) {
          decorateAnchor(node);
        }
      }, true);
    }

    if (win.MutationObserver && doc.documentElement) {
      var queued = false;
      var observer = new win.MutationObserver(function (mutations) {
        if (queued) {
          return;
        }
        queued = true;
        var run = function () {
          queued = false;
          for (var i = 0; i < mutations.length; i++) {
            var mutation = mutations[i];
            if (mutation.type === 'attributes' && mutation.target) {
              if (mutation.target.tagName === 'A') {
                decorateAnchor(mutation.target);
              } else if (mutation.target.tagName === 'IFRAME') {
                decorateIframe(mutation.target);
              }
            } else if (mutation.type === 'childList') {
              var added = mutation.addedNodes || [];
              for (var j = 0; j < added.length; j++) {
                walk(added[j]);
              }
            }
          }
        };
        if (win.requestAnimationFrame) {
          win.requestAnimationFrame(run);
        } else if (win.setTimeout) {
          win.setTimeout(run, 16);
        } else {
          run();
        }
      });
      try {
        observer.observe(doc.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'href', 'data-src', 'data-lazy-src']
        });
      } catch (err) {
        log('could not watch the page for new forms', err);
      }
    }

    if (win.setTimeout) {
      win.setTimeout(decorateAll, 250);
      win.setTimeout(decorateAll, 1000);
      win.setTimeout(decorateAll, 2500);
    }

    log('watching links, iframes, and forms');
  }

  return {
    VERSION: VERSION,
    TRACKED_KEYS: TRACKED_KEYS,
    CARRY_FLAG: CARRY_FLAG,
    LIMITS: LIMITS,
    DEFAULT_GHL_DOMAINS: DEFAULT_GHL_DOMAINS,
    DEFAULT_FIELD_MAP: DEFAULT_FIELD_MAP,
    PRIVATE_QUERY_KEYS: PRIVATE_QUERY_KEYS,
    parseQuery: parseQuery,
    cleanReferrer: cleanReferrer,
    cleanLanding: cleanLanding,
    hostMatches: hostMatches,
    registrableHost: registrableHost,
    normalizeDomains: normalizeDomains,
    normalizeConfig: normalizeConfig,
    parseStore: parseStore,
    serializeStore: serializeStore,
    reconcileStores: reconcileStores,
    updateStore: updateStore,
    resolveFields: resolveFields,
    linkParamsFromStore: linkParamsFromStore,
    decorateUrl: decorateUrl,
    classifyHref: classifyHref,
    planLink: planLink,
    rewriteIframeSrc: rewriteIframeSrc,
    stripCarriedUrl: stripCarriedUrl,
    readCookieValue: readCookieValue,
    cookieString: cookieString,
    effectiveCookieDomain: effectiveCookieDomain,
    externalReferrer: externalReferrer,
    boot: boot
  };
});
