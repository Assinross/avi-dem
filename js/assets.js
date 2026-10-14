// Ассеты: манифест имеющихся картинок (data/assets.json) и предзагрузка.
// Нет файла в манифесте - интерфейс рисует заглушку (рамка стихии + руна).
(function (AD) {
  'use strict';

  var available = {};

  function setManifest(list) {
    available = {};
    (list || []).forEach(function (a) { available[a] = true; });
  }

  function url(art) {
    return art && available[art] ? 'assets/' + art + '.webp' : null;
  }

  function preload(arts) {
    return Promise.all(arts.filter(url).map(function (a) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = img.onerror = resolve;
        img.src = url(a);
      });
    }));
  }

  AD.Assets = { setManifest: setManifest, url: url, preload: preload };
})(window.AD = window.AD || {});
