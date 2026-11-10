'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const api = require('../../assets/js/hb-utm-tracker.js');

const BASE = 'https://dev.hintonbuildings.com/page';

function campaignContext(overrides) {
  return Object.assign({
    landingPage: 'https://hintonbuildings.com/land',
    referrer: 'https://www.google.com/',
    now: 10
  }, overrides || {});
}

function options(extra) {
  return Object.assign({
    siteHost: 'hintonbuildings.com',
    extraDomains: [],
    decorateInternal: true
  }, extra || {});
}

function campaignStore() {
  return api.updateStore(null, {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'brand',
    gclid: 'g1'
  }, campaignContext());
}

test('parseQuery keeps campaign parameters and ignores nothing it was given', () => {
  const query = api.parseQuery('?utm_campaign=summer%20sale&utm_source=google&gclid=abc&page=2');
  assert.equal(query.utm_campaign, 'summer sale');
  assert.equal(query.utm_source, 'google');
  assert.equal(query.gclid, 'abc');
  assert.equal(query.page, '2');
});

test('parseQuery keeps the first value when a parameter is repeated', () => {
  const query = api.parseQuery('utm_source=google&utm_source=bing');
  assert.equal(query.utm_source, 'google');
});

test('cleanReferrer drops sensitive query parameters and fragments', () => {
  assert.equal(
    api.cleanReferrer('https://partner.example/land?email=a@b.com&utm_source=partner&password=secret#frag'),
    'https://partner.example/land?utm_source=partner'
  );
  assert.equal(api.cleanReferrer('javascript:alert(1)'), '');
});

test('externalReferrer ignores the same site and keeps a real referrer', () => {
  assert.equal(
    api.externalReferrer('https://www.google.com/search?q=decks', 'dev.hintonbuildings.com', 'hintonbuildings.com'),
    'https://www.google.com/search?q=decks'
  );
  assert.equal(
    api.externalReferrer('https://www.hintonbuildings.com/old', 'dev.hintonbuildings.com', 'hintonbuildings.com'),
    ''
  );
  assert.equal(
    api.externalReferrer('https://dev.hintonbuildings.com/contact', 'api.leadconnectorhq.com', 'hintonbuildings.com'),
    'https://dev.hintonbuildings.com/contact'
  );
});

