// public/utm-capture.js
(function () {
  var UTM_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'wbraid', 'gbraid', 'fbclid'
  ];

  function getParamsFromUrl() {
    var out = {};
    try {
      var p = new URLSearchParams(window.location.search);
      UTM_KEYS.forEach(function (k) {
        var v = p.get(k);
        if (v) out[k] = v;
      });
    } catch (_) {}
    return out;
  }

  function loadFromStorage() {
    var out = {};
    try {
      var raw = sessionStorage.getItem('__crm_lite_utm__');
      if (raw) out = JSON.parse(raw) || {};
    } catch (_) {}
    return out;
  }

  function saveToStorage(obj) {
    try {
      sessionStorage.setItem('__crm_lite_utm__', JSON.stringify(obj));
    } catch (_) {}
  }

  function merge(a, b) {
    var out = {};
    [a, b].forEach(function (src) {
      Object.keys(src || {}).forEach(function (k) {
        if (src[k]) out[k] = src[k];
      });
    });
    return out;
  }

  function fillOnce(values) {
    // תואם גם לאלמנטור: לפי ID, ולפי name עם סוגריים
    UTM_KEYS.forEach(function (k) {
      var v = values[k];
      if (!v) return;

      // לפי ה-ID הסטנדרטי של אלמנטור
      var byId = document.getElementById('form-field-' + k);
      if (byId && byId.tagName === 'INPUT') {
        if (!byId.value) byId.value = v;
      }

      // לפי name="form_fields[utm_xxx]"
      var byName = document.querySelector('input[name="form_fields[' + k + ']"]');
      if (byName && !byName.value) byName.value = v;

      // לפי name="utm_xxx" (למקרה של טפסים אחרים)
      var plain = document.querySelector('input[name="' + k + '"]');
      if (plain && !plain.value) plain.value = v;
    });
  }

  function init() {
    var fromUrl = getParamsFromUrl();
    var fromStore = loadFromStorage();
    var merged = merge(fromStore, fromUrl);
    if (Object.keys(fromUrl).length) saveToStorage(merged);

    // ננסה כמה פעמים כי אלמנטור נטען דינמית
    var tries = 0;
    var timer = setInterval(function () {
      fillOnce(merged);
      tries += 1;
      if (tries > 10) clearInterval(timer);
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
