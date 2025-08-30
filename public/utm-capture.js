// public/utm-capture.js
(function () {
  "use strict";

  /** Persist for 90 days */
  var STORE_KEY = "crm_lite_utms_v1";
  var TTL_MS = 90 * 24 * 60 * 60 * 1000;

  function now() {
    return Date.now();
  }

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.ts !== "number" || now() - obj.ts > TTL_MS) return null;
      return obj.val || null;
    } catch {
      return null;
    }
  }

  function writeStored(utms) {
    try {
      window.localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ ts: now(), val: utms })
      );
    } catch {
      /* noop */
    }
  }

  function get(qs, key) {
    var v = qs.get(key);
    return v && v.trim() !== "" ? v : undefined;
  }

  function collectFromLocation() {
    try {
      var qs = new URLSearchParams(window.location.search || "");
      var out = {
        utm_source: get(qs, "utm_source"),
        utm_medium: get(qs, "utm_medium"),
        utm_campaign: get(qs, "utm_campaign"),
        utm_content: get(qs, "utm_content"),
        utm_term: get(qs, "utm_term"),
      };
      // fallback for ads params
      if (!out.utm_term) {
        out.utm_term =
          get(qs, "keyword") ||
          get(qs, "gclid") ||
          get(qs, "wbraid") ||
          get(qs, "gbraid") ||
          undefined;
      }
      return out;
    } catch {
      return {};
    }
  }

  function firstTouchMerge(a, b) {
    // שמירה על ערכי "מגע ראשון" – אם כבר מאוחסן לא נדרוס
    return {
      utm_source: a.utm_source || b.utm_source,
      utm_medium: a.utm_medium || b.utm_medium,
      utm_campaign: a.utm_campaign || b.utm_campaign,
      utm_content: a.utm_content || b.utm_content,
      utm_term: a.utm_term || b.utm_term,
    };
  }

  function populateInputs(utms) {
    var fields = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ];

    fields.forEach(function (name) {
      var val = utms[name];
      if (!val) return;

      // לפי id או name של שדה חבוי באלמנטור
      var el =
        document.getElementById(name) ||
        document.querySelector('input[name="' + name + '"]');
      if (el && !el.value) el.value = val;
    });
  }

  function run() {
    var stored = readStored() || {};
    var fromUrl = collectFromLocation();
    var merged = firstTouchMerge(stored, fromUrl);
    writeStored(merged);
    populateInputs(merged);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