test('a first campaign visit sets both touches', () => {
  const store = campaignStore();
  assert.equal(store.ft.utm_source, 'google');
  assert.equal(store.ft.gclid, 'g1');
  assert.equal(store.ft.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(store.ft.referrer, 'https://www.google.com/');
  assert.equal(store.lt.utm_source, 'google');
  assert.equal(store.lt.ts, 10);
});

test('a direct visit records referrer and landing page without campaign parameters', () => {
  const store = api.updateStore(null, {}, {
    landingPage: 'https://hintonbuildings.com/',
    referrer: 'https://www.google.com/',
    now: 1
  });
  assert.equal(store.ft.referrer, 'https://www.google.com/');
  assert.equal(store.ft.landing_page, 'https://hintonbuildings.com/');
  assert.equal(store.ft.utm_source, undefined);
  assert.equal(store.lt.landing_page, 'https://hintonbuildings.com/');
});

test('a later visit with no campaign parameters does not erase attribution', () => {
  const first = campaignStore();
  const second = api.updateStore(first, {}, {
    landingPage: 'https://hintonbuildings.com/about',
    referrer: 'https://www.bing.com/',
    now: 40
  });
  assert.equal(second.ft.utm_source, 'google');
  assert.equal(second.ft.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(second.ft.referrer, 'https://www.google.com/');
  assert.equal(second.lt.utm_source, 'google');
  assert.equal(second.lt.gclid, 'g1');
  assert.equal(second.lt.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(second.lt.ts, 10);
});

test('a new campaign replaces last touch only and drops the previous click id', () => {
  const first = campaignStore();
  const second = api.updateStore(first, {
    utm_source: 'facebook',
    utm_medium: 'paid',
    utm_campaign: 'retarget',
    fbclid: 'f1'
  }, {
    landingPage: 'https://hintonbuildings.com/retarget',
    referrer: 'https://m.facebook.com/',
    now: 30
  });
  assert.equal(second.ft.utm_source, 'google');
  assert.equal(second.ft.gclid, 'g1');
  assert.equal(second.ft.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(second.lt.utm_source, 'facebook');
  assert.equal(second.lt.utm_campaign, 'retarget');
  assert.equal(second.lt.fbclid, 'f1');
  assert.equal(second.lt.gclid, undefined);
  assert.equal(second.lt.landing_page, 'https://hintonbuildings.com/retarget');
});

test('carried parameters do not overwrite an existing store', () => {
  const first = campaignStore();
  const snapshot = JSON.parse(JSON.stringify(first));
  const second = api.updateStore(first, {
    utm_source: 'newsletter',
    hb_carry: '1'
  }, {
    landingPage: 'https://hintonbuildings.com/pricing',
    referrer: '',
    now: 20
  });
  assert.deepEqual(first, snapshot);
  assert.equal(second.lt.utm_source, 'google');
  assert.equal(second.lt.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(second.lt.ts, 10);
  assert.equal(second.ft.gclid, 'g1');
});

test('carried parameters restore attribution when storage is empty', () => {
  const store = api.updateStore(null, {
    utm_source: 'google',
    utm_medium: 'cpc',
    hb_carry: '1',
    hb_lp: 'https://hintonbuildings.com/land',
    hb_rf: 'https://www.google.com/',
    hb_fts: 'google'
  }, {
    landingPage: 'https://hintonbuildings.com/pricing',
    referrer: '',
    now: 5
  });
  assert.equal(store.ft.utm_source, 'google');
  assert.equal(store.ft.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(store.ft.referrer, 'https://www.google.com/');
  assert.equal(store.lt.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(store.lt.utm_medium, 'cpc');
});

test('a cross-domain arrival keeps the original first touch and the latest campaign', () => {
  const store = api.updateStore(null, {
    utm_source: 'facebook',
    utm_medium: 'paid',
    fbclid: 'f1',
    hb_fts: 'google',
    hb_ftm: 'cpc',
    hb_ftc: 'brand',
    hb_ft_gclid: 'g1',
    hb_lp: 'https://hintonbuildings.com/land',
    hb_rf: 'https://www.google.com/'
  }, {
    landingPage: 'https://api.leadconnectorhq.com/widget/book',
    referrer: 'https://dev.hintonbuildings.com/contact',
    now: 9
  });
  assert.equal(store.ft.utm_source, 'google');
  assert.equal(store.ft.utm_medium, 'cpc');
  assert.equal(store.ft.utm_campaign, 'brand');
  assert.equal(store.ft.gclid, 'g1');
  assert.equal(store.ft.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(store.ft.referrer, 'https://www.google.com/');
  assert.equal(store.lt.utm_source, 'facebook');
  assert.equal(store.lt.fbclid, 'f1');
  assert.equal(store.lt.gclid, undefined);
  assert.equal(store.lt.landing_page, 'https://api.leadconnectorhq.com/widget/book');
  assert.equal(store.lt.referrer, 'https://dev.hintonbuildings.com/contact');
});

test('reconcileStores keeps the earliest first touch and the latest last touch', () => {
  const cookie = {
    v: 1,
    ft: { ts: 1, utm_source: 'google', landing_page: 'https://hintonbuildings.com/a' },
    lt: { ts: 1, utm_source: 'google' }
  };
  const local = {
    v: 1,
    ft: { ts: 5, utm_source: 'facebook' },
    lt: { ts: 9, utm_source: 'facebook', fbclid: 'f' }
  };
  const merged = api.reconcileStores(cookie, local);
  assert.equal(merged.ft.utm_source, 'google');
  assert.equal(merged.ft.landing_page, 'https://hintonbuildings.com/a');
  assert.equal(merged.lt.utm_source, 'facebook');
  assert.equal(merged.lt.fbclid, 'f');
  assert.equal(merged.lt.ts, 9);
});

test('parseStore rejects malformed, oversized, and hostile values', () => {
  assert.equal(api.parseStore('{'), null);
  assert.equal(api.parseStore('[]'), null);
  assert.equal(api.parseStore('a'.repeat(9000)), null);
  const parsed = api.parseStore(JSON.stringify({
    v: 1,
    ft: { ts: 1, utm_source: '<script>alert(1)</script>', landing_page: 'https://hintonbuildings.com/' },
    lt: { ts: 2, utm_source: 'google' }
  }));
  assert.equal(parsed.ft.utm_source.includes('<'), false);
  assert.equal(parsed.ft.utm_source.includes('>'), false);
  assert.equal(parsed.lt.utm_source, 'google');
});

test('resolveFields maps first and last touch and skips empty values', () => {
  const fields = api.resolveFields(campaignStore(), api.DEFAULT_FIELD_MAP);
  assert.equal(fields.utm_source, 'google');
  assert.equal(fields.utm_medium, 'cpc');
  assert.equal(fields.first_utm_source, 'google');
  assert.equal(fields.landing_page, 'https://hintonbuildings.com/land');
  assert.equal(fields.referrer, 'https://www.google.com/');
  assert.equal(fields.fbclid, undefined);
});

test('decorateUrl preserves the query string and hash and does not duplicate parameters', () => {
  const href = 'https://hintonbuildings.com/contact/?foo=1#quote';
  const params = { utm_source: 'google', utm_medium: 'cpc', utm_term: '' };
  const once = api.decorateUrl(href, href, params);
  const twice = api.decorateUrl(once, href, params);
  assert.equal(once, twice);
  const url = new URL(once);
  assert.equal(url.searchParams.get('foo'), '1');
  assert.equal(url.searchParams.get('utm_source'), 'google');
  assert.equal(url.searchParams.get('utm_medium'), 'cpc');
  assert.equal(url.searchParams.get('utm_term'), null);
  assert.equal(url.searchParams.getAll('utm_source').length, 1);
  assert.equal(url.hash, '#quote');
});

test('decorateUrl leaves non-web links, anchors, and existing campaign links alone', () => {
  const params = { utm_source: 'google' };
  assert.equal(api.decorateUrl('mailto:sales@hintonbuildings.com?subject=Hi', BASE, params), 'mailto:sales@hintonbuildings.com?subject=Hi');
  assert.equal(api.decorateUrl('TEL:+18595551212', BASE, params), 'TEL:+18595551212');
  assert.equal(api.decorateUrl('sms:+18595551212', BASE, params), 'sms:+18595551212');
  assert.equal(api.decorateUrl('#quote', BASE, params), '#quote');
  assert.equal(api.decorateUrl('javascript:alert(1)', BASE, params), 'javascript:alert(1)');
  const existing = 'https://hintonbuildings.com/a?gclid=keep';
  assert.equal(api.decorateUrl(existing, BASE, params), existing);
});

test('decorateUrl keeps relative links relative', () => {
  const next = api.decorateUrl('/contact/?foo=1', BASE, { utm_source: 'google' });
  assert.equal(next.startsWith('/contact/'), true);
  assert.equal(new URL(next, BASE).searchParams.get('foo'), '1');
  assert.equal(new URL(next, BASE).searchParams.get('utm_source'), 'google');
});

test('planLink decorates internal and HighLevel links differently', () => {
  const store = campaignStore();
  const internal = new URL(api.planLink('/contact/?foo=1#quote', BASE, store, options()), BASE);
  assert.equal(internal.pathname, '/contact/');
  assert.equal(internal.searchParams.get('foo'), '1');
  assert.equal(internal.searchParams.get('utm_source'), 'google');
  assert.equal(internal.searchParams.get('gclid'), 'g1');
  assert.equal(internal.searchParams.get('hb_carry'), '1');
  assert.equal(internal.searchParams.get('hb_lp'), 'https://hintonbuildings.com/land');
  assert.equal(internal.hash, '#quote');
  assert.equal(internal.searchParams.getAll('utm_source').length, 1);

  const decks = new URL(api.planLink('https://decks.hintonbuildings.com/build', 'https://www.hintonbuildings.com/', store, options()));
  assert.equal(decks.searchParams.get('hb_carry'), '1');
  assert.equal(decks.searchParams.get('utm_campaign'), 'brand');

  const funnel = new URL(api.planLink('https://api.leadconnectorhq.com/widget/form/abc', BASE, store, options()));
  assert.equal(funnel.searchParams.get('utm_source'), 'google');
  assert.equal(funnel.searchParams.get('hb_carry'), null);
  assert.equal(funnel.searchParams.get('hb_fts'), 'google');
  assert.equal(funnel.searchParams.get('hb_lp'), 'https://hintonbuildings.com/land');

  const home = new URL(api.planLink('https://hintonbuildings.com/thank-you', 'https://api.leadconnectorhq.com/widget/book', store, options()));
  assert.equal(home.searchParams.get('hb_carry'), '1');
  assert.equal(home.searchParams.get('utm_source'), 'google');

  const facebook = 'https://www.facebook.com/hintonbuildings';
  assert.equal(api.planLink(facebook, BASE, store, options()), facebook);

  const custom = 'https://book.example.com/schedule';
  assert.equal(api.planLink(custom, BASE, store, options()), custom);
  const allowed = new URL(api.planLink(custom, BASE, store, options({ extraDomains: ['book.example.com'] })));
  assert.equal(allowed.searchParams.get('utm_source'), 'google');
  assert.equal(allowed.searchParams.get('hb_carry'), null);

  assert.equal(api.planLink('/contact/', BASE, store, options({ decorateInternal: false })), '/contact/');
  assert.equal(
    api.planLink('https://dev.hintonbuildings.com/sale/?utm_source=newsletter', BASE, store, options()),
    'https://dev.hintonbuildings.com/sale/?utm_source=newsletter'
  );
});

test('host matching does not treat lookalike domains as HighLevel', () => {
  assert.equal(api.hostMatches('link.msgsndr.com', 'msgsndr.com'), true);
  assert.equal(api.hostMatches('msgsndr.com', 'msgsndr.com'), true);
  assert.equal(api.hostMatches('msgsndr.com.evil.com', 'msgsndr.com'), false);
  assert.equal(api.hostMatches('evilmsgsndr.com', 'msgsndr.com'), false);
  assert.equal(api.hostMatches('not-hintonbuildings.com', 'hintonbuildings.com'), false);
});

test('rewriteIframeSrc appends missing parameters on HighLevel iframes only', () => {
  const src = 'https://api.leadconnectorhq.com/widget/form/abc?notrack=true#form';
  const next = api.rewriteIframeSrc(src, BASE, {
    utm_source: 'google',
    utm_medium: 'cpc',
    landing_page: 'https://hintonbuildings.com/land'
  });
  const url = new URL(next);
  assert.equal(url.searchParams.get('notrack'), 'true');
  assert.equal(url.searchParams.get('utm_source'), 'google');
  assert.equal(url.searchParams.get('utm_medium'), 'cpc');
  assert.equal(url.searchParams.get('landing_page'), 'https://hintonbuildings.com/land');
  assert.equal(url.searchParams.getAll('utm_source').length, 1);
  assert.equal(url.hash, '#form');
  assert.equal(api.rewriteIframeSrc(next, BASE, { utm_source: 'google', utm_medium: 'cpc' }), next);

  const preset = api.rewriteIframeSrc('https://link.msgsndr.com/widget/survey/abc?utm_source=keep', BASE, {
    utm_source: 'google',
    utm_medium: 'cpc'
  });
  assert.equal(new URL(preset).searchParams.get('utm_source'), 'keep');
  assert.equal(new URL(preset).searchParams.get('utm_medium'), 'cpc');

  const booking = api.rewriteIframeSrc('https://backend.leadconnectorhq.com/widget/booking/abc', BASE, {
    utm_source: 'google'
  });
  assert.equal(new URL(booking).searchParams.get('utm_source'), 'google');

  const youtube = 'https://www.youtube.com/embed/abc';
  assert.equal(api.rewriteIframeSrc(youtube, BASE, { utm_source: 'google' }), youtube);
  assert.equal(api.rewriteIframeSrc('https://notmsgsndr.com/widget/form/abc', BASE, { utm_source: 'google' }), 'https://notmsgsndr.com/widget/form/abc');
});

test('stripCarriedUrl removes only parameters this tracker added', () => {
  const dirty = 'https://dev.hintonbuildings.com/pricing/?utm_source=google&utm_medium=cpc&hb_carry=1&foo=keep&hb_lp=https%3A%2F%2Fhintonbuildings.com%2Fland#details';
  assert.equal(api.stripCarriedUrl(dirty), '/pricing/?foo=keep#details');
  assert.equal(api.stripCarriedUrl('https://dev.hintonbuildings.com/?utm_source=google&gclid=abc'), '');
});

test('cookie helpers stay on the brand domain and do not leak onto HighLevel', () => {
  const written = api.cookieString('hb_utm', '{"v":1}', {
    maxAge: 7776000,
    domain: '.hintonbuildings.com',
    secure: true
  });
  assert.match(written, /Path=\//);
  assert.match(written, /Max-Age=7776000/);
  assert.match(written, /SameSite=Lax/);
  assert.match(written, /Domain=\.hintonbuildings.com/);
  assert.match(written, /Secure/);
  assert.equal(api.readCookieValue('theme=light; ' + written, 'hb_utm'), '{"v":1}');
  assert.equal(api.effectiveCookieDomain('.hintonbuildings.com', 'dev.hintonbuildings.com'), '.hintonbuildings.com');
  assert.equal(api.effectiveCookieDomain('.hintonbuildings.com', 'decks.hintonbuildings.com'), '.hintonbuildings.com');
  assert.equal(api.effectiveCookieDomain('.hintonbuildings.com', 'pages.leadconnectorhq.com'), '');
  assert.equal(api.effectiveCookieDomain('.com', 'hintonbuildings.com'), '');
});

test('PHP and JS share the field map, HighLevel hosts, and length limits', () => {
  const raw = execFileSync('php', [path.join(__dirname, '../php/dump-field-map.php')], { encoding: 'utf8' });
  const dumped = JSON.parse(raw);
  assert.deepEqual(dumped.fieldMap, api.DEFAULT_FIELD_MAP);
  assert.deepEqual(dumped.ghlDomains, api.DEFAULT_GHL_DOMAINS);
  assert.deepEqual(dumped.limits, api.LIMITS);
  assert.deepEqual(dumped.tracked, api.TRACKED_KEYS);
});

test('boot stores attribution, decorates the page, and cleans a carried URL', () => {
  const landing = bootWindow('https://dev.hintonbuildings.com/?utm_source=google&utm_medium=cpc&gclid=g1');
  const stored = JSON.parse(api.readCookieValue(landing.document.cookie, 'hb_utm'));
  assert.equal(stored.ft.utm_source, 'google');
  assert.equal(stored.lt.gclid, 'g1');
  assert.equal(landing.localStorage.getItem('hb_utm').includes('"utm_source":"google"'), true);
  assert.match(landing.document.cookie, /Domain=\.hintonbuildings.com/);
  assert.match(landing.document.cookie, /Secure/);
  assert.equal(landing.history.replaced, undefined);
  assert.equal(landing.nodes.anchors[0].getAttribute('href').includes('utm_source=google'), true);
  assert.equal(landing.nodes.anchors[0].getAttribute('href').includes('hb_carry=1'), true);
  assert.equal(landing.nodes.anchors[1].getAttribute('href'), 'mailto:sales@hintonbuildings.com');
  assert.equal(new URL(landing.nodes.iframes[0].getAttribute('src')).searchParams.get('utm_source'), 'google');
  assert.equal(landing.nodes.iframes[1].getAttribute('src'), 'https://www.youtube.com/embed/abc');
  const names = landing.nodes.forms[0].elements.map((field) => field.name);
  assert.equal(names.includes('utm_source'), true);
  assert.equal(names.includes('hb_utm_payload'), true);
  assert.equal(landing.nodes.forms[0].elements.find((field) => field.name === 'utm_source').value, 'google');
  assert.equal(landing.nodes.forms[1].elements.length, 0);
  assert.equal(landing.nodes.forms[2].elements.length, 0);

  const carried = bootWindow('https://dev.hintonbuildings.com/pricing/?utm_source=google&utm_medium=cpc&hb_carry=1&foo=keep#details');
  assert.equal(carried.history.replaced, '/pricing/?foo=keep#details');
  const restored = JSON.parse(carried.localStorage.getItem('hb_utm'));
  assert.equal(restored.ft.utm_source, 'google');
});

function bootWindow(href) {
  const jar = { value: '' };
  const local = {};
  const listeners = {};
  const anchor = fakeAnchor('/contact/');
  const mail = fakeAnchor('mailto:sales@hintonbuildings.com');
  const frame = fakeIframe('https://api.leadconnectorhq.com/widget/form/abc');
  const youtube = fakeIframe('https://www.youtube.com/embed/abc');
  const post = fakeForm('post');
  const search = fakeForm('get');
  const comment = fakeForm('post', 'commentform');
  const nodes = {
    anchors: [anchor, mail],
    iframes: [frame, youtube],
    forms: [post, search, comment]
  };
  const win = {
    location: new URL(href),
    history: {
      state: null,
      replaceState(state, title, next) {
        this.state = state;
        this.replaced = next;
      }
    },
    document: {
      referrer: 'https://www.google.com/',
      readyState: 'complete',
      documentElement: {},
      get cookie() {
        return jar.value;
      },
      set cookie(value) {
        jar.value = String(value);
      },
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      querySelectorAll(selector) {
        if (selector === 'a[href]') return nodes.anchors;
        if (selector === 'iframe') return nodes.iframes;
        if (selector === 'form') return nodes.forms;
        return [];
      }
    },
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(local, key) ? local[key] : null;
      },
      setItem(key, value) {
        local[key] = String(value);
      }
    },
    setTimeout() {
      return 0;
    },
    MutationObserver: function MutationObserver() {
      this.observe = function observe() {};
    },
    console: { log() {} },
    nodes: nodes
  };
  api.boot(win, {
    cookieDays: 90,
    cookieDomain: '.hintonbuildings.com',
    extraDomains: [],
    siteHost: 'hintonbuildings.com',
    debug: false,
    decorateInternal: true,
    stripCarried: true
  });
  return win;
}

function fakeAnchor(href) {
  const attrs = { href: href };
  return {
    tagName: 'A',
    nodeType: 1,
    parentNode: null,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    }
  };
}

function fakeIframe(src) {
  const attrs = { src: src };
  return {
    tagName: 'IFRAME',
    nodeType: 1,
    parentNode: null,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    }
  };
}

function fakeForm(method, id) {
  const elements = [];
  return {
    tagName: 'FORM',
    nodeType: 1,
    parentNode: null,
    className: '',
    id: id || '',
    elements: elements,
    ownerDocument: {
      createElement() {
        const attrs = {};
        return {
          type: '',
          name: '',
          value: '',
          getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
          },
          setAttribute(name, value) {
            attrs[name] = String(value);
          }
        };
      }
    },
    getAttribute(name) {
      if (name === 'method') return method;
      return null;
    },
    appendChild(node) {
      elements.push(node);
    }
  };
}
