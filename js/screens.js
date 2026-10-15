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

  // ---------- Масштаб сцены ----------
  // Окно шире высоты - сцена 1280×800. Окно выше ширины (телефон) - вертикальная сцена шириной 450 на всю высоту.
  // Телефон, повёрнутый горизонтально, просят вернуть вертикально.

  var PORTRAIT_W = 450, mode = '';

  function fit() {
    var app = document.getElementById('app'), w = app.clientWidth || window.innerWidth, h = app.clientHeight || window.innerHeight, body = document.body;
    var portrait = w < h;
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    body.classList.toggle('vert', portrait);
    body.classList.toggle('rotate', !portrait && touch && h < 560);
    if (portrait) {
      scale = w / PORTRAIT_W;
      stage.style.width = PORTRAIT_W + 'px';
      stage.style.height = Math.max(760, Math.round(h / scale)) + 'px';
    } else {
      scale = Math.min(w / 1280, h / 800);
      stage.style.width = '';
      stage.style.height = '';
    }
    stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    B().setScale(scale);
    var m = portrait ? 'portrait' : 'wide';
    if (mode && m !== mode) {
      if (B().active()) B().relayout();
      else if (AD.DeckEditor && AD.DeckEditor.active()) AD.DeckEditor.relayout && AD.DeckEditor.relayout();
      else render();
    }
    mode = m;
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
      '<p class="muted center">Враги всегда вашего уровня. Сложность меняет их здоровье: от 80% вашего до 150%, на "Обычной" - как у вас.</p>' +
      '<div class="row-buttons"><button class="ghost" data-act="menu">Назад</button>' +
      '<button class="end-turn" data-act="start">Начать кампанию</button></div></div>';
  }

  // ---------- Карта кампании ----------

  function heroBar() {
    var r = cfg.races[run.element], pr = C().xpProgress(run);
    var skills = Object.keys(run.skills).map(function (k) {
      return '<span class="skill">' + esc(C().SKILLS[k].name) + ' ' + run.skills[k] + '</span>';
    }).join('');
    return '<div class="hero-bar">' + B().artHtml({ art: 'heroes/' + r.faction, element: run.element }, 'portrait el-' + run.element) +
      '<div><div class="hero-name">' + esc(run.heroName) + ' <small>' + esc(r.name) + '</small></div>' +
      '<div class="xp"><span>Уровень ' + run.level + '</span><div class="xp-bar"><i style="width:' +
      Math.round(100 * pr[0] / pr[1]) + '%"></i></div><span class="muted">' + pr[0] + ' / ' + pr[1] + ' опыта</span></div>' +
      '<div class="skills">' + skills + '<span class="muted">Здоровье в бою: ' + heroHpNow() + '</span></div></div></div>';
  }

  function heroHpNow() {
    return C().heroHp(run);
  }

  function nodeState(n) {
    if (run.cleared[n.id]) return 'cleared';
    if (C().isAvailable(run, n.id)) return 'available';
    return 'locked';
  }

  function mapHtml() {
    var ch = C().chapter(run), W = 1240, H = 470;
    var vert = document.body.classList.contains('vert');
    if (vert) { W = 410; H = Math.max(360, stage.offsetHeight - 330); }
    // Узел начала не рисуем: он нужен только логике доступности. Остальные растягиваем на всю ширину
    var shown = ch.nodes.filter(function (n) { return n.type !== 'start'; });
    var xs = shown.map(function (n) { return n.x; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var pos = {};
    shown.forEach(function (n) {
      var t = (n.x - x0) / ((x1 - x0) || 1);
      // вертикально: путь снизу вверх, ветки - по ширине
      pos[n.id] = vert ? { x: Math.round(50 + n.y * (W - 100)), y: Math.round(H - 50 - t * (H - 100)) }
        : { x: Math.round(90 + t * (W - 180)), y: Math.round(20 + n.y * (H - 40)) };
    });
    // Тропы - пологие дуги: изгиб поперёк отрезка, направление чередуется
    var lines = ch.edges.filter(function (e) { return pos[e[0]] && pos[e[1]]; }).map(function (e, i) {
      var a = pos[e[0]], b = pos[e[1]];
      var done = run.cleared[e[0]] && run.cleared[e[1]];
      var k = (i % 2 ? 0.12 : -0.12), cx = (a.x + b.x) / 2 - (b.y - a.y) * k, cy = (a.y + b.y) / 2 + (b.x - a.x) * k;
      return '<path class="' + (done ? 'done' : '') + '" d="M' + a.x + ' ' + a.y + 'Q' + Math.round(cx) + ' ' + Math.round(cy) +
        ' ' + b.x + ' ' + b.y + '"/>';
    }).join('');
    var mapArt = AD.Assets.url('maps/ch' + (run.chapter + 1));
    var dots = cfg.campaign.chapters.map(function (c, i) {
      return '<i class="' + (i < run.chapter ? 'done' : i === run.chapter ? 'now' : '') + '"></i>';
    }).join('');
    var nodes = shown.map(function (n) {
      var st = nodeState(n), p = pos[n.id];
      var m = n.monster ? C().monster(n.monster) : null;
      return '<button class="node ' + n.type + ' ' + st + (view.selected === n.id ? ' selected' : '') +
        (m ? ' el-' + m.element : '') + '" data-node="' + n.id + '" style="left:' + p.x + 'px;top:' + p.y + 'px">' +
        svg(NODE_ICONS[n.type], 'node-ico') + (m ? '<span class="node-lv">' + C().monsterLevel(run, n) + '</span>' : '') +
        '<span class="node-label">' + esc(m ? m.name : NODE_NAMES[n.type]) + '</span></button>';
    }).join('');
    return '<div class="map-screen">' +
      '<header class="map-head"><div><div class="muted"><span class="ch-dots">' + dots + '</span>Глава ' + (run.chapter + 1) +
      ' из ' + cfg.campaign.chapters.length + ' · ' + C().DIFFICULTY[run.difficulty] + '</div><h2>' + esc(ch.name) + '</h2>' +
      '<p class="muted">' + esc(ch.text) + '</p></div>' + heroBar() + '</header>' +
      '<div class="map"' + (mapArt || vert ? ' style="' + (mapArt ? 'background-image:url(' + mapArt + ');' : '') + (vert ? 'height:' + H + 'px' : '') + '"' : '') + '>' +
      '<svg class="map-lines" viewBox="0 0 ' + W + ' ' + H + '">' + lines + '</svg>' + nodes + '</div>' +
      '<footer class="map-foot">' + nodeInfo() +
      '<div class="foot-buttons"><button class="ghost" data-act="deck">Колода (' + run.deck.length + ')</button>' +
      '<button class="ghost" data-act="menu">Меню</button></div></footer>' +
      (view.message ? '<div class="toast">' + esc(view.message) + '</div>' : '') +
      '</div>';
  }

  function nodeInfo() {
    var n = view.selected ? C().node(run, view.selected) : null;
    if (!n) return '<div class="node-info muted">Выберите узел на карте. Доступны узлы рядом с пройденными. ' +
      'Враги и страж рубежа всегда вашего уровня и с вашим здоровьем. Финальный страж - всегда 12 уровня.</div>';
    var st = nodeState(n), body = '', btn = '';
    if (n.monster) {
      var m = C().monster(n.monster), lv = C().monsterLevel(run, n);
      body = '<h3>' + esc(m.name) + '</h3>' + B().ELEMENT_NAMES[m.element] + ' · уровень ' + lv +
        ' · здоровье ' + C().monsterHp(run, n) + ' · опыт +' + C().xpForMonster(lv) +
        (n.type === 'gate' ? '<br><span class="warn">Страж рубежа: усиливается особыми силами. Победа открывает следующую главу.</span>' : '');
      if (st === 'available') btn = '<button class="end-turn" data-act="fight">В бой</button>';
    } else if (n.type === 'reward') {
      body = '<h3>Тайник</h3>Выбор одной из трёх редких карт вашей фракции.';
      if (st === 'available') btn = '<button class="end-turn" data-act="visit">Открыть</button>';
    } else if (n.type === 'event') {
      body = '<h3>Святилище</h3>Выбор усиления героя.';
      if (st === 'available') btn = '<button class="end-turn" data-act="visit">Войти</button>';
    } else {
      body = '<h3>Начало</h3>Отсюда начинается глава.';
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
