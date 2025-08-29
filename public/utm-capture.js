// public/utm-capture.js
(function () {
  // --- parse current URL once
  var urlUTM = {};
  try {
    var u = new URL(window.location.href);
    var q = u.searchParams;
    var keys = [
      'utm_source','utm_medium','utm_campaign','utm_content','utm_term',
      'gclid','wbraid','gbraid','fbclid','ttclid','msclkid','keyword'
    ];
    keys.forEach(function(k){ var v = q.get(k); if (v) urlUTM[k] = v; });
    if (!urlUTM.utm_term && q.get('q')) urlUTM.utm_term = q.get('q');
  } catch(e) {}

  // also persist to sessionStorage (so it survives internal nav)
  try {
    var stored = JSON.parse(sessionStorage.getItem('crm_lite_utm') || '{}');
    Object.assign(stored, urlUTM);
    sessionStorage.setItem('crm_lite_utm', JSON.stringify(stored));
    urlUTM = stored;
  } catch(e){}

  // --- set value into any of these selectors
  function setField(field, value) {
    if (!value) return;

    // name="utm_source"
    var sel1 = 'input[name="' + field + '"]';
    // name="form_fields[utm_source]" (Elementor)
    var sel2 = 'input[name="form_fields[' + field + ']"]';
    // id="form-field-utm_source" (Elementor default)
    var sel3 = '#form-field-' + field;

    [sel1, sel2, sel3].forEach(function(sel){
      var el = document.querySelector(sel);
      if (el && !el.value) el.value = value;
    });
  }

  function applyAll() {
    Object.keys(urlUTM).forEach(function(k){
      var v = urlUTM[k];
      if (!v) return;
      if (k === 'keyword' && !urlUTM.utm_term) setField('utm_term', v);
      setField(k, v); // utm_*, gclid, fbclid, ...
    });

    // set page_url if exists
    var pageUrl = window.location.href;
    ['page_url'].forEach(function(field){
      setField(field, pageUrl);
    });
  }

  // run asap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }

  // in case Elementor re-renders the form later
  document.addEventListener('elementor/popup/show', applyAll);
  document.addEventListener('elementor/render/form_view', applyAll);
  // small retry after 1s to catch late loads
  setTimeout(applyAll, 1000);
})();

