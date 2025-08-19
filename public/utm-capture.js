(function () {
  var params = new URLSearchParams(location.search);
  var keys = ['utm_source','utm_campaign','utm_medium','utm_content','utm_term','keyword'];

  // לשמור UTM/keyword בלוקאל-סטורג'
  keys.forEach(function(k){
    var v = params.get(k);
    if (v) localStorage.setItem(k, v);
  });

  // לפני שליחה – להשלים שדות חסרים בטופס
  document.addEventListener('submit', function(e){
    var form = e.target.closest('form');
    if (!form) return;
    keys.forEach(function(k){
      var val = localStorage.getItem(k) || '';
      // keyword -> utm_term (אלמנטור שם את מילות המפתח לפעמים תחת "keyword")
      var fieldName = (k === 'keyword') ? 'utm_term' : k;
      var el = form.querySelector('[name="'+fieldName+'"], #'+fieldName);
      if (el && !el.value && val) el.value = val;
    });
  });

  // כלי דיבוג
  window.__utmDump = function(){
    var o = {}; keys.forEach(function(k){ o[k]=localStorage.getItem(k)||''; });
    console.log(o);
  };
})();
