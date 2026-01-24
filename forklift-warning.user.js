// ==UserScript==
// @name         Hinton Buildings Forklift Warning
// @namespace    https://hintonbuildings.com/
// @version      1.0.0
// @description  Display a yellow warning bar when a forklift rental is required.
// @match        https://crm.senseicrm.com/*
// @match        https://cdn.sensei3d.com/*
// @match        https://*.senseicrm.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const config = {
    widthSelector:
      'input[name*="width" i], input[id*="width" i], [data-field*="width" i]',
    heightSelector:
      'input[name*="height" i], input[id*="height" i], [data-field*="height" i]',
    doorSideSelector:
      'input[name*="door" i][name*="side" i], select[name*="door" i][name*="side" i], [data-field*="door" i][data-field*="side" i]',
    doorHeightSelector:
      'input[name*="door" i][name*="height" i], input[id*="door" i][id*="height" i], [data-field*="door" i][data-field*="height" i]',
    widthLabelRegexes: [/\\bwidth\\b/i, /building\\s*width/i],
    heightLabelRegexes: [/\\bheight\\b/i, /building\\s*height/i],
    doorSideLabelRegexes: [/door\\s*side/i, /side\\s*wall/i],
    doorHeightLabelRegexes: [/door\\s*height/i, /garage\\s*door\\s*height/i],
    doorSideTrueValues: ["side", "sidewall", "side wall", "yes", "true", "1"],
    widthKeywords: ["width", "wide"],
    heightKeywords: ["height", "tall"],
    doorKeywords: ["door", "garage"],
    sideKeywords: ["side", "sidewall", "side wall"],
    refreshIntervalMs: 1000,
  };

  const warningId = "forklift-warning-bar";

  const parseNumber = (value) => {
    if (value == null) {
      return null;
    }
    const normalized = String(value).replace(/[^0-9.]/g, "");
    if (!normalized) {
      return null;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const deepQuerySelectorAll = (selector, root = document) => {
    const results = [];
    const visit = (node) => {
      if (!node || !node.querySelectorAll) {
        return;
      }
      results.push(...node.querySelectorAll(selector));
      const allElements = node.querySelectorAll("*");
      allElements.forEach((element) => {
        if (element.shadowRoot) {
          visit(element.shadowRoot);
        }
      });
    };
    visit(root);
    return results;
  };

  const readElementValue = (element) => {
    if (!element) {
      return null;
    }

    if (element instanceof HTMLInputElement) {
      if (element.type === "checkbox") {
        return element.checked;
      }
      if (element.type === "radio") {
        return element.checked ? element.value : null;
      }
      return element.value;
    }

    if (element instanceof HTMLSelectElement) {
      const option = element.selectedOptions[0];
      return option ? option.textContent || option.value : element.value;
    }

    return element.textContent;
  };

  const findValueBySelector = (selector) => {
    const elements = deepQuerySelectorAll(selector);
    for (const element of elements) {
      const value = readElementValue(element);
      if (value != null && String(value).trim() !== "") {
        return value;
      }
    }
    return null;
  };

  const findValueByLabel = (labelRegexes) => {
    const labels = deepQuerySelectorAll("label");
    for (const label of labels) {
      const text = label.textContent ? label.textContent.trim() : "";
      if (!text) {
        continue;
      }
      const matches = labelRegexes.some((regex) => regex.test(text));
      if (!matches) {
        continue;
      }

      if (label.htmlFor) {
        const target = document.getElementById(label.htmlFor);
        const value = readElementValue(target);
        if (value != null && String(value).trim() !== "") {
          return value;
        }
      }

      const nested = label.querySelector("input, select, textarea");
      const nestedValue = readElementValue(nested);
      if (nestedValue != null && String(nestedValue).trim() !== "") {
        return nestedValue;
      }

      const container = label.closest("div, li, section, article, fieldset");
      if (container) {
        const nearby = container.querySelector("input, select, textarea");
        const nearbyValue = readElementValue(nearby);
        if (nearbyValue != null && String(nearbyValue).trim() !== "") {
          return nearbyValue;
        }
      }
    }
    return null;
  };

  const findValueByKeywords = (keywords, additionalKeywords = []) => {
    const elements = deepQuerySelectorAll("input, select, textarea");
    for (const element of elements) {
      const attributes = [
        element.name,
        element.id,
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        element.getAttribute("data-label"),
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      const haystack = attributes.join(" ");

      const keywordMatch = keywords.some((keyword) => haystack.includes(keyword));
      if (!keywordMatch) {
        continue;
      }

      if (additionalKeywords.length > 0) {
        const additionalMatch = additionalKeywords.some((keyword) =>
          haystack.includes(keyword)
        );
        if (!additionalMatch) {
          continue;
        }
      }

      const value = readElementValue(element);
      if (value != null && String(value).trim() !== "") {
        return value;
      }
    }
    return null;
  };

  const isDoorOnSide = (value) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (value == null) {
      return false;
    }
    const normalized = String(value).trim().toLowerCase();
    if (config.doorSideTrueValues.includes(normalized)) {
      return true;
    }
    return config.sideKeywords.some((keyword) => normalized.includes(keyword));
  };

  const getForkliftReasons = () => {
    const widthValue = parseNumber(
      findValueBySelector(config.widthSelector) ??
        findValueByLabel(config.widthLabelRegexes) ??
        findValueByKeywords(config.widthKeywords)
    );
    const heightValue = parseNumber(
      findValueBySelector(config.heightSelector) ??
        findValueByLabel(config.heightLabelRegexes) ??
        findValueByKeywords(config.heightKeywords)
    );
    const doorHeightValue = parseNumber(
      findValueBySelector(config.doorHeightSelector) ??
        findValueByLabel(config.doorHeightLabelRegexes) ??
        findValueByKeywords(config.heightKeywords, config.doorKeywords)
    );
    const doorSideValue =
      findValueBySelector(config.doorSideSelector) ??
      findValueByLabel(config.doorSideLabelRegexes) ??
      findValueByKeywords(config.sideKeywords, config.doorKeywords);

    const reasons = [];

    if (widthValue != null && widthValue > 30) {
      reasons.push(`Building width ${widthValue}' exceeds 30'.`);
    }

    if (heightValue != null && heightValue > 14) {
      reasons.push(`Building height ${heightValue}' exceeds 14'.`);
    }

    if (isDoorOnSide(doorSideValue) && doorHeightValue != null) {
      if (doorHeightValue > 12) {
        reasons.push(
          `Side garage door height ${doorHeightValue}' exceeds 12'.`
        );
      }
    }

    return reasons;
  };

  const ensureWarningBar = () => {
    let bar = document.getElementById(warningId);
    if (!bar) {
      bar = document.createElement("div");
      bar.id = warningId;
      bar.style.position = "fixed";
      bar.style.top = "0";
      bar.style.left = "0";
      bar.style.right = "0";
      bar.style.zIndex = "9999";
      bar.style.background = "#ffeb3b";
      bar.style.color = "#000";
      bar.style.padding = "12px 16px";
      bar.style.fontFamily = "Arial, sans-serif";
      bar.style.fontSize = "14px";
      bar.style.borderBottom = "1px solid #bdb100";
      bar.style.display = "none";
      document.body.appendChild(bar);
    }
    return bar;
  };

  const updateWarning = () => {
    const bar = ensureWarningBar();
    bar.innerHTML = "⚠️ <strong>Forklift rental required.</strong>";
    bar.style.display = "block";
    document.body.style.paddingTop = "52px";
  };

  const attachListeners = () => {
    const selectors = [
      config.widthSelector,
      config.heightSelector,
      config.doorSideSelector,
      config.doorHeightSelector,
    ];

    selectors.forEach((selector) => {
      deepQuerySelectorAll(selector).forEach((element) => {
        element.addEventListener("input", updateWarning, { passive: true });
        element.addEventListener("change", updateWarning, { passive: true });
      });
    });
  };

  const observer = new MutationObserver(() => {
    attachListeners();
    updateWarning();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  attachListeners();
  updateWarning();

  setInterval(updateWarning, config.refreshIntervalMs);
})();
