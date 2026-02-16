"use strict";

/**
 * Creates a ZIP code validator backed by a complete USPS ZIP code list.
 *
 * @param {string[]} allZipCodes - Full list of valid 5-digit ZIP codes.
 * @param {Object} [options]
 * @param {boolean} [options.allowZipPlus4=true] - Accept ZIP+4 format (e.g. 12345-6789).
 * @returns {{validate:(zip:string)=>{valid:boolean,type:'ok'|'warning'|'error',message:string,normalized:string},bindToForm:(config:{form:HTMLFormElement,input:HTMLInputElement,messageEl:HTMLElement,errorClass?:string,warningClass?:string,okClass?:string})=>void}}
 */
function createZipValidator(allZipCodes, options = {}) {
  const { allowZipPlus4 = true } = options;

  if (!Array.isArray(allZipCodes) || allZipCodes.length === 0) {
    throw new Error("allZipCodes must be a non-empty array of valid 5-digit ZIP codes.");
  }

  const zipSet = new Set(
    allZipCodes
      .map((zip) => String(zip).trim())
      .filter((zip) => /^\d{5}$/.test(zip))
  );

  if (zipSet.size === 0) {
    throw new Error("allZipCodes does not contain any valid 5-digit ZIP codes.");
  }

  function validate(rawZip) {
    const normalized = String(rawZip ?? "").trim();

    if (!normalized) {
      return {
        valid: false,
        type: "error",
        message: "Please enter a ZIP Code.",
        normalized,
      };
    }

    if (/^\d{5}$/.test(normalized)) {
      if (zipSet.has(normalized)) {
        return {
          valid: true,
          type: "ok",
          message: "ZIP Code is valid.",
          normalized,
        };
      }

      return {
        valid: false,
        type: "warning",
        message: "This ZIP Code is not recognized in the U.S. ZIP list.",
        normalized,
      };
    }

    if (allowZipPlus4 && /^\d{5}-\d{4}$/.test(normalized)) {
      const baseZip = normalized.slice(0, 5);
      if (zipSet.has(baseZip)) {
        return {
          valid: true,
          type: "ok",
          message: "ZIP+4 is valid.",
          normalized,
        };
      }

      return {
        valid: false,
        type: "warning",
        message: "The first 5 digits of this ZIP+4 are not recognized.",
        normalized,
      };
    }

    return {
      valid: false,
      type: "error",
      message: "Invalid ZIP format. Use 5 digits or ZIP+4 (12345 or 12345-6789).",
      normalized,
    };
  }

  function bindToForm(config) {
    const {
      form,
      input,
      messageEl,
      errorClass = "zip-error",
      warningClass = "zip-warning",
      okClass = "zip-ok",
    } = config || {};

    if (!form || !input || !messageEl) {
      throw new Error("bindToForm requires form, input, and messageEl.");
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const result = validate(input.value);

      messageEl.textContent = result.message;
      messageEl.classList.remove(errorClass, warningClass, okClass);

      if (result.type === "error") {
        messageEl.classList.add(errorClass);
      } else if (result.type === "warning") {
        messageEl.classList.add(warningClass);
      } else {
        messageEl.classList.add(okClass);
      }
    });
  }

  return { validate, bindToForm };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createZipValidator };
}
