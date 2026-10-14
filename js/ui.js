// Экран боя: отрисовка состояния движка и ввод игрока. Игрок - всегда игрок 0.
// AD.Battle.start(stage, cfg, setup, onEnd) - setup для AD.Engine.create, onEnd(winner) после боя.
(function (AD) {
  'use strict';

  var ME = 0, FOE = 1;
  var AI_DELAY = 750;
  var BLOCK_SHOW = 900;

  var ELEMENT_NAMES = { chaos: 'Хаос', life: 'Жизнь', movement: 'Движение', synthesis: 'Синтез', white: 'Иное', neutral: 'Иное' };
  var TYPE_NAMES = { creature: 'Существо', sorcery: 'Колдовство', enchantment: 'Чары' };
  var PHASES = ['Начало', 'Розыгрыш', 'Атака', 'Блок', 'Конец'];
  var GRAVE_SPECS = { graveCreature: 1, anyGraveCreature: 1 };

  // Руны стихий и иконки (SVG-пути, вид 24×24)
  var RUNES = {
    chaos: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 1 2 2 3 0-3 0-5 1-7z',
    life: 'M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l8-8',
    movement: 'M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0',
    synthesis: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 9v6',
    white: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 8v8M8 12h8',
    neutral: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z'
  };
  var ICONS = {
    shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
    swords: 'M4 4l10 10M20 4L10 14M5 17l-1 3 3-1M19 17l1 3-3-1',
    moon: 'M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z',
    drop: 'M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z',
    deck: 'M6 5h12v14H6zM9 9h6M9 13h6',
    grave: 'M7 20V10a5 5 0 0 1 10 0v10zM12 11v5M10 13h4',
    spark: 'M13 2L5 13h6l-1 9 8-11h-6z',
    cracks: 'M4 6l5 4-2 4 5 3M20 5l-5 5 2 3-4 3M12 3v4'
  };

  var S = null, cfg = null, stage = null, onEnd = null;
  var ui = freshUi();

  function freshUi() {
    return {
      sel: null,          // { kind: 'play'|'act', uid, idx, spec, filter, x, xCost, needSac, sac, notSac, step }
      attackers: [],      // выбранные атакующие (uid по порядку)
      blocks: {},         // мои блоки: uidАтакующего -> uidБлокирующего
      blockPick: null,    // выбранный мой блокер
      pendingBlocks: null,// блоки ИИ, показываемые перед схваткой
      graveView: null,    // просмотр могильника игрока
      busy: false,
      outcome: [],
      flash: '',
      openTurns: {},
      aiTurn: 0,
      aiCount: 0,
      logOpen: loadLogPref(),
      scale: 1
    };
  }

  // Открыт ли журнал боя: выбор игрока хранится в браузере, по умолчанию закрыт
  function loadLogPref() {
    try { return window.localStorage.getItem('avi-dem-log') === '1'; } catch (e) { return false; }
  }

  function saveLogPref(open) {
    try { window.localStorage.setItem('avi-dem-log', open ? '1' : '0'); } catch (e) { /* без запоминания */ }
  }

  // ---------- Мелочи ----------

  function E() { return AD.Engine; }
  function Ef() { return AD.Effects; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function svg(path, cls) {
    return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  function canIAct() { return !ui.busy && S.phase !== 'over' && E().canAct(S, ME); }
  function myMain() { return !ui.busy && S.phase === 'main' && S.active === ME; }
  function myBlock() { return !ui.busy && S.phase === 'block' && S.active === FOE; }

  function keywordNames(list) {
    return (list || []).map(function (k) {
      var p = k.split(':'), kw = cfg.keywords[p[0]];
      return (kw ? kw.name : p[0]) + (p[1] ? ' ' + p[1] : '');
    });
  }

  function artHtml(def, cls) {
    var url = AD.Assets.url(def.art);
    if (url) {
      var f = def.focus || [0.5, 0.5];
      return '<div class="art ' + cls + '" style="background-image:url(' + url + ');background-position:' +
        (f[0] * 100) + '% ' + (f[1] * 100) + '%"></div>';
    }
    return '<div class="art ph ' + cls + '">' + svg(RUNES[def.element] || RUNES.neutral, 'rune') + '</div>';
  }

  // ---------- Карта: полный вид ----------

  function typeLine(def) {
    var t = TYPE_NAMES[def.type] || def.type;
    if (def.type === 'creature' && def.race && cfg.tribes[def.race]) t += ' · ' + cfg.tribes[def.race];
    if (def.type === 'enchantment') t += def.attach === 'hero' ? ' · на героя' : ' · на существо';
    return t + ' · ' + (ELEMENT_NAMES[def.element] || '');
  }

  // Полная карта. cost - показываемая стоимость (с учётом скидок), по умолчанию из данных
  function cardFull(def, extra, attrs, cost) {
    var kws = keywordNames(def.keywords);
    var text = (kws.length ? '<b>' + esc(kws.join(', ')) + '.</b> ' : '') + esc(def.text || '');
    var c = cost == null ? def.cost : cost;
    return '<div class="card full el-' + def.element + ' fac-' + (def.faction || 'neutral') + ' ' + (extra || '') + '" ' + (attrs || '') + '>' +
      artHtml(def, 'card-art') +
      '<div class="cost' + (c !== def.cost ? ' changed' : '') + '">' + c + (def.xCost ? '<small>+X</small>' : '') + '</div>' +
      '<div class="card-name"><span>' + esc(def.name) + '</span></div>' +
      '<div class="card-type">' + esc(typeLine(def)) + '</div>' +
      '<div class="card-text">' + text + '</div>' +
      (def.type === 'creature' ? '<div class="stat atk">' + def.atk + '</div><div class="stat hp">' + def.hp + '</div>' : '') +
      '</div>';
  }

  // ---------- Выбор целей ----------

  function selCtx() {
    var sac = ui.sel && ui.sel.sac ? E().findUnit(S, ui.sel.sac) : null;
    var snap = sac ? { cost: E().cardDef(sac.id).cost, atk: E().stats(S, sac).atk, hp: E().stats(S, sac).hp } : null;
    return { controller: ME, x: ui.sel ? ui.sel.x : 0, sac: snap };
  }

  function targetRefs() {
    var s = ui.sel;
    if (!s) return [];
    if (s.step === 'sac') {
      return S.players[ME].field.filter(function (u) { return u.uid !== s.notSac; })
        .map(function (u) { return { kind: 'unit', uid: u.uid }; });
    }
    if (s.step !== 'target') return [];
    return Ef().listTargets(S, ME, s.spec, s.filter, selCtx()).filter(function (r) {
      return !(r.kind === 'unit' && r.uid === s.sac);
    });
  }

  function isTarget(ref) {
    return targetRefs().some(function (r) { return Ef().sameRef(r, ref); });
  }

  function currentBlocks() {
    if (ui.pendingBlocks) return ui.pendingBlocks;
    if (S.phase === 'block' && S.active === FOE) return ui.blocks;
    return {};
  }

  // ---------- Чары (значки) ----------

  function abilityIndex(def) {
    for (var i = 0; i < def.abilities.length; i++) if (def.abilities[i].trigger === 'activated' && !def.abilities[i].linked) return i;
    return -1;
  }

  function enchChip(e, hostOwner) {
    var def = E().cardDef(e.id);
    var cls = ['ench', 'el-' + def.element];
    if (isTarget({ kind: 'ench', uid: e.uid })) cls.push('targetable');
    var ai = abilityIndex(def);
    if (e.owner === ME && ai >= 0 && canIAct() && E().canActivate(S, ME, e.uid, ai).ok) cls.push('usable');
    if (def.release && hostOwner === ME && myMain()) cls.push('releasable');
    if (e.owner !== hostOwner) cls.push('hostile');
    return '<button class="' + cls.join(' ') + '" data-ench="' + e.uid + '" title="' + esc(def.text) + '">' + esc(def.name) + '</button>';
  }

  // ---------- Жетон существа ----------

  function token(u) {
    var def = E().cardDef(u.id), st = E().stats(S, u), left = st.hp - u.damage;
    var attackList = S.combat ? S.combat.attackers : ui.attackers;
    var order = attackList.indexOf(u.uid);
    var blocks = currentBlocks(), blocking = false;
    for (var k in blocks) if (blocks[k] === u.uid) blocking = true;
    var cls = ['token', 'el-' + def.element, 'fac-' + (def.faction || 'neutral'), u.owner === ME ? 'mine' : 'foe'];
    if (order >= 0) cls.push('attacking');
    if (blocking) cls.push('blocking');
    if (u.damage > 0) cls.push('damaged');
    if (u.sick) cls.push('sick');
    if (u.rested) cls.push('rested');
    if (u.pale) cls.push('pale-aspect');
    if (isTarget({ kind: 'unit', uid: u.uid })) cls.push(ui.sel && ui.sel.step === 'sac' ? 'sacrificable' : 'targetable');
    if (ui.blockPick === u.uid) cls.push('picked');
    if (myMain() && !ui.sel && u.owner === ME && E().canAttack(S, u)) cls.push('ready');
    if (myBlock() && u.owner === FOE && order >= 0) cls.push('blockable');

    var ab = '';
    if (u.owner === ME && S.phase !== 'over') {
      def.abilities.forEach(function (a, idx) {
        if (a.trigger !== 'activated' || a.linked) return;
        var can = canIAct() && E().canActivate(S, ME, u.uid, idx).ok;
        ab += '<button class="tk-ab' + (can ? '' : ' off') + '" data-ab="' + u.uid + ':' + idx + '" title="' + esc(def.text) + '">' +
          svg(ICONS.spark) + '</button>';
      });
    }
    var atkMod = st.atk > (def.atk || 0) ? ' up' : (st.atk < (def.atk || 0) ? ' down' : '');
    return '<div class="' + cls.join(' ') + '" data-unit="' + u.uid + '">' +
      '<div class="tk-ring">' + artHtml(def, 'tk-art') +
      (u.damage > 0 ? svg(ICONS.cracks, 'cracks') : '') + '</div>' +
      '<div class="stat atk' + atkMod + '">' + st.atk + '</div>' +
      '<div class="stat hp' + (u.damage > 0 ? ' hurt' : '') + '">' + left + '</div>' +
      (order >= 0 ? '<div class="badge order">' + (order + 1) + '</div>' : '') +
      (blocking ? '<div class="badge shield">' + svg(ICONS.shield) + '</div>' : '') +
      (u.rested ? '<div class="badge rest" title="Отдыхает">' + svg(ICONS.moon) + '</div>' : '') +
      ab +
      '<div class="tk-name"><span>' + esc(def.name) + '</span></div>' +
      (u.enchants.length ? '<div class="tk-ench">' + u.enchants.map(function (e) { return enchChip(e, u.owner); }).join('') + '</div>' : '') +
      '</div>';
  }

  // ---------- Герой ----------

  function heroPanel(p) {
    var pl = S.players[p];
    var target = isTarget({ kind: 'hero', player: p }) ? ' targetable' : '';
    var ench = pl.enchants.map(function (e) { return enchChip(e, p); }).join('');
    return '<div class="hero ' + (p === ME ? 'mine' : 'foe') + target + (S.active === p ? ' active' : '') + '" data-hero="' + p + '">' +
      '<div class="portrait el-' + (pl.element || 'neutral') + '">' + portraitArt(pl) +
      '<div class="hero-hp">' + Math.max(0, pl.hp) + '</div></div>' +
      '<div class="hero-info">' +
      '<div class="hero-name">' + esc(pl.name) + ' <small>ур. ' + pl.level + '</small></div>' +
      '<div class="hero-stats">' +
      '<span class="ether" title="Эфир / каналы">' + svg(ICONS.drop) + pl.ether + '<small>/' + pl.channels + '</small></span>' +
      '<span title="Колода">' + svg(ICONS.deck) + pl.deck.length + '</span>' +
      '<button class="grave-btn" data-gravebtn="' + p + '" title="Могильник">' + svg(ICONS.grave) + pl.graveyard.length + '</button>' +
      '</div>' +
      (ench ? '<div class="enchants">' + ench + '</div>' : '') +
      '</div></div>';
  }

  // Портрет героя: арт лидера или карты-аватара монстра, иначе руна стихии
  function portraitArt(pl) {
    var url = pl.art && AD.Assets.url(pl.art);
    if (url) return '<div class="art portrait-art" style="background-image:url(' + url + ')"></div>';
    return svg(RUNES[pl.element] || RUNES.neutral, 'rune');
  }

  // ---------- Рука ----------

  function handHtml() {
    var p = S.players[ME], n = p.hand.length, cw = 118, width = ui.logOpen ? 520 : 790, gap = 16;
    if (n > 1 && n * cw + (n - 1) * gap > width) gap = (width - n * cw) / (n - 1);
    return p.hand.map(function (c, i) {
      var def = E().cardDef(c.id);
      var playable = canIAct() && E().canPlay(S, ME, c.uid, 1).ok;
      var cls = (playable ? 'playable' : 'unplayable') + (ui.sel && ui.sel.kind === 'play' && ui.sel.uid === c.uid ? ' selected' : '');
      var mid = (n - 1) / 2, off = i - mid;
      var style = 'style="' + (i > 0 ? 'margin-left:' + gap + 'px;' : '') + '--rot:' + (off * 2.5) + 'deg;--lift:' + Math.round(off * off * 1.5) + 'px"';
      return cardFull(def, cls, 'data-hand="' + c.uid + '" ' + style, E().cardCost(S, ME, def));
    }).join('');
  }

  function foeHand() {
    var n = S.players[FOE].hand.length, backs = '';
    for (var i = 0; i < Math.min(n, 8); i++) backs += '<div class="card-back"></div>';
    return '<div class="foe-hand">' + backs + '<span>' + n + '<small> в руке</small></span></div>';
  }

  // ---------- Полоса фаз, подсказка, кнопки ----------

  function currentPhase() {
    if (S.phase === 'over') return 'Конец';
    if (S.phase === 'block') return 'Блок';
    if (S.active === ME && ui.attackers.length) return 'Атака';
    return 'Розыгрыш';
  }

  function phaseStrip() {
    var cur = currentPhase();
    return '<div class="phases"><div class="emblem' + (S.active === ME ? ' mine' : '') + '">' + svg(ICONS.swords) + '</div>' +
      '<div class="turn-label">' + (S.active === ME ? 'Ваш ход' : 'Ход противника') + '</div>' +
      PHASES.map(function (ph) { return '<div class="phase' + (ph === cur ? ' current' : '') + '">' + ph + '</div>'; }).join('') +
      '<button class="ghost log-toggle' + (ui.logOpen ? ' on' : '') + '" data-btn="log">Журнал</button>' +
      '</div>';
  }

  function hint() {
    if (ui.flash) return '<span class="warn">' + esc(ui.flash) + '</span>';
    var s = ui.sel;
    if (s && s.step === 'sac') return 'Выберите своё существо для жертвы. Правый клик - отмена.';
    if (s && s.step === 'target') return (GRAVE_SPECS[s.spec] ? 'Выберите карту в могильнике.' : 'Выберите цель.') + ' Правый клик - отмена.';
    if (s && s.step === 'x') return 'Выберите X и нажмите "Применить".';
    if (myBlock()) {
      return ui.blockPick ? 'Теперь выберите атакующего, которого заблокировать.'
        : 'Защита: своё существо, затем атакующий. Можно применять способности. Готово - "Подтвердить блок".';
    }
    if (ui.outcome.length) return ui.outcome.map(esc).join(' · ');
    if (myMain()) return 'Разыгрывайте карты, выберите атакующих и нажмите кнопку справа.';
    return '';
  }

  function xBar() {
    var s = ui.sel;
    if (!s || !s.xCost) return '';
    return '<div class="xbar">X' + (s.xCost === 'life' ? ' (жизнь)' : '') + ' = <button data-btn="xminus">−</button><b>' + s.x +
      '</b><button data-btn="xplus">+</button>' +
      (s.step === 'x' ? '<button class="gold" data-btn="xok">Применить</button>' : '') +
      '<button data-btn="cancel">Отмена</button></div>';
  }

  function controls() {
    var main = '', extra = '';
    if (myMain()) {
      main = ui.attackers.length ? 'Атаковать (' + ui.attackers.length + ')' : 'Конец хода';
      var ready = S.players[ME].field.filter(function (u) { return E().canAttack(S, u); });
      if (ready.length && ready.length !== ui.attackers.length) extra = '<button class="ghost" data-btn="all">' + svg(ICONS.swords) + 'Все в атаку</button>';
      if (ui.attackers.length) extra += '<button class="ghost" data-btn="noattack">Сбросить</button>';
    } else if (myBlock()) {
      main = 'Подтвердить блок';
    }
    if (ui.sel) extra = '<button class="ghost" data-btn="cancel">Отмена</button>';
    return '<div class="controls">' + extra +
      '<button class="end-turn' + (main ? '' : ' wait') + '" data-btn="main"' + (main ? '' : ' disabled') + '>' +
      (main || (S.phase === 'over' ? 'Бой окончен' : 'Ход противника')) + '</button></div>';
  }

  // ---------- Журнал ----------

  function logHtml() {
    var groups = [], cur = null;
    S.log.forEach(function (l) {
      if (!cur || cur.turn !== l.turn) { cur = { turn: l.turn, lines: [] }; groups.push(cur); }
      cur.lines.push(l.text);
    });
    var last = groups.length ? groups[groups.length - 1].turn : 0;
    return '<aside class="log"><h2>Журнал боя</h2><div class="log-body">' +
      groups.map(function (g) {
        var open = g.turn === last || g.turn === last - 1 || ui.openTurns[g.turn];
        var head = g.turn === 0 ? 'Подготовка' : g.lines[0].replace(/\. Эфир.*$/, '');
        var lines = g.turn === 0 ? g.lines : g.lines.slice(1);
        return '<section class="log-turn' + (open ? ' open' : '') + '">' +
          '<button class="log-head" data-turn="' + g.turn + '">' + esc(head) + '</button>' +
          (open ? '<ul>' + lines.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
          '</section>';
      }).join('') + '</div></aside>';
  }

  // ---------- Могильник и итог ----------

  function gravePicker() {
    var s = ui.sel, refs = s && s.step === 'target' && GRAVE_SPECS[s.spec] ? targetRefs() : null;
    var view = ui.graveView;
    if (!refs && view == null) return '';
    var title, items;
    if (refs) {
      title = 'Выберите существо из могильника';
      items = refs.map(function (r) {
        var c = S.players[r.player].graveyard.filter(function (x) { return x.uid === r.uid; })[0];
        return cardFull(E().cardDef(c.id), 'pickable', 'data-grave="' + r.player + ':' + r.uid + '"');
      });
    } else {
      title = 'Могильник: ' + S.players[view].name;
      items = S.players[view].graveyard.map(function (c) { return cardFull(E().cardDef(c.id), ''); });
    }
    return '<div class="overlay soft"><div class="grave-panel"><h2>' + esc(title) + '</h2>' +
      '<div class="grave-list">' + (items.join('') || '<p class="muted">Пусто.</p>') + '</div>' +
      '<button class="ghost" data-btn="' + (refs ? 'cancel' : 'closegrave') + '">' + (refs ? 'Отмена' : 'Закрыть') + '</button></div></div>';
  }

  function overlay() {
    if (S.phase !== 'over') return '';
    var title = S.winner === 'draw' ? 'Ничья' : (S.winner === ME ? 'Победа' : 'Поражение');
    return '<div class="overlay"><div class="result ' + (S.winner === ME ? 'win' : 'lose') + '">' +
      '<h1>' + title + '</h1><p>Ходов: ' + S.turn + '</p>' +
      '<button class="end-turn" data-btn="finish">Продолжить</button></div></div>';
  }

  // ---------- Отрисовка ----------

  // Фон поля боя - пейзаж фракции противника, если картинка есть
  function boardArt() {
    var race = cfg.races && cfg.races[S.players[FOE].element];
    var url = AD.Assets.url('backgrounds/' + (race ? race.faction : 'neutral'));
    return url ? ' style="background-image: url(\'' + url + '\')"' : '';
  }

  function render() {
    var scroll = stage.querySelector('.log-body');
    var logAtBottom = !scroll || scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4;
    stage.classList.toggle('log-open', ui.logOpen);
    stage.innerHTML =
      '<div class="board"' + boardArt() + '>' +
      '<div class="hero-row foe-row">' + heroPanel(FOE) + foeHand() + '</div>' +
      '<div class="field foe-field">' + S.players[FOE].field.map(token).join('') + '</div>' +
      '<div class="midline">' + phaseStrip() + '<div class="hint">' + hint() + '</div></div>' +
      '<div class="field my-field">' + S.players[ME].field.map(token).join('') + '</div>' +
      '<div class="bottom-row">' + heroPanel(ME) + '<div class="hand">' + handHtml() + '</div>' + controls() + '</div>' +
      '</div>' +
      (ui.logOpen ? logHtml() : '') +
      '<svg class="lines"></svg>' + xBar() + '<div class="peek"></div>' + gravePicker() + overlay();
    var body = stage.querySelector('.log-body');
    if (body && logAtBottom) body.scrollTop = body.scrollHeight;
    drawLines();
  }

  function center(el) {
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - s.left) / ui.scale, y: (r.top + r.height / 2 - s.top) / ui.scale };
  }

  function drawLines() {
    var lines = stage.querySelector('.lines'), blocks = currentBlocks(), out = '';
    if (!lines) return;
    for (var a in blocks) {
      var ea = stage.querySelector('[data-unit="' + a + '"] .tk-ring');
      var eb = stage.querySelector('[data-unit="' + blocks[a] + '"] .tk-ring');
      if (!ea || !eb) continue;
      var p = center(ea), q = center(eb);
      out += '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '"/>';
    }
    lines.innerHTML = out;
  }

  // Всплывающие цифры урона и лечения
  function snapshot() {
    var units = {};
    S.players.forEach(function (pl) {
      pl.field.forEach(function (u) { units[u.uid] = E().stats(S, u).hp - u.damage; });
    });
    return { units: units, heroes: S.players.map(function (p) { return p.hp; }) };
  }

  function floatAt(el, text, cls) {
    if (!el) return;
    var c = center(el), f = document.createElement('div');
    f.className = 'float ' + cls;
    f.textContent = text;
    f.style.left = c.x + 'px';
    f.style.top = c.y + 'px';
    stage.appendChild(f);
    setTimeout(function () { f.remove(); }, 1300);
  }

  function showFloats(snap) {
    S.players.forEach(function (pl) {
      pl.field.forEach(function (u) {
        var before = snap.units[u.uid], now = E().stats(S, u).hp - u.damage;
        if (before !== undefined && now < before) {
          var ring = stage.querySelector('[data-unit="' + u.uid + '"] .tk-ring');
          floatAt(ring, '-' + (before - now), 'dmg');
          if (ring) ring.parentNode.classList.add('hit');
        }
      });
    });
    S.players.forEach(function (pl, i) {
      var d = pl.hp - snap.heroes[i];
      if (!d) return;
      var por = stage.querySelector('[data-hero="' + i + '"] .portrait');
      floatAt(por, (d > 0 ? '+' : '') + d, d > 0 ? 'heal' : 'dmg');
      if (por && d < 0) por.classList.add('hit');
    });
  }

  // ---------- Действия ----------

  function setFlash(msg) {
    ui.flash = msg;
    clearTimeout(setFlash.t);
    setFlash.t = setTimeout(function () { ui.flash = ''; if (S) render(); }, 2200);
  }

  // Выполнить действие движка, перерисовать, показать урон, двинуть ход дальше
  function act(fn) {
    var snap = snapshot(), logLen = S.log.length, before = capture();
    var r = fn();
    if (r && r.ok === false) {
      setFlash(r.error);
      render();
      return false;
    }
    var fresh = S.log.slice(logLen).map(function (l) { return l.text; })
      .filter(function (t) { return !/^Ход \d+/.test(t); });
    if (fresh.length) ui.outcome = fresh.slice(-3);
    ui.sel = null;
    render();
    showFloats(snap);
    animate(before);
    advance();
    return true;
  }

  // ---------- Анимации ----------

  // Позиции и вид жетонов до действия
  function capture() {
    var units = {};
    Array.prototype.forEach.call(stage.querySelectorAll('[data-unit]'), function (el) {
      units[el.dataset.unit] = { c: center(el), html: el.outerHTML, w: el.offsetWidth, h: el.offsetHeight };
    });
    return { units: units, turn: S.turn };
  }

  // Новые существа появляются, погибшие тают на прежнем месте, начало хода - баннер
  function animate(before) {
    var now = {};
    Array.prototype.forEach.call(stage.querySelectorAll('[data-unit]'), function (el) {
      now[el.dataset.unit] = true;
      if (!before.units[el.dataset.unit]) el.classList.add('enter');
    });
    Object.keys(before.units).forEach(function (uid) {
      if (now[uid]) return;
      var b = before.units[uid], g = document.createElement('div');
      g.className = 'dying';
      g.innerHTML = b.html;
      g.style.left = (b.c.x - b.w / 2) + 'px';
      g.style.top = (b.c.y - b.h / 2) + 'px';
      stage.appendChild(g);
      setTimeout(function () { g.remove(); }, 950);
    });
    if (S.turn !== before.turn && S.phase === 'main') {
      var ban = document.createElement('div');
      ban.className = 'banner';
      ban.textContent = S.active === ME ? 'Ваш ход' : 'Ход противника';
      stage.appendChild(ban);
      setTimeout(function () { ban.remove(); }, 1400);
    }
  }

  // Кто действует дальше: игрок ждёт ввода, ИИ ходит с паузами
  function advance() {
    if (S.phase === 'over') { ui.busy = false; render(); return; }
    if (S.phase === 'block' && S.active === ME) {
      ui.busy = true;
      setTimeout(function () {
        if (!S) return;
        var blocks = AD.AI.chooseBlocks(S, FOE);
        ui.pendingBlocks = blocks;
        render();
        setTimeout(function () {
          if (!S) return;
          ui.pendingBlocks = null;
          act(function () { return E().declareBlocks(S, FOE, blocks); });
        }, Object.keys(blocks).length ? BLOCK_SHOW : 200);
      }, AI_DELAY / 2);
      return;
    }
    if (S.active === FOE && S.phase === 'main') {
      ui.busy = true;
      if (ui.aiTurn !== S.turn) { ui.aiTurn = S.turn; ui.aiCount = 0; }
      setTimeout(aiStep, AI_DELAY);
      return;
    }
    if (ui.busy) { ui.busy = false; render(); }
  }

  function aiStep() {
    if (!S || S.phase !== 'main' || S.active !== FOE) return;
    var a = ui.aiCount++ < AD.AI.MAX_ACTIONS ? AD.AI.nextAction(S, FOE) : null;
    if (a) { act(function () { return AD.AI.apply(S, FOE, a); }); return; }
    act(function () { return AD.AI.declare(S, FOE); });
  }

  // ---------- Ввод ----------

  // Розыгрыш с выбором: жертва -> цель -> X
  function startSel(sel) {
    ui.sel = sel;
    ui.flash = '';
    ui.blockPick = null;
    nextStep();
  }

  function nextStep() {
    var s = ui.sel;
    if (s.needSac && !s.sac) s.step = 'sac';
    else if (s.spec && !s.target) s.step = 'target';
    else if (s.xCost && !s.xDone && !s.spec) s.step = 'x';
    else { applySel(); return; }
    render();
  }

  function applySel() {
    var s = ui.sel;
    var opts = { target: s.target, x: s.x, sacrifice: s.sac };
    if (s.kind === 'play') act(function () { return E().playCard(S, ME, s.uid, opts); });
    else act(function () { return E().activate(S, ME, s.uid, s.idx, opts); });
  }

  function chooseRef(ref) {
    var s = ui.sel;
    if (!s || !isTarget(ref)) return false;
    if (s.step === 'sac') s.sac = ref.uid;
    else s.target = ref;
    nextStep();
    return true;
  }

  function maxX(sel) {
    var p = S.players[ME];
    if (sel.xCost === 'life') return Math.max(1, p.hp - 1);
    var base = 0;
    if (sel.kind === 'play') {
      var c = p.hand.filter(function (h) { return h.uid === sel.uid; })[0];
      base = E().cardCost(S, ME, E().cardDef(c.id));
    }
    return Math.max(1, p.ether - base);
  }

  function onHand(uid) {
    if (!canIAct()) return;
    if (ui.sel && ui.sel.kind === 'play' && ui.sel.uid === uid) { ui.sel = null; render(); return; }
    var c = S.players[ME].hand.filter(function (h) { return h.uid === uid; })[0];
    var def = E().cardDef(c.id);
    var chk = E().canPlay(S, ME, uid, 1);
    if (!chk.ok) { setFlash(chk.error); render(); return; }
    var sel = { kind: 'play', uid: uid, spec: def.target || null, filter: def.targetFilter, xCost: def.xCost || false,
      needSac: !!def.sacrifice, x: 1 };
    if (sel.xCost) sel.x = maxX(sel);
    if (sel.xCost === 'life') sel.x = Math.min(3, sel.x);
    if (!sel.spec && !sel.xCost && !sel.needSac) { act(function () { return E().playCard(S, ME, uid, {}); }); return; }
    startSel(sel);
  }

  function onAbility(uid, idx) {
    if (!canIAct()) return;
    var chk = E().canActivate(S, ME, uid, idx, 1);
    if (!chk.ok) { setFlash(chk.error); render(); return; }
    var src = E().findUnit(S, uid) || E().findEnchant(S, uid).e;
    var def = E().cardDef(src.id), ab = def.abilities[idx], cost = ab.cost || {};
    var sel = { kind: 'act', uid: uid, idx: idx, spec: Ef().chooseSpec(def, ab), filter: ab.filter,
      xCost: cost.ether === 'X' ? 'ether' : false, needSac: !!cost.sacrifice, notSac: uid, x: 1 };
    if (sel.xCost) sel.x = maxX(sel);
    if (!sel.spec && !sel.xCost && !sel.needSac) { act(function () { return E().activate(S, ME, uid, idx, {}); }); return; }
    startSel(sel);
  }

  function onUnit(uid) {
    var ref = { kind: 'unit', uid: uid };
    if (ui.sel) { chooseRef(ref); return; }
    var u = E().findUnit(S, uid);
    if (!u) return;
    if (myMain() && u.owner === ME) {
      var i = ui.attackers.indexOf(uid);
      if (i >= 0) ui.attackers.splice(i, 1);
      else if (E().canAttack(S, u)) ui.attackers.push(uid);
      else setFlash(u.sick ? 'Существо отдыхает от вызова.' : (u.rested ? 'Существо отдыхает.' : 'Это существо не может атаковать.'));
      render();
      return;
    }
    if (myBlock()) {
      if (u.owner === ME) {
        for (var k in ui.blocks) if (ui.blocks[k] === uid) delete ui.blocks[k];
        if (u.rested) setFlash('Отдыхающее существо не может блокировать.');
        else ui.blockPick = ui.blockPick === uid ? null : uid;
      } else if (S.combat.attackers.indexOf(uid) >= 0) {
        if (ui.blocks[uid] && !ui.blockPick) delete ui.blocks[uid];
        else if (ui.blockPick) {
          var b = E().findUnit(S, ui.blockPick);
          if (E().canBlock(S, b, u)) {
            for (var a in ui.blocks) if (ui.blocks[a] === b.uid) delete ui.blocks[a];
            ui.blocks[uid] = b.uid;
            ui.blockPick = null;
          } else {
            setFlash('Это существо не может его заблокировать.');
          }
        }
      }
      render();
    }
  }

  function onEnch(uid) {
    if (ui.sel) { chooseRef({ kind: 'ench', uid: uid }); return; }
    var f = E().findEnchant(S, uid);
    if (!f) return;
    var def = E().cardDef(f.e.id);
    if (f.unit && def.release && f.unit.owner === ME) {
      act(function () { return E().release(S, ME, uid); });
      return;
    }
    if (f.e.owner === ME && abilityIndex(def) >= 0) onAbility(uid, abilityIndex(def));
  }

  function onButton(name) {
    if (name === 'finish') { var w = S.winner, cb = onEnd; S = null; if (cb) cb(w); return; }
    if (name === 'cancel') { ui.sel = null; render(); return; }
    if (name === 'log') { ui.logOpen = !ui.logOpen; saveLogPref(ui.logOpen); render(); return; }
    if (name === 'closegrave') { ui.graveView = null; render(); return; }
    if (name === 'xminus' || name === 'xplus') {
      ui.sel.x = Math.max(1, Math.min(maxX(ui.sel), ui.sel.x + (name === 'xplus' ? 1 : -1)));
      render();
      return;
    }
    if (name === 'xok') { ui.sel.xDone = true; nextStep(); return; }
    if (name === 'all') {
      S.players[ME].field.forEach(function (u) {
        if (E().canAttack(S, u) && ui.attackers.indexOf(u.uid) < 0) ui.attackers.push(u.uid);
      });
      render();
      return;
    }
    if (name === 'noattack') { ui.attackers = []; render(); return; }
    if (name === 'main') {
      if (myMain()) {
        var list = ui.attackers;
        ui.attackers = [];
        act(function () { return E().declareAttack(S, ME, list); });
      } else if (myBlock()) {
        var blocks = ui.blocks;
        ui.blocks = {};
        ui.blockPick = null;
        act(function () { return E().declareBlocks(S, ME, blocks); });
      }
    }
  }

  function onClick(ev) {
    if (!S) return;
    var t = ev.target.closest('[data-ab],[data-btn],[data-hand],[data-unit],[data-hero],[data-ench],[data-turn],[data-grave],[data-gravebtn]');
    if (!t) return;
    var d = t.dataset;
    if (d.ab) { var p = d.ab.split(':'); onAbility(Number(p[0]), Number(p[1])); return; }
    if (d.btn) { onButton(d.btn); return; }
    if (d.grave) { var g = d.grave.split(':'); chooseRef({ kind: 'grave', player: Number(g[0]), uid: Number(g[1]) }); return; }
    if (d.gravebtn) { ui.graveView = Number(d.gravebtn); render(); return; }
    if (d.ench) { onEnch(Number(d.ench)); return; }
    if (d.hand) { onHand(Number(d.hand)); return; }
    if (d.unit) { onUnit(Number(d.unit)); return; }
    if (d.hero) { if (ui.sel) chooseRef({ kind: 'hero', player: Number(d.hero) }); return; }
    if (d.turn) { ui.openTurns[d.turn] = !ui.openTurns[d.turn]; render(); }
  }

  // Подсмотр карты при наведении на жетон или чары
  function onOver(ev) {
    if (!S) return;
    var t = ev.target.closest('[data-unit],[data-ench]');
    var peek = stage.querySelector('.peek');
    if (!peek) return;
    if (!t) { peek.innerHTML = ''; return; }
    var id = null;
    var kws = null;
    if (t.dataset.ench) { var f = E().findEnchant(S, Number(t.dataset.ench)); id = f && f.e.id; }
    else {
      var u = E().findUnit(S, Number(t.dataset.unit));
      id = u && u.id;
      if (u) kws = E().stats(S, u).kw;
    }
    if (!id) return;
    peek.innerHTML = cardFull(E().cardDef(id), 'big') + keywordHelp(kws || Ef().parseKeywords(E().cardDef(id).keywords));
    var c = center(t);
    peek.style.top = Math.max(10, Math.min(800 - 330, c.y - 160)) + 'px';
    peek.style.left = (c.x > 640 ? c.x - 300 : c.x + 70) + 'px';
  }

  // Пояснения ключевых слов под подсмотренной картой
  function keywordHelp(kw) {
    var lines = Object.keys(kw).filter(function (k) { return cfg.keywords[k]; }).map(function (k) {
      var n = typeof kw[k] === 'number' ? ' ' + kw[k] : '';
      return '<div><b>' + esc(cfg.keywords[k].name + n) + '.</b> ' + esc(cfg.keywords[k].text.replace(' N ', n ? n + ' ' : ' N ')) + '</div>';
    });
    return lines.length ? '<div class="kw-help">' + lines.join('') + '</div>' : '';
  }

  function onKey(ev) {
    if (S && ev.key === 'Escape' && (ui.sel || ui.graveView != null)) { ui.sel = null; ui.graveView = null; render(); }
  }

  function onContext(ev) {
    if (!S) return;
    ev.preventDefault();
    if (ui.sel || ui.blockPick || ui.graveView != null) { ui.sel = null; ui.blockPick = null; ui.graveView = null; render(); }
  }

  var bound = false;

  // ---------- Запуск ----------

  function start(stageEl, config, setup, done) {
    stage = stageEl;
    cfg = config;
    onEnd = done;
    ui = freshUi();
    ui.scale = AD.Screens ? AD.Screens.scale() : 1;
    stage.className = 'stage battle' + (ui.logOpen ? ' log-open' : '');
    if (!bound) {
      stage.addEventListener('click', onClick);
      stage.addEventListener('contextmenu', onContext);
      stage.addEventListener('mouseover', onOver);
      document.addEventListener('keydown', onKey);
      bound = true;
    }
    S = E().create(setup);
    render();
    advance();
  }

  function setScale(k) { ui.scale = k; if (S) drawLines(); }

  AD.Battle = {
    start: start,
    setConfig: function (c) { cfg = c; },
    setScale: setScale,
    cardFull: function (def, extra, attrs, cost) { return cardFull(def, extra, attrs, cost); },
    artHtml: artHtml,
    svg: svg,
    esc: esc,
    RUNES: RUNES,
    ELEMENT_NAMES: ELEMENT_NAMES,
    TYPE_NAMES: TYPE_NAMES,
    active: function () { return !!S; },
    state: function () { return S; }
  };
})(window.AD = window.AD || {});
