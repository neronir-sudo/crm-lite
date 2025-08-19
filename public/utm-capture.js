(function () {
  // קריאה פרמטר מה-URL
  function get(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
  }

  // שמירה/קריאה מ-sessionStorage כדי לשרוד ניווטים
  const storeKeys = ['utm_source','utm_campaign','utm_medium','utm_content','utm_term','keyword'];
  function loadStored() {
    const o = {};
    storeKeys.forEach(k => { o[k] = sessionStorage.getItem(k) || ''; });
    return o;
  }
  function saveStored(o) {
    storeKeys.forEach(k => { if (o[k]) sessionStorage.setItem(k, o[k]); });
  }

  // עדכון ערכים: קודם מה-URL, אם חסר – מה-Session
  const fromUrl = {
    utm_source: get('utm_source'),
    utm_campaign: get('utm_campaign'),
    utm_medium: get('utm_medium'),
    utm_content: get('utm_content'),
    utm_term: get('utm_term') || get('keyword') || get('q')
  };
  const stored = loadStored();
  const utm = Object.assign({}, stored, Object.fromEntries(Object.entries(fromUrl).filter(([,v]) => v)));

  saveStored(utm);

  // מילוי שדות אלמנטור לפי ה-ID של השדה
  function fill(id, val) {
    if (!val) return;
    const el = document.querySelector('[id="'+id+'"]');
    if (el && 'value' in el) { el.value = val; }
  }

  function fillAll() {
    fill('utm_source',  utm.utm_source);
    fill('utm_campaign',utm.utm_campaign);
    fill('utm_medium',  utm.utm_medium);
    fill('utm_content', utm.utm_content);
    fill('utm_term',    utm.utm_term);
    // אם יש לכם שדה Keyword נפרד – זה ימלא אותו
    fill('keyword',     utm.utm_term);
  }

  // ברגע שה־DOM מוכן – נמלא. אם אלמנטור טוען מאוחר יותר, ננסה שוב.
  document.addEventListener('DOMContentLoaded', fillAll);
  window.addEventListener('elementor/popup/show', fillAll); // אם משתמשים בפופאפ
})();
