// Редактор колоды: слева коллекция с фильтрами, справа колода. Изменения применяются по "Сохранить".
(function (AD) {
  'use strict';

  var stage = null, cfg = null, run = null, done = null, open_ = false;
  var st = { deck: [], type: 'all', cost: 'all', error: '' };

  var COSTS = [['all', 'Все'], ['0-1', '0-1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5+', '5+']];
  var TYPES = [['all', 'Все'], ['creature', 'Существа'], ['sorcery', 'Колдовство'], ['enchantment', 'Чары']];

  function B() { return AD.Battle; }
  function C() { return AD.Campaign; }
  function def(id) { return AD.Engine.cardDef(id); }

  function costOk(c) {
    if (st.cost === 'all') return true;
    if (st.cost === '0-1') return c <= 1;
    if (st.cost === '5+') return c >= 5;
    return c === Number(st.cost);
  }

  function unique(list) {
    var seen = {}, out = [];
    list.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    return out.sort(function (a, b) { return def(a).cost - def(b).cost || def(a).name.localeCompare(def(b).name); });
  }

  function row(id, count, max, attr, dim) {
    var d = def(id);
    return '<button class="deck-row el-' + d.element + (dim ? ' dim' : '') + '" ' + attr + '="' + id + '" data-peek="' + id + '">' +
      '<span class="gem">' + d.cost + '</span><span class="row-name">' + B().esc(d.name) + '</span>' +
      '<span class="row-type">' + B().TYPE_NAMES[d.type] + '</span>' +
      '<span class="row-count">x' + count + (max != null ? '/' + max : '') + '</span></button>';
  }

  function render() {
    stage.className = 'stage screen screen-deck';
    var p = cfg.progression;
    var coll = unique(run.collection).filter(function (id) {
      var d = def(id);
      return (st.type === 'all' || d.type === st.type) && costOk(d.cost);
    });
    var left = coll.map(function (id) {
      var have = C().copies(run.collection, id), used = C().copies(st.deck, id);
      return row(id, have - used, have, 'data-add', used >= have || used >= p.maxCopies);
    }).join('');
    var right = unique(st.deck).map(function (id) { return row(id, C().copies(st.deck, id), null, 'data-remove'); }).join('');
    var filters = '<div class="filters"><div>' + TYPES.map(function (t) {
      return '<button class="chip' + (st.type === t[0] ? ' on' : '') + '" data-type="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div><div>Стоимость: ' + COSTS.map(function (c) {
      return '<button class="chip' + (st.cost === c[0] ? ' on' : '') + '" data-cost="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div></div>';
    var err = C().validateDeck(run, st.deck);
    stage.innerHTML = '<div class="deck-editor">' +
      '<section class="coll"><h2>Коллекция</h2>' + filters + '<div class="rows">' + (left || '<p class="muted">Нет карт под фильтр.</p>') + '</div></section>' +
      '<section class="deck"><h2>Колода (' + st.deck.length + ' / ' + p.deckMin + '-' + p.deckMax + ')</h2>' +
      '<div class="rows">' + right + '</div>' +
      '<p class="' + (err ? 'warn' : 'muted') + '">' + B().esc(err || 'Колода готова. Не больше ' + p.maxCopies + ' копий одной карты.') + '</p>' +
      '<div class="row-buttons"><button class="ghost" data-dact="cancel">Отмена</button>' +
      '<button class="end-turn" data-dact="save"' + (err ? ' disabled' : '') + '>Сохранить</button></div></section>' +
      '<div class="peek deck-peek"></div></div>';
  }

  function onClick(ev) {
    if (!open_) return;
    var t = ev.target.closest('[data-add],[data-remove],[data-type],[data-cost],[data-dact]');
    if (!t) return;
    var d = t.dataset;
    if (d.add) {
      if (C().copies(st.deck, d.add) < Math.min(C().copies(run.collection, d.add), cfg.progression.maxCopies) &&
          st.deck.length < cfg.progression.deckMax) st.deck.push(d.add);
    } else if (d.remove) {
      st.deck.splice(st.deck.indexOf(d.remove), 1);
    } else if (d.type) {
      st.type = d.type;
    } else if (d.cost) {
      st.cost = d.cost;
    } else if (d.dact === 'save') {
      if (C().setDeck(run, st.deck)) return;
      close();
      return;
    } else if (d.dact === 'cancel') {
      close();
      return;
    }
    render();
  }

  function onOver(ev) {
    if (!open_) return;
    var t = ev.target.closest('[data-peek]'), peek = stage.querySelector('.deck-peek');
    if (!peek) return;
    peek.innerHTML = t ? B().cardFull(def(t.dataset.peek), 'big') + B().keywordHelpFor(def(t.dataset.peek)) : '';
    B().fitCards(peek);
  }

  function close() {
    open_ = false;
    if (done) done();
  }

  var bound = false;

  function open(stageEl, config, r, onDone) {
    stage = stageEl;
    cfg = config;
    run = r;
    done = onDone;
    st = { deck: run.deck.slice(), type: 'all', cost: 'all' };
    open_ = true;
    if (!bound) {
      stage.addEventListener('click', onClick);
      stage.addEventListener('mouseover', onOver);
      bound = true;
    }
    render();
  }

  AD.DeckEditor = { open: open, active: function () { return open_; }, relayout: function () { if (open_) render(); } };
})(window.AD = window.AD || {});
