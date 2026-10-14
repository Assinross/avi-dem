// Точка входа: загрузка данных и запуск интерфейса.
(function (AD) {
  'use strict';

  function getJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ': ' + r.status);
      return r.json();
    });
  }

  var FILES = ['cards', 'keywords', 'ether', 'races', 'monsters', 'campaign', 'progression', 'tribes', 'assets'];

  Promise.all(FILES.map(function (n) { return getJSON('data/' + n + '.json'); }))
    .then(function (d) {
      var cfg = {};
      FILES.forEach(function (n, i) { cfg[n] = d[i]; });
      AD.Engine.setData({ cards: cfg.cards, ether: cfg.ether });
      AD.Assets.setManifest(cfg.assets);
      return AD.Assets.preload(cfg.cards.map(function (c) { return c.art; })).then(function () { AD.Screens.start(cfg); });
    })
    .catch(function (err) {
      document.getElementById('app').textContent =
        'Ошибка загрузки данных: ' + err.message + '. Запустите через python3 -m http.server 8068.';
    });
})(window.AD);
