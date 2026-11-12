// ==UserScript==
// @name         Russellville RTO Tools (Hinton Buildings)
// @namespace    https://hintonbuildings.com
// @version      2.0.0
// @description  One script for russellville.rtocontracts.com. Contracts: Extra Hauling at $3.00/mile over 60 from Rich Square. Manufacturer sales: 50% deposit incl. tax, Coastal deck serial builder, county dropdown, and NCDOR tax rate fill.
// @author       Hinton Buildings
// @match        https://russellville.rtocontracts.com/contracts/new*
// @match        https://russellville.rtocontracts.com/contracts/*/edit*
// @match        https://russellville.rtocontracts.com/manufacturer_sales/new*
// @match        https://russellville.rtocontracts.com/manufacturer_sales/*/edit*
// @connect      geocoding.geo.census.gov
// @connect      nominatim.openstreetmap.org
// @connect      router.project-osrm.org
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

/* ===================== PART 1: Extra Hauling (contracts pages) ===================== */
(function () {
  "use strict";
  if (!/^\/contracts\/(new|[^/]+\/edit)/.test(location.pathname)) return;

  const YARD = {
    label: "3503 Hwy 305, Rich Square, NC 27869",
    lon: -77.300566934806,
    lat: 36.2841669196,
  };
  const FREE_MILES = 60;
  const RATE_PER_MILE = 3.0;
  const DEBOUNCE_MS = 800;

  const SELECTORS = {
    line1: "#contract_physical_address_attributes_address_line_1",
    line2: "#contract_physical_address_attributes_address_line_2",
    city: "#contract_physical_address_attributes_city",
    state: "#contract_physical_address_attributes_state_province",
    zip: "#contract_physical_address_attributes_postal_code",
    country: "#contract_physical_address_attributes_country_code",
    haulFee: "#contract_delivery_charge",
  };

  const geocodeCache = new Map();
  const routeCache = new Map();
  let debounceTimer = null;
  let requestSeq = 0;
  let lastAutoFee = null;
  let manualOverride = false;
  let lastAddressKey = "";

  function gmRequest(url, headers) {
    const fn =
      (typeof GM !== "undefined" && GM.xmlHttpRequest) ||
      (typeof GM_xmlhttpRequest !== "undefined" && GM_xmlhttpRequest);
    if (!fn) {
      return Promise.reject(new Error("Tampermonkey GM_xmlhttpRequest is unavailable"));
    }
    return new Promise((resolve, reject) => {
      fn({
        method: "GET",
        url,
        headers: headers || {},
        timeout: 15000,
        onload(res) {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error("HTTP " + res.status));
        },
        onerror() {
          reject(new Error("Network error"));
        },
        ontimeout() {
          reject(new Error("Request timed out"));
        },
      });
    });
  }

  function val(selector) {
    const el = document.querySelector(selector);
    return el ? String(el.value || "").trim() : "";
  }

  function buildAddress() {
    const line1 = val(SELECTORS.line1);
    const line2 = val(SELECTORS.line2);
    const city = val(SELECTORS.city);
    const state = val(SELECTORS.state);
    const zip = val(SELECTORS.zip);
    const country = val(SELECTORS.country);
    if (!line1 || !city || !state || !/^\d{5}(?:-\d{4})?$/.test(zip)) return "";
    return [line1, line2, city, state + " " + zip, country || "US"]
      .filter(Boolean)
      .join(", ");
  }

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 3958.7613;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function parseJson(text) {
    return JSON.parse(text);
  }

  async function geocodeCensus(address) {
    const url =
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=" +
      encodeURIComponent(address) +
      "&benchmark=Public_AR_Current&format=json";
    const data = parseJson(await gmRequest(url));
    const match = data && data.result && data.result.addressMatches && data.result.addressMatches[0];
    if (!match || !match.coordinates) return null;
    return { lon: match.coordinates.x, lat: match.coordinates.y, label: match.matchedAddress || address };
  }

  async function geocodeNominatim(address) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(address);
    const data = parseJson(
      await gmRequest(url, {
        Accept: "application/json",
        "User-Agent": "HintonBuildings-RTO-Hauling/1.0 (russellville-rto-extra-hauling)",
      })
    );
    if (!Array.isArray(data) || !data[0]) return null;
    return { lon: parseFloat(data[0].lon), lat: parseFloat(data[0].lat), label: data[0].display_name || address };
  }

  async function geocode(address) {
    const key = address.toLowerCase();
    if (geocodeCache.has(key)) return geocodeCache.get(key);
    let result = null;
    try {
      result = await geocodeCensus(address);
    } catch (err) {
      result = null;
    }
    if (!result) {
      result = await geocodeNominatim(address);
    }
    if (!result) throw new Error("Address not found");
    geocodeCache.set(key, result);
    return result;
  }

  async function drivingMiles(dest) {
    const key = dest.lat.toFixed(6) + "," + dest.lon.toFixed(6);
    if (routeCache.has(key)) return routeCache.get(key);
    const url =
      "https://router.project-osrm.org/route/v1/driving/" +
      YARD.lon +
      "," +
      YARD.lat +
      ";" +
      dest.lon +
      "," +
      dest.lat +
      "?overview=false";
    const data = parseJson(await gmRequest(url));
    if (!data || data.code !== "Ok" || !data.routes || !data.routes[0]) {
      throw new Error("No route");
    }
    const miles = data.routes[0].distance / 1609.344;
    const result = { miles, source: "driving" };
    routeCache.set(key, result);
    return result;
  }

  function feeFromMiles(miles) {
    const rounded = Math.round(miles);
    const extra = Math.max(0, rounded - FREE_MILES);
    return { rounded, extra, fee: Math.round(extra * RATE_PER_MILE * 100) / 100 };
  }

  function setInputValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setHaulFee(amount) {
    const el = document.querySelector(SELECTORS.haulFee);
    if (!el) return;
    const value = Number(amount).toFixed(2);
    setInputValue(el, value);
    lastAutoFee = value;
    manualOverride = false;
  }

  function statusEl() {
    let el = document.getElementById("tm-hauling-status");
    if (el) return el;
    const input = document.querySelector(SELECTORS.haulFee);
    if (!input) return null;
    el = document.createElement("div");
    el.id = "tm-hauling-status";
    el.setAttribute("role", "status");
    el.style.cssText = "margin-top:6px;font-size:13px;line-height:1.35;color:#1a1a1a;";
    const group = input.closest(".form__group, .form-group, .field, .input") || input.parentElement;
    group.appendChild(el);
    return el;
  }

  function setStatus(message, tone) {
    const el = statusEl();
    if (!el) return;
    const colors = { info: "#1a1a1a", wait: "#555", ok: "#0b6b2e", warn: "#8a5a00", err: "#9b1c1c" };
    el.style.color = colors[tone] || colors.info;
    el.textContent = message;
  }

  async function recalculate() {
    const address = buildAddress();
    const seq = ++requestSeq;
    if (!address) {
      lastAddressKey = "";
      setStatus("Enter a complete physical address (line 1, city, state, and ZIP) to calculate the zone haul fee.", "info");
      return;
    }
    if (address === lastAddressKey && lastAutoFee !== null && !manualOverride) return;
    if (address !== lastAddressKey) {
      manualOverride = false;
      lastAddressKey = address;
    }
    if (manualOverride) {
      setStatus("Zone haul fee was edited by hand. Change the physical address to recalculate.", "warn");
      return;
    }

    setStatus("Looking up driving distance from the Rich Square yard…", "wait");
    try {
      const dest = await geocode(address);
      if (seq !== requestSeq) return;
      let trip;
      let usedFallback = false;
      try {
        trip = await drivingMiles(dest);
      } catch (err) {
        trip = {
          miles: haversineMiles(YARD.lat, YARD.lon, dest.lat, dest.lon),
          source: "straight-line",
        };
        usedFallback = true;
      }
      if (seq !== requestSeq) return;
      const { rounded, extra, fee } = feeFromMiles(trip.miles);
      setHaulFee(fee);
      const exact = trip.miles.toFixed(1);
      if (usedFallback) {
        setStatus(
          "Could not get a driving route, so this uses straight-line distance: " +
            rounded +
            " miles (" +
            exact +
            " exact) from Rich Square. " +
            (extra
              ? extra + " miles over 60 × $3.00 = $" + fee.toFixed(2) + "."
              : "Within 60 miles, so the zone haul fee is $0.00."),
          "warn"
        );
      } else if (extra) {
        setStatus(
          rounded +
            " driving miles from Rich Square (" +
            exact +
            " exact, " +
            extra +
            " over 60). Zone haul fee set to $" +
            fee.toFixed(2) +
            ".",
          "ok"
        );
      } else {
        setStatus(
          rounded +
            " driving miles from Rich Square (" +
            exact +
            " exact). Within 60 miles, so the zone haul fee is $0.00.",
          "ok"
        );
      }
    } catch (err) {
      if (seq !== requestSeq) return;
      setStatus(
        "Could not calculate hauling for that address. Check the physical address and try again" +
          (err && err.message ? " (" + err.message + ")." : "."),
        "err"
      );
    }
  }

  function scheduleRecalculate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recalculate, DEBOUNCE_MS);
  }

  function onFeeManualInput(event) {
    const el = event.target;
    if (!el || el.id !== "contract_delivery_charge") return;
    const current = Number(el.value).toFixed(2);
    if (lastAutoFee !== null && current !== lastAutoFee) {
      manualOverride = true;
      setStatus("Zone haul fee was edited by hand. Change the physical address to recalculate.", "warn");
    }
  }

  function bind(root) {
    const form =
      document.getElementById("new_contract") ||
      document.querySelector('form[id^="edit_contract"]') ||
      document.querySelector(SELECTORS.haulFee)?.form;
    if (!form) return;
    if (form.dataset.tmHaulingBound === "1") {
      if (buildAddress()) scheduleRecalculate();
      return;
    }
    form.dataset.tmHaulingBound = "1";

    const addressSelectors = [
      SELECTORS.line1,
      SELECTORS.line2,
      SELECTORS.city,
      SELECTORS.state,
      SELECTORS.zip,
      SELECTORS.country,
    ];
    addressSelectors.forEach((selector) => {
      const el = form.querySelector(selector);
      if (!el) return;
      el.addEventListener("input", scheduleRecalculate);
      el.addEventListener("change", scheduleRecalculate);
    });

    const fee = form.querySelector(SELECTORS.haulFee);
    if (fee) {
      fee.addEventListener("input", onFeeManualInput);
      fee.addEventListener("change", onFeeManualInput);
    }

    scheduleRecalculate();
  }

  function start() {
    bind();
  }

  start();
  document.addEventListener("DOMContentLoaded", start);
  document.addEventListener("turbo:load", start);
  document.addEventListener("turbo:render", start);
  document.addEventListener("turbo:frame-load", start);
  document.addEventListener("turbo:after-stream-render", start);
})();

