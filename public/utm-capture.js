(function() {
  const PERSIST_DAYS = 90;
  const PARAMS = [
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'gclid','fbclid','ttclid','wbraid','gbraid',
    'campaign_id','adgroup_id','ad_id','creative_id','placement','device','platform','keyword','client_uid'
  ];

  function parseQuery() {
    const p = new URLSearchParams(window.location.search);
    const out = {};
    PARAMS.forEach(k => { const v = p.get(k); if (v) out[k] = v; });
    return out;
  }
  function save(data){
    try { localStorage.setItem('lead_attrib', JSON.stringify({data, ts: Date.now()})); } catch(e){}
    const expires = new Date(Date.now() + PERSIST_DAYS*24*60*60*1000).toUTCString();
    document.cookie = `lead_attrib=${encodeURIComponent(JSON.stringify(data))}; path=/; expires=${expires}`;
  }
  function load(){
    try { const j = localStorage.getItem('lead_attrib'); if (j) return JSON.parse(j).data; } catch(e){}
    const m = document.cookie.match(/(?:^|; )lead_attrib=([^;]+)/);
    if (m) { try { return JSON.parse(decodeURIComponent(m[1])); } catch(e){} }
    return {};
  }
  function ensureHiddenInputs(form, data){
    PARAMS.forEach(k => {
      let el = form.querySelector(`[name="${k}"]`);
      if (!el) { el = document.createElement('input'); el.type='hidden'; el.name=k; form.appendChild(el); }
      if (data[k]) el.value = data[k];
    });
  }

  const qs = parseQuery();
  const existing = load();
  const merged = Object.assign({}, existing, qs);
  if (Object.keys(qs).length) save(merged);

  document.addEventListener('submit', function(e){
    const data = load();
    if (e.target && e.target.tagName === 'FORM') {
      ensureHiddenInputs(e.target, data);
    }
  }, true);
})();

