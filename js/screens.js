// Экраны вне боя: меню, выбор фракции, карта кампании, награда, святилище, финал.
(function (AD) {
  'use strict';

  var cfg = null, stage = null, run = null, scale = 1;
  var view = { name: 'menu', selected: null, faction: 'chaos', difficulty: 1, message: '' };

  var NODE_ICONS = {
    start: 'M6 21V4M6 4h11l-2 4 2 4H6',
    battle: 'M4 4l10 10M20 4L10 14M5 17l-1 3 3-1M19 17l1 3-3-1',
    reward: 'M4 10h16v9H4zM4 10l2-5h12l2 5M12 10v5',
    event: 'M12 3l2.5 6H21l-5 4 2 7-6-4-6 4 2-7-5-4h6.5z',
    gate: 'M3 18h18l-2-10-5 5-2-7-2 7-5-5z'
  };
  var NODE_NAMES = { start: 'Начало', battle: 'Бой', reward: 'Тайник', event: 'Святилище', gate: 'Рубеж' };

  function B() { return AD.Battle; }
  function C() { return AD.Campaign; }
  function esc(s) { return B().esc(s); }
  function svg(p, c) { return B().svg(p, c); }

  // ---------- Масштаб сцены 1280×800 ----------

  function fit() {
    scale = Math.min(window.innerWidth / 1280, window.innerHeight / 800);
    stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    B().setScale(scale);
  }

  function show(name, extra) {
    view.name = name;
    for (var k in extra || {}) view[k] = extra[k];
    render();
  }

  function render() {
    if (B().active()) return;
    stage.className = 'stage screen screen-' + view.name;
    var html = {
      menu: menuHtml, newgame: newGameHtml, map: mapHtml, reward: rewardHtml, event: eventHtml, done: doneHtml
    }[view.name];
    stage.innerHTML = html ? html() : '';
    B().fitCards(stage);
  }

  function save() { if (run) AD.Save.save(run); }

  // ---------- Меню ----------

  function menuHtml() {
    var saved = AD.Save.load();
    var canContinue = saved && !saved.done && saved.version === 1;
    return '<div class="menu">' +
      '<h1 class="title">Ави-Дем</h1><p class="subtitle">Пошаговая карточная дуэль в мире раскола эфира</p>' +
      '<div class="menu-buttons">' +
      (canContinue ? '<button class="end-turn" data-act="continue">Продолжить кампанию</button>' : '') +
      '<button class="end-turn" data-act="newgame">Новая кампания</button>' +
      '<button class="ghost wide" data-act="quick">Быстрый бой</button>' +
      '</div>' +
      (canContinue ? '<p class="muted">' + esc(cfg.races[saved.element].name) + ', глава ' + (saved.chapter + 1) + ', уровень ' + saved.level + '</p>' : '') +
      '</div>';
  }

  // ---------- Новая кампания ----------

  function newGameHtml() {
    var factions = Object.keys(cfg.races).map(function (el) {
      var r = cfg.races[el];
      return '<button class="faction el-' + el + (view.faction === el ? ' selected' : '') + '" data-faction="' + el + '">' +
        '<div class="portrait big el-' + el + '">' + svg(B().RUNES[el], 'rune') + '</div>' +
        '<h3>' + esc(r.name) + '</h3><div class="muted">Лидер: ' + esc(r.hero) + '</div>' +
        '<div class="el-tag">' + B().ELEMENT_NAMES[el] + '</div>' +
        '<p>' + esc(r.text) + '</p></button>';
    }).join('');
    var diffs = C().DIFFICULTY.map(function (d, i) {
      return '<button class="diff' + (view.difficulty === i ? ' selected' : '') + '" data-diff="' + i + '">' + d + '</button>';
    }).join('');
    return '<div class="newgame"><h2 class="screen-title">Выберите фракцию</h2>' +
      '<div class="factions">' + factions + '</div>' +
      '<div class="diffs"><span>Сложность:</span>' + diffs + '</div>' +
      '<p class="muted center">Сложность меняет здоровье, колоды и навыки врагов, как в оригинале.</p>' +
      '<div class="row-buttons"><button class="ghost" data-act="menu">Назад</button>' +
      '<button class="end-turn" data-act="start">Начать кампанию</button></div></div>';
  }

  // ---------- Карта кампании ----------

  function heroBar() {
    var r = cfg.races[run.element], pr = C().xpProgress(run);
    var skills = Object.keys(run.skills).map(function (k) {
      return '<span class="skill">' + esc(C().SKILLS[k].name) + ' ' + run.skills[k] + '</span>';
    }).join('');
    return '<div class="hero-bar"><div class="portrait el-' + run.element + '">' + svg(B().RUNES[run.element], 'rune') + '</div>' +
      '<div><div class="hero-name">' + esc(run.heroName) + ' <small>' + esc(r.name) + '</small></div>' +
      '<div class="xp"><span>Уровень ' + run.level + '</span><div class="xp-bar"><i style="width:' +
      Math.round(100 * pr[0] / pr[1]) + '%"></i></div><span class="muted">' + pr[0] + ' / ' + pr[1] + ' опыта</span></div>' +
      '<div class="skills">' + skills + '<span class="muted">Здоровье в бою: ' + heroHpNow() + '</span></div></div></div>';
  }

  function heroHpNow() {
    var hp = AD.Engine.heroHp(run.level);
    if (run.skills.HEAL) hp = Math.round(hp * (1 + 0.1 * run.skills.HEAL));
    return hp;
  }

  function nodeState(n) {
    if (run.cleared[n.id]) return 'cleared';
    if (C().isAvailable(run, n.id)) return 'available';
    return 'locked';
  }

  function mapHtml() {
    var ch = C().chapter(run), W = 1240, H = 470;
    var pos = {};
    ch.nodes.forEach(function (n) { pos[n.id] = { x: 30 + n.x * (W - 60), y: 20 + n.y * (H - 40) }; });
    var lines = ch.edges.map(function (e) {
      var a = pos[e[0]], b = pos[e[1]];
      var done = run.cleared[e[0]] && run.cleared[e[1]];
      return '<line class="' + (done ? 'done' : '') + '" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
    }).join('');
    var nodes = ch.nodes.map(function (n) {
      var st = nodeState(n), p = pos[n.id];
      var m = n.monster ? C().monster(n.monster) : null;
      return '<button class="node ' + n.type + ' ' + st + (view.selected === n.id ? ' selected' : '') +
        (m ? ' el-' + m.element : '') + '" data-node="' + n.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px">' +
        svg(NODE_ICONS[n.type], 'node-ico') + (m ? '<span class="node-lv">' + m.level + '</span>' : '') +
        '<span class="node-label">' + esc(m ? m.name : NODE_NAMES[n.type]) + '</span></button>';
    }).join('');
    return '<div class="map-screen">' +
      '<header class="map-head"><div><div class="muted">Глава ' + (run.chapter + 1) + ' из ' + cfg.campaign.chapters.length +
      ' · ' + C().DIFFICULTY[run.difficulty] + '</div><h2>' + esc(ch.name) + '</h2><p class="muted">' + esc(ch.text) + '</p></div>' +
      heroBar() + '</header>' +
      '<div class="map"><svg class="map-lines" viewBox="0 0 ' + W + ' ' + H + '">' + lines + '</svg>' + nodes + '</div>' +
      '<footer class="map-foot">' + nodeInfo() +
      '<div class="foot-buttons"><button class="ghost" data-act="deck">Колода (' + run.deck.length + ')</button>' +
      '<button class="ghost" data-act="menu">Меню</button></div></footer>' +
      (view.message ? '<div class="toast">' + esc(view.message) + '</div>' : '') +
      '</div>';
  }

  function nodeInfo() {
    var n = view.selected ? C().node(run, view.selected) : null;
    if (!n) return '<div class="node-info muted">Выберите узел на карте. Доступны узлы рядом с пройденными. ' +
      'Если зачистить всю главу, к рубежу вы придёте ровно уровнем стража.</div>';
    var st = nodeState(n), body = '', btn = '';
    if (n.monster) {
      var m = C().monster(n.monster), v = m.variants[run.difficulty] || m.variants[0];
      body = '<b>' + esc(m.name) + '</b> · ' + B().ELEMENT_NAMES[m.element] + ' · уровень ' + m.level +
        ' · здоровье ' + v.hp + ' · опыт +' + C().xpForMonster(m.level) +
        (n.type === 'gate' ? '<br><span class="warn">Страж рубежа: усиливается особыми силами. Победа открывает следующую главу.</span>' : '') +
        (m.level > run.level ? '<br><span class="warn">Враг сильнее вас по уровню.</span>' : '');
      if (st === 'available') btn = '<button class="end-turn" data-act="fight">В бой</button>';
    } else if (n.type === 'reward') {
      body = '<b>Тайник</b> · выбор одной из трёх редких карт вашей фракции.';
      if (st === 'available') btn = '<button class="end-turn" data-act="visit">Открыть</button>';
    } else if (n.type === 'event') {
      body = '<b>Святилище</b> · выбор усиления героя.';
      if (st === 'available') btn = '<button class="end-turn" data-act="visit">Войти</button>';
    } else {
      body = 'Начало главы.';
    }
    if (st === 'cleared') body += '<br><span class="muted">Пройдено.</span>';
    if (st === 'locked') body += '<br><span class="muted">Пока недоступно.</span>';
    return '<div class="node-info">' + body + '</div>' + btn;
  }

  // ---------- Награда и святилище ----------

  function rewardHtml() {
    var p = run.pending;
    var cards = p.cards.map(function (id) {
      var def = AD.Engine.cardDef(id);
      return '<div class="pick">' + B().cardFull(def, 'big') +
        '<div class="muted center">В коллекции: ' + C().copies(run.collection, id) + '</div>' +
        '<button class="end-turn" data-pick="' + id + '">Выбрать</button></div>';
    }).join('');
    var head = p.xpGain ? '<p class="muted center">Опыт +' + p.xpGain + (p.levelUp ? ' · <span class="gold">Новый уровень: ' + p.levelUp + '</span>' : '') + '</p>' : '';
    return '<div class="reward"><h2 class="screen-title">' + (p.xpGain ? 'Победа! Выберите карту' : 'Тайник: выберите карту') + '</h2>' + head +
      '<div class="picks">' + cards + '</div>' +
      '<div class="row-buttons"><button class="ghost" data-pick="">Пропустить</button></div></div>';
  }

  function eventHtml() {
    var p = run.pending;
    var opts = p.skills.map(function (k) {
      var s = C().SKILLS[k];
      return '<button class="skill-pick" data-pick="' + k + '"><h3>' + esc(s.name) + '</h3><p>' + esc(s.text) + '</p>' +
        '<span class="muted">Уровень навыка: ' + (run.skills[k] || 0) + ' → ' + ((run.skills[k] || 0) + 1) + '</span></button>';
    }).join('');
    return '<div class="reward"><h2 class="screen-title">Святилище</h2>' +
      '<p class="muted center">Эфир святилища готов усилить героя. Выберите одно.</p>' +
      '<div class="picks">' + (opts || '<p class="muted">Все навыки на максимуме.</p>') + '</div>' +
      '<div class="row-buttons"><button class="ghost" data-pick="">Уйти</button></div></div>';
  }

  function doneHtml() {
    return '<div class="menu"><h1 class="title">Кампания пройдена</h1>' +
      '<p class="subtitle">' + esc(run.heroName) + ' · уровень ' + run.level + ' · побед ' + run.stats.wins + ', поражений ' + run.stats.losses + '</p>' +
      '<div class="menu-buttons"><button class="end-turn" data-act="menu">В меню</button></div></div>';
  }

  // ---------- Бой ----------

  function startFight(nodeId) {
    var setup = C().battleSetup(run, nodeId);
    B().start(stage, cfg, setup, function (winner) {
      var won = winner === 0;
      C().battleResult(run, nodeId, won);
      save();
      if (won) show('reward');
      else show('map', { message: 'Поражение. Можно перестроить колоду и попробовать снова.' });
    });
  }

  function quickBattle() {
    var els = Object.keys(cfg.races);
    var el = els[Math.floor(Math.random() * els.length)];
    var mids = Object.keys(cfg.monsters).filter(function (k) { return cfg.monsters[k].level === 5; });
    var m = cfg.monsters[mids[Math.floor(Math.random() * mids.length)]], v = m.variants[1];
    B().start(stage, cfg, {
      seed: Date.now(),
      players: [
        { name: cfg.races[el].hero, element: el, level: 5, deck: cfg.races[el].starter.slice(), art: 'heroes/' + cfg.races[el].faction },
        { name: m.name, element: m.element, level: m.level, hp: v.hp, deck: v.deck.slice(), skills: v.skills,
          art: m.avatar ? AD.Engine.cardDef(m.avatar).art : null }
      ]
    }, function () { show('menu'); });
  }

  // ---------- Ввод ----------

  function onClick(ev) {
    if (B().active() || AD.DeckEditor && AD.DeckEditor.active()) return;
    var t = ev.target.closest('[data-act],[data-faction],[data-diff],[data-node],[data-pick]');
    if (!t) return;
    var d = t.dataset;
    if (d.faction) { view.faction = d.faction; render(); return; }
    if (d.diff) { view.difficulty = Number(d.diff); render(); return; }
    if (d.node) { view.selected = d.node; view.message = ''; render(); return; }
    if (d.pick !== undefined) {
      C().resolvePending(run, d.pick || null);
      save();
      show(run.done ? 'done' : 'map', { selected: null, message: '' });
      return;
    }
    switch (d.act) {
      case 'menu': show('menu'); break;
      case 'newgame': show('newgame'); break;
      case 'quick': quickBattle(); break;
      case 'continue':
        run = AD.Save.load();
        show(run.pending ? run.pending.type : 'map', { selected: null, message: '' });
        break;
      case 'start':
        run = C().newRun(view.faction, view.difficulty);
        save();
        show('map', { selected: 'b1', message: '' });
        break;
      case 'fight': startFight(view.selected); break;
      case 'visit':
        if (C().visit(run, view.selected)) { save(); show(run.pending.type); }
        break;
      case 'deck':
        AD.DeckEditor.open(stage, cfg, run, function () { save(); show('map'); });
        break;
    }
  }

  function start(config) {
    cfg = config;
    B().setConfig(cfg);
    C().setData({ cards: cfg.cards, races: cfg.races, monsters: cfg.monsters, campaign: cfg.campaign, progression: cfg.progression });
    var app = document.getElementById('app');
    app.innerHTML = '<div class="stage screen"></div>';
    stage = app.firstChild;
    stage.addEventListener('click', onClick);
    window.addEventListener('resize', fit);
    fit();
    show('menu');
  }

  AD.Screens = {
    start: start,
    scale: function () { return scale; },
    render: render,
    run: function () { return run; }
  };
})(window.AD = window.AD || {});