/* ===================== PART 2: Manufacturer sales tools ===================== */
(function () {
  'use strict';
  if (!/^\/manufacturer_sales\/(new|[^/]+\/edit)/.test(location.pathname)) return;

  const DEPOSIT_RATIO = 0.5;

  // NC combined sales tax rates (state + local + transit), counties within 50 miles of the
  // Princeton, Dunn, and La Grange lots. Source: NCDOR current sales and use tax rates,
  // effective July 1, 2026, checked Nov 12, 2026. Update here when NCDOR changes a rate.
  const COUNTY_RATES = {
    "Beaufort": 6.75,
    "Bladen": 6.75,
    "Carteret": 6.75,
    "Chatham": 7.0,
    "Craven": 6.75,
    "Cumberland": 7.0,
    "Duplin": 7.0,
    "Durham": 7.5,
    "Edgecombe": 7.0,
    "Franklin": 6.75,
    "Granville": 6.75,
    "Greene": 7.0,
    "Halifax": 7.0,
    "Harnett": 7.0,
    "Hoke": 6.75,
    "Johnston": 6.75,
    "Jones": 7.0,
    "Lee": 7.0,
    "Lenoir": 6.75,
    "Martin": 7.0,
    "Moore": 7.0,
    "Nash": 6.75,
    "Onslow": 7.0,
    "Orange": 7.5,
    "Pamlico": 6.75,
    "Pender": 6.75,
    "Pitt": 7.0,
    "Robeson": 7.0,
    "Sampson": 7.0,
    "Scotland": 6.75,
    "Wake": 7.25,
    "Wayne": 6.75,
    "Wilson": 6.75
  };

  const $ = (sel) => document.querySelector(sel);
  const num = (el) => {
    if (!el) return NaN;
    const v = parseFloat(String(el.value).replace(/[^0-9.\-]/g, ''));
    return isNaN(v) ? NaN : v;
  };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const money = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function setValue(el, value) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function makeRow(afterEl, btnText, color, onClick, id) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:6px 0 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = id; btn.textContent = btnText;
    btn.style.cssText = 'background:' + color + ';color:#fff;border:0;border-radius:6px;padding:10px 14px;font-size:15px;min-height:44px;cursor:pointer;';
    btn.addEventListener('click', onClick);
    const note = document.createElement('span');
    note.style.cssText = 'font-size:14px;';
    wrap.appendChild(btn); wrap.appendChild(note);
    afterEl.insertAdjacentElement('afterend', wrap);
    return note;
  }

  // ---------- 50% deposit (incl. tax) ----------
  function grandTotal() {
    const cash = num($('#manufacturer_sale_cash_price')) || num($('#manufacturer_sale_base_price'));
    const rate = num($('#manufacturer_sale_sales_tax_rate'));
    if (!isNaN(cash) && !isNaN(rate)) return round2(cash + round2(cash * rate / 100));
    return num($('#manufacturer_sale_grand_total'));
  }

  let depositNote;
  function applyDeposit() {
    const deposit = $('#manufacturer_sale_initial_payment');
    const total = grandTotal();
    if (!deposit || isNaN(total) || total <= 0) {
      if (depositNote) { depositNote.textContent = 'Could not find the total. Deposit not changed.'; depositNote.style.color = '#b00020'; }
      return;
    }
    const amount = round2(total * DEPOSIT_RATIO);
    setValue(deposit, amount.toFixed(2));
    if (depositNote) {
      depositNote.textContent = 'Deposit set to $' + money(amount) + ' (50% of $' + money(total) + ' incl. tax)';
      depositNote.style.color = '#1a7f37';
    }
  }

  // ---------- County dropdown + tax rate ----------
  const COUNTY_ID = 'manufacturer_sale_physical_address_attributes_county';
  let taxNote;

  function normalizeCounty(v) {
    return String(v || '').replace(/\s+county\s*$/i, '').trim().toLowerCase();
  }

  function setTaxForCounty(county) {
    const rateEl = $('#manufacturer_sale_sales_tax_rate');
    const key = Object.keys(COUNTY_RATES).find((c) => c.toLowerCase() === normalizeCounty(county));
    if (!rateEl || !key) return;
    const rate = COUNTY_RATES[key];
    if (num(rateEl) !== rate) setValue(rateEl, String(rate));
    if (taxNote) { taxNote.textContent = key + ' County: ' + rate.toFixed(2) + '% (NCDOR, eff. July 1, 2026)'; taxNote.style.color = '#1a7f37'; }
    setTimeout(applyDeposit, 150);
  }

  function countyDropdown() {
    const input = document.getElementById(COUNTY_ID);
    if (!input || input.tagName === 'SELECT') return;
    const sel = document.createElement('select');
    for (const a of input.attributes) {
      if (['type', 'value', 'autocomplete', 'placeholder'].includes(a.name)) continue;
      sel.setAttribute(a.name, a.value);
    }
    sel.className = input.className;
    sel.style.cssText = 'min-height:44px;font-size:16px;width:100%;';
    const cur = input.value.trim();
    const blank = new Option('Select county', '');
    sel.add(blank);
    const names = Object.keys(COUNTY_RATES).sort();
    let matched = false;
    for (const c of names) {
      const o = new Option(c + ' (' + COUNTY_RATES[c].toFixed(2) + '%)', c);
      if (normalizeCounty(cur) === c.toLowerCase()) { o.selected = true; matched = true; }
      sel.add(o);
    }
    if (cur && !matched) {
      // Keep whatever was saved so nothing is lost; pick a real county to replace it.
      const keep = new Option(cur + ' (not in list)', cur);
      keep.selected = true;
      sel.add(keep, 1);
    }
    input.replaceWith(sel);
    sel.addEventListener('change', () => setTaxForCounty(sel.value));
    if (matched) setTaxForCounty(sel.value);
  }

  // ---------- Serial number (Coastal Custom Decks dealer guide, Nov 2026) ----------
  // Format: [Location][Size][Style][Options][MMDDYY][Time sold]
  // Location is always N1 (North Carolina) per Ryan.
  const SERIAL_LOCATION = 'N1';
  const S = (k) => document.getElementById('manufacturer_sale_properties_structure_' + k);

  function serialSize() {
    const txt = (S('size') && S('size').value) || (S('style') && S('style').value) || '';
    const m = txt.match(/(\d{1,2})\s*'?\s*[xX×]\s*(\d{1,2})/);
    if (!m) return null;
    const pad = (n) => String(parseInt(n, 10)).padStart(2, '0');
    return pad(m[1]) + pad(m[2]);
  }

  function serialStyle() {
    const txt = ((S('style') && S('style').value) || '') + ' ' + ((S('roof_material') && S('roof_material').value) || '');
    if (/a[\s-]?frame|gable/i.test(txt)) return 'A';
    if (/mono/i.test(txt)) return 'M';
    return 'D'; // Open deck
  }

  function serialOptions() {
    const all = [S('style'), S('deck_stain'), document.getElementById('manufacturer_sale_notes')]
      .map((el) => (el && el.value) || '').join(' ');
    const stain = (S('deck_stain') && S('deck_stain').value) || '';
    let opt = '';
    if (/screen/i.test(all)) opt += 'S';
    if (/danish|light\s*brown/i.test(stain)) opt += 'B';
    else if (/cedar/i.test(stain)) opt += 'C';
    else if (/charcoal|gr[ae]y/i.test(stain)) opt += 'G';
    return opt; // Treated/natural adds nothing
  }

  function serialDateTime() {
    const d = document.getElementById('manufacturer_sale_date');
    let mm, dd, yy;
    const m = d && d.value && d.value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const now = new Date();
    if (m) { yy = m[1].slice(2); mm = m[2]; dd = m[3]; }
    else {
      mm = String(now.getMonth() + 1).padStart(2, '0');
      dd = String(now.getDate()).padStart(2, '0');
      yy = String(now.getFullYear()).slice(2);
    }
    const h12 = now.getHours() % 12 || 12;           // time sold, e.g. 8:51 -> 851
    const time = String(h12) + String(now.getMinutes()).padStart(2, '0');
    return mm + dd + yy + time;
  }

  function buildSerial() {
    const size = serialSize();
    if (!size) return null;
    return SERIAL_LOCATION + size + serialStyle() + serialOptions() + serialDateTime();
  }

  function applySerial(force) {
    const field = document.getElementById('manufacturer_sale_properties_structure_serial_number');
    if (!field) return;
    const contractNo = (document.getElementById('manufacturer_sale_number') || {}).value || '';
    const cur = field.value.trim();
    const looksDefault = !cur || cur === contractNo;
    if (!force && !looksDefault) return; // keep a serial that was already built or typed
    const serial = buildSerial();
    if (!serial) { serialNote && (serialNote.textContent = 'Could not read the deck size, serial not set.'); return; }
    setValue(field, serial);
    if (serialNote) { serialNote.textContent = 'Serial set to ' + serial; serialNote.style.color = '#1a7f37'; }
  }

  let serialNote;
  function addSerialButton() {
    const field = document.getElementById('manufacturer_sale_properties_structure_serial_number');
    if (!field || document.getElementById('hb-serial-btn')) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:6px 0 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'hb-serial-btn';
    btn.textContent = 'Build Coastal serial';
    btn.style.cssText = 'background:#0b3d91;color:#fff;border:0;border-radius:6px;padding:10px 14px;font-size:15px;min-height:44px;cursor:pointer;';
    btn.addEventListener('click', () => applySerial(true));
    serialNote = document.createElement('span');
    serialNote.style.cssText = 'font-size:14px;';
    wrap.appendChild(btn); wrap.appendChild(serialNote);
    field.insertAdjacentElement('afterend', wrap);
  }


  // ---------- init ----------
  function init() {
    const deposit = $('#manufacturer_sale_initial_payment');
    if (!deposit) return false;
    if (document.getElementById('hb-50-deposit-btn')) return true;

    depositNote = makeRow(deposit, 'Set 50% deposit (incl. tax)', '#c8102e', applyDeposit, 'hb-50-deposit-btn');

    const rateEl = $('#manufacturer_sale_sales_tax_rate');
    if (rateEl) {
      taxNote = makeRow(rateEl, 'Use county tax rate', '#0b3d91', () => {
        const c = document.getElementById(COUNTY_ID);
        if (c && c.value) setTaxForCounty(c.value);
        else if (taxNote) { taxNote.textContent = 'Pick a county in the Customer section first.'; taxNote.style.color = '#b00020'; }
      }, 'hb-tax-btn');
      rateEl.addEventListener('blur', () => setTimeout(applyDeposit, 150));
    }

    countyDropdown();
    addSerialButton();
    applySerial(false);
    setTimeout(applyDeposit, 300);
    return true;
  }

  if (!init()) {
    const obs = new MutationObserver(() => { if (init()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 15000);
  }
})();
