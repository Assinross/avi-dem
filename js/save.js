// Сохранение забега в localStorage. Хранилище может быть недоступно - тогда игра идёт без сохранений.
(function (AD) {
  'use strict';

  var KEY = 'avi-dem-run-v1';

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(run) {
    try { window.localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) { /* без сохранения */ }
  }

  function clear() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* нечего чистить */ }
  }

  AD.Save = { load: load, save: save, clear: clear };
})(window.AD = window.AD || {});
