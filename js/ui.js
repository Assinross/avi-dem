// Экран боя: отрисовка состояния движка и ввод игрока. Игрок - всегда игрок 0.
// AD.Battle.start(stage, cfg, setup, onEnd) - setup для AD.Engine.create, onEnd(winner) после боя.
(function (AD) {
  'use strict';

  var ME = 0, FOE = 1;
  var AI_DELAY = 750;
  var BLOCK_SHOW = 900;

  var ELEMENT_NAMES = { chaos: 'Хаос', life: 'Жизнь', movement: 'Движение', synthesis: 'Синтез', white: 'Иное', neutral: 'Иное' };
  var TYPE_NAMES = { creature: 'Существо', sorcery: 'Колдовство', enchantment: 'Чары' };
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
    cracks: 'M4 6l5 4-2 4 5 3M20 5l-5 5 2 3-4 3M12 3v4',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
    cross: 'M5 5l14 14M19 5L5 19'
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
      fast: loadPref('avi-dem-fast'),
      eye: false,         // кнопка предпросмотра итога схваток зажата
      pv: null,           // итог предпросмотра для текущей отрисовки
      playing: false,     // идёт проигрывание анимаций, ввод заблокирован
      lastActive: null,   // чей ход был на прошлой отрисовке (переворот жетона хода)
      shown: {},          // uid -> 'attacking'|'blocking' на прошлой отрисовке (для шага вперёд)
      zoom: null,         // вертикальный режим: карта руки, показанная крупно (uid)
      info: null,         // вертикальный режим: полная карта по долгому нажатию (id карты)
      noClick: false,     // клик после долгого нажатия не считается
      scale: 1
    };
  }

  // Открыт ли журнал боя: выбор игрока хранится в браузере, по умолчанию закрыт
  function loadLogPref() { return loadPref('avi-dem-log'); }

  function saveLogPref(open) { savePref('avi-dem-log', open); }

  function loadPref(key) {
    try { return window.localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }

  function savePref(key, on) {
    try { window.localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* без запоминания */ }
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

  // Вертикальный режим (телефон): класс на body ставит AD.Screens
  function portrait() { return document.body.classList.contains('vert'); }

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
    return '<div class="card full el-' + def.element + ' fac-' + (def.faction || 'neutral') + ' ' + (extra || '') + '" ' + (attrs || '') +
      (def.keywords && def.keywords.length ? ' data-kw="' + esc(def.keywords.join(',')) + '"' : '') + '>' +
      artHtml(def, 'card-art') +
      '<div class="cost' + (c !== def.cost ? ' changed' : '') + '">' + c + (def.xCost ? '<small>+X</small>' : '') + '</div>' +
      '<div class="card-name"><span>' + esc(def.name) + '</span></div>' +
      '<div class="card-type">' + esc(typeLine(def)) + '</div>' +
      '<div class="card-text">' + text + '</div>' +
      (def.type === 'creature' ? '<div class="stat atk">' + def.atk + '</div><div class="stat hp">' + def.hp + '</div>' : '') +
      '</div>';
  }

  // Подгонка полных карт внутри root: название уменьшается, пока самое длинное слово не влезет в плашку;
  // если не влезает описание - сначала уменьшается картинка, затем шрифт описания
  function fitCards(root) {
    var list = root.querySelectorAll('.card.full');
    for (var i = 0; i < list.length; i++) {
      var text = list[i].querySelector('.card-text'), art = list[i].querySelector('.card-art');
      var name = list[i].querySelector('.card-name span');
      if (name) {
        name.style.fontSize = '';
        for (var n = 1.1; n >= 0.7 && name.scrollWidth > name.clientWidth; n -= 0.05) name.style.fontSize = n + 'em';
      }
      if (!text || !art) continue;
      art.style.height = '';
      text.style.fontSize = '';
      for (var h = 7.6; h >= 4.6 && text.scrollHeight > text.clientHeight; h -= 0.5) art.style.height = h + 'em';
      for (var f = 0.92; f >= 0.66 && text.scrollHeight > text.clientHeight; f -= 0.04) text.style.fontSize = f + 'em';
    }
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

  // ---------- Предпросмотр схваток ("Око оракула") ----------

  // Можно ли сейчас показать итог: выбраны атакующие или идёт мой блок
  function canPreview() {
    return !ui.sel && ((myMain() && ui.attackers.length > 0) || myBlock());
  }

  // Итог схваток на копии боя: здоровье существ и героев до/после, кто погибнет
  function computePreview() {
    if (!ui.eye || !canPreview()) return null;
    var c = myBlock() ? E().previewCombat(S, ui.blocks) : E().previewCombat(S, {}, ui.attackers);
    if (!c) return null;
    var pv = { units: {}, heroes: [], dead: [], noBlocks: !myBlock() };
    S.players.forEach(function (pl, i) {
      pv.heroes[i] = { from: pl.hp, to: c.players[i].hp };
      pl.field.forEach(function (u) {
        var v = E().findUnit(c, u.uid), from = E().stats(S, u).hp - u.damage;
        var to = v ? E().stats(c, v).hp - v.damage : 0;
        pv.units[u.uid] = { from: from, to: Math.max(0, to), dead: !v };
        if (!v) pv.dead.push(E().cardDef(u.id).name);
      });
    });
    return pv;
  }

  function pvHint() {
    var pv = ui.pv, h = pv.heroes;
    var hero = function (i) { return h[i].to !== h[i].from ? S.players[i].name + ' ' + h[i].from + ' → ' + Math.max(0, h[i].to) : ''; };
    var parts = [hero(FOE), hero(ME)].filter(Boolean);
    parts.push(pv.dead.length ? 'погибнут: ' + pv.dead.join(', ') : 'никто не погибнет');
    if (h[FOE].to <= 0 && h[ME].to > 0) parts.unshift('победа');
    else if (h[ME].to <= 0) parts.unshift(h[FOE].to <= 0 ? 'ничья' : 'поражение');
    return '<span class="gold">Итог' + (pv.noBlocks ? ' без учёта блоков' : '') + ':</span> ' + esc(parts.join('; ')) + '.';
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
    var pv = ui.pv && ui.pv.units[u.uid];
    if (pv && pv.dead) cls.push('pv-dead');

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
      (pv && (pv.dead || pv.to !== pv.from) ? '<div class="pv-hp">' + pv.from + '→' + pv.to + '</div>' : '') +
      (pv && pv.dead ? svg(ICONS.cross, 'pv-x') : '') +
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
      '<div class="hero-hp">' + Math.max(0, pl.hp) + '</div>' +
      (ui.pv && ui.pv.heroes[p].to !== pl.hp ? '<div class="pv-hero' + (ui.pv.heroes[p].to <= 0 ? ' lethal' : '') + '">' +
        pl.hp + ' → ' + Math.max(0, ui.pv.heroes[p].to) + '</div>' : '') + '</div>' +
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
    var vert = portrait();
    var p = S.players[ME], n = p.hand.length, cw = vert ? 124 : 118, width = vert ? 396 : (ui.logOpen ? 480 : 750), gap = vert ? 6 : 16;
    if (n > 1 && n * cw + (n - 1) * gap > width) gap = (width - n * cw) / (n - 1);
    return p.hand.map(function (c, i) {
      var def = E().cardDef(c.id);
      var playable = canIAct() && E().canPlay(S, ME, c.uid, 1).ok;
      var cls = (playable ? 'playable' : 'unplayable') + (ui.sel && ui.sel.kind === 'play' && ui.sel.uid === c.uid ? ' selected' : '');
      var mid = (n - 1) / 2, off = i - mid;
      var style = 'style="' + (i > 0 ? 'margin-left:' + gap + 'px;' : '') + '--rot:' + (off * (vert ? 4 : 2.5)) + 'deg;--lift:' + Math.round(off * off * (vert ? 3 : 1.5)) + 'px"';
      return cardFull(def, cls, 'data-hand="' + c.uid + '" ' + style, E().cardCost(S, ME, def));
    }).join('');
  }

  function foeHand() {
    var n = S.players[FOE].hand.length, backs = '';
    for (var i = 0; i < Math.min(n, 8); i++) backs += '<div class="card-back"></div>';
    return '<div class="foe-hand">' + backs + '<span>' + n + '<small> в руке</small></span></div>';
  }

  // ---------- Жетон хода, подсказка, кнопки ----------

  // Жетон хода (как в LoR): на стороне ходящего, золотой - мой ход; в схватке скрещённые мечи пульсируют
  function turnBadge() {
    var mine = S.active === ME, fight = S.phase === 'block';
    var label = S.phase === 'over' ? 'Бой окончен' : fight ? (mine ? 'Ваша атака' : 'Противник атакует') : (mine ? 'Ваш ход' : 'Ход противника');
    return '<div class="turn-badge ' + (mine ? 'mine' : 'foe') + (fight ? ' fight' : '') + '">' +
      '<div class="emblem">' + svg(ICONS.swords) + '</div><div class="turn-label">' + label + '</div></div>';
  }

  function turnLine() {
    return '<div class="turnline">' + turnBadge() + '<div class="hint">' + hint() + '</div>' +
      '<button class="ghost log-toggle' + (ui.fast ? ' on' : '') + '" data-btn="fast" title="Ускорить анимации">×2</button>' +
      '<button class="ghost log-toggle' + (ui.logOpen ? ' on' : '') + '" data-btn="log">Журнал</button></div>';
  }

  // При смене хода жетон переворачивается и перелетает на сторону ходящего
  function flipBadge() {
    var em = stage.querySelector('.turn-badge .emblem');
    if (em && em.animate && ui.lastActive != null && ui.lastActive !== S.active && !reduced()) {
      var from = portrait() ? '' : 'translateY(' + (S.active === ME ? -12 : 12) + 'px) ';
      em.animate([{ transform: from + 'rotateY(180deg) scale(1.25)', offset: 0 }], { duration: ms(700), easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    ui.lastActive = S.active;
  }

  function hint() {
    if (ui.flash) return '<span class="warn">' + esc(ui.flash) + '</span>';
    if (ui.pv) return pvHint();
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

  // part: 'main' - только главная кнопка, 'extra' - только второстепенные (вертикальный режим)
  function controls(part) {
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
    if (part === 'extra') return extra ? '<div class="arena-btns">' + extra + '</div>' : '';
    if (part === 'main') extra = '';
    var eye = canPreview() ? '<button class="eye-btn' + (ui.eye ? ' on' : '') + '" data-btn="eye" title="Удерживайте, чтобы увидеть итог схваток">' + svg(ICONS.eye) + '</button>' : '';
    return '<div class="controls">' + extra + '<div class="main-row">' + eye +
      '<button class="end-turn' + (main ? '' : ' wait') + '" data-btn="main"' + (main ? '' : ' disabled') + '>' +
      (main || (S.phase === 'over' ? 'Бой окончен' : 'Ход противника')) + '</button></div></div>';
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
    ui.pv = computePreview();
    var prev = positions(), pairs = arenaUnits();
    if (portrait()) stage.innerHTML = portraitHtml();
    else stage.innerHTML =
      '<div class="board"' + boardArt() + '>' +
      '<div class="hero-row foe-row">' + heroPanel(FOE) + foeHand() + '</div>' +
      pcField(FOE, pairs) +
      '<div class="midline">' + turnLine() + '</div>' +
      pcField(ME, pairs) +
      '<div class="bottom-row">' + heroPanel(ME) + '<div class="hand">' + handHtml() + '</div>' + controls() + '</div>' +
      '</div>' +
      (ui.logOpen ? logHtml() : '') +
      xBar() + '<div class="peek"></div>' + gravePicker() + overlay();
    var body = stage.querySelector('.log-body');
    if (body && logAtBottom) body.scrollTop = body.scrollHeight;
    fitCards(stage);
    slide(prev);
    stepForward();
    flipBadge();
  }

  // Поле на ПК. Во время атаки пары стоят колонками по центру: атакующий напротив блокера
  // (или пустого места, если блока нет); остальные существа расходятся к краям и притушены.
  function pcField(p, pairs) {
    var cls = 'field ' + (p === ME ? 'my-field' : 'foe-field');
    if (!pairs.length) return '<div class="' + cls + '">' + S.players[p].field.map(token).join('') + '</div>';
    var used = {};
    var cells = pairs.map(function (pr) {
      var u = pr.side === p ? pr.a : pr.b;
      if (u) used[u.uid] = 1;
      return '<div class="cell">' + (u ? token(u) : '<div class="slot"></div>') + '</div>';
    }).join('');
    var rest = S.players[p].field.filter(function (u) { return !used[u.uid]; }).map(function (u) {
      return token(u).replace('class="token ', 'class="token idle ');
    });
    var half = Math.ceil(rest.length / 2);
    return '<div class="' + cls + ' paired"><div class="side left">' + rest.slice(0, half).join('') + '</div>' +
      '<div class="pairs">' + cells + '</div><div class="side right">' + rest.slice(half).join('') + '</div></div>';
  }

  // Положения жетонов до перерисовки
  function positions() {
    var out = {};
    if (!stage || !stage.querySelectorAll) return out;
    Array.prototype.forEach.call(stage.querySelectorAll('.board [data-unit]'), function (el) {
      var r = el.getBoundingClientRect();
      out[el.dataset.unit] = { x: r.left, y: r.top };
    });
    return out;
  }

  // Жетон, сменивший место (выход в пару, на арену, сдвиг ряда), плавно переезжает со старого места
  function slide(prev) {
    if (reduced()) return;
    Array.prototype.forEach.call(stage.querySelectorAll('.board [data-unit]'), function (el) {
      var p = prev[el.dataset.unit];
      if (!p || !el.animate) return;
      var r = el.getBoundingClientRect(), dx = (p.x - r.left) / ui.scale, dy = (p.y - r.top) / ui.scale;
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      el.animate([{ translate: dx + 'px ' + dy + 'px' }, { translate: '0 0' }], { duration: ms(380), easing: 'cubic-bezier(.3,.7,.3,1)' });
    });
  }

  // ---------- Вертикальный режим ----------

  // Размер жетона под число существ в ряду (ширина ряда ~434)
  function rowStyle(n) {
    var tk = Math.max(50, Math.min(80, Math.floor((434 - (n - 1) * 8) / Math.max(n, 1)) - 6));
    return ' style="--tk:' + tk + 'px"';
  }

  // Существа на арене: атакующие по порядку и их блокеры. Пусто - арены нет.
  function arenaUnits() {
    var list = S.combat ? S.combat.attackers : (myMain() ? ui.attackers : []);
    var side = S.combat ? S.active : ME, blocks = currentBlocks();
    return list.map(function (uid) {
      var a = E().findUnit(S, uid), b = blocks[uid] ? E().findUnit(S, blocks[uid]) : null;
      return a ? { side: side, a: a, b: b } : null;
    }).filter(Boolean);
  }

  // Арена: атакующие напротив своих блокеров (атакующий снизу, если атакую я). Пустая - фаза и подсказка.
  function arenaHtml(pairs) {
    var head = '<div class="arena-head">' + turnBadge() + '</div>';
    if (!pairs.length) return '<div class="arena empty">' + head + '<div class="arena-hint">' + hint() + '</div>' + controls('extra') + '</div>';
    var top = '', bottom = '', st = rowStyle(pairs.length);
    pairs.forEach(function (p) {
      var att = token(p.a), blk = p.b ? token(p.b) : '<div class="slot"></div>';
      top += '<div class="cell">' + (p.side === FOE ? att : blk) + '</div>';
      bottom += '<div class="cell">' + (p.side === FOE ? blk : att) + '</div>';
    });
    return '<div class="arena">' + head + '<div class="arena-row"' + st + '>' + top + '</div>' +
      '<div class="arena-hint">' + hint() + '</div>' + controls('extra') +
      '<div class="arena-row"' + st + '>' + bottom + '</div></div>';
  }

  function bench(p, inArena) {
    var list = S.players[p].field.filter(function (u) { return !inArena[u.uid]; });
    return '<div class="field ' + (p === ME ? 'my-field' : 'foe-field') + '"' + rowStyle(list.length) + '>' + list.map(token).join('') + '</div>';
  }

  function portraitHtml() {
    var pairs = arenaUnits(), inArena = {};
    pairs.forEach(function (p) { inArena[p.a.uid] = 1; if (p.b) inArena[p.b.uid] = 1; });
    return '<div class="board"' + boardArt() + '>' +
      '<div class="hero-row foe-row">' + heroPanel(FOE) +
      '<div class="foe-side"><span class="foe-count">' + svg(ICONS.deck) + S.players[FOE].hand.length + '<small> в руке</small></span>' +
      '<div class="top-btns"><button class="ghost' + (ui.fast ? ' on' : '') + '" data-btn="fast" title="Ускорить анимации">×2</button>' +
      '<button class="ghost' + (ui.logOpen ? ' on' : '') + '" data-btn="log">Журнал</button></div></div></div>' +
      bench(FOE, inArena) + arenaHtml(pairs) + bench(ME, inArena) +
      '<div class="hero-row my-row">' + heroPanel(ME) + controls('main') + '</div>' +
      '<div class="hand">' + handHtml() + '</div>' +
      '</div>' +
      (ui.logOpen ? logHtml() : '') +
      xBar() + '<div class="peek"></div>' + zoomHtml() + infoHtml() + gravePicker() + overlay();
  }

  // Карта руки крупно: тап по ней или "Разыграть" - розыгрыш, тап мимо - закрыть
  function zoomHtml() {
    if (ui.zoom == null) return '';
    var c = S.players[ME].hand.filter(function (h) { return h.uid === ui.zoom; })[0];
    if (!c) { ui.zoom = null; return ''; }
    var def = E().cardDef(c.id), chk = canIAct() ? E().canPlay(S, ME, c.uid, 1) : { ok: false, error: 'Сейчас не ваш ход.' };
    return '<div class="sheet" data-btn="zoomclose"><div class="sheet-card">' +
      cardFull(def, 'big', 'data-btn="' + (chk.ok ? 'zoomplay' : 'zoomclose') + '"', E().cardCost(S, ME, def)) +
      keywordHelp(Ef().parseKeywords(def.keywords)) + '</div>' +
      '<div class="sheet-btns">' + (chk.ok ? '<button class="end-turn" data-btn="zoomplay">Разыграть</button>' : '<p class="warn">' + esc(chk.error) + '</p>') +
      '<button class="ghost" data-btn="zoomclose">Закрыть</button></div></div>';
  }

  // Полная карта существа или чар по долгому нажатию
  function infoHtml() {
    if (!ui.info) return '';
    return '<div class="sheet" data-btn="infoclose"><div class="sheet-card">' + cardFull(E().cardDef(ui.info.id), 'big') +
      keywordHelp(ui.info.kw || Ef().parseKeywords(E().cardDef(ui.info.id).keywords)) + '</div>' +
      '<div class="sheet-btns"><button class="ghost" data-btn="infoclose">Закрыть</button></div></div>';
  }

  // Предпросмотр итога работает, пока кнопка-глаз зажата мышью или пальцем
  function onEyeDown(ev) {
    if (!S || ui.playing || !ev.target.closest('[data-btn="eye"]')) return;
    ev.preventDefault();
    ui.eye = true;
    render();
  }

  function onEyeUp() {
    if (!ui.eye) return;
    ui.eye = false;
    if (S && !ui.playing) render();
  }

  // Долгое нажатие на жетон, чары или карту - показать полную карту
  var press = null;

  function onPress(ev) {
    if (!S || !portrait() || ui.playing) return;
    var t = ev.target.closest('[data-unit],[data-ench],[data-hand]');
    if (!t) return;
    var x = ev.clientX, y = ev.clientY;
    clearTimeout(press && press.timer);
    press = { x: x, y: y, timer: setTimeout(function () {
      var id = null, kw = null;
      if (t.dataset.ench) { var f = E().findEnchant(S, Number(t.dataset.ench)); id = f && f.e.id; }
      else if (t.dataset.hand) { var c = S.players[ME].hand.filter(function (h) { return h.uid === Number(t.dataset.hand); })[0]; id = c && c.id; }
      else { var u = E().findUnit(S, Number(t.dataset.unit)); id = u && u.id; if (u) kw = E().stats(S, u).kw; }
      press = null;
      if (!id) return;
      ui.info = { id: id, kw: kw };
      ui.noClick = true;
      render();
    }, 450) };
  }

  function onPressMove(ev) {
    if (press && Math.abs(ev.clientX - press.x) + Math.abs(ev.clientY - press.y) > 12) { clearTimeout(press.timer); press = null; }
  }

  function onPressEnd() { if (press) { clearTimeout(press.timer); press = null; } }

  // Существо, которое только что стало атакующим или блокирующим, плавно выходит вперёд
  function stepForward() {
    var now = {};
    Array.prototype.forEach.call(stage.querySelectorAll('.token.attacking, .token.blocking'), function (el) {
      var st = el.classList.contains('attacking') ? 'attacking' : 'blocking';
      now[el.dataset.unit] = st;
      if (ui.shown[el.dataset.unit] !== st && el.animate) {
        el.animate([{ transform: 'none', offset: 0 }], { duration: ms(320), easing: 'cubic-bezier(.3,.7,.3,1)' });
      }
    });
    ui.shown = now;
  }

  function center(el) {
    var r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - s.left) / ui.scale, y: (r.top + r.height / 2 - s.top) / ui.scale };
  }

  // Всплывающие цифры урона и лечения
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

  // ---------- Действия ----------

  function setFlash(msg) {
    ui.flash = msg;
    clearTimeout(setFlash.t);
    setFlash.t = setTimeout(function () { ui.flash = ''; if (S && !ui.playing) render(); }, 2200);
  }

  // Выполнить действие движка: проиграть события на прежней картинке поля, затем перерисовать и двинуть ход дальше
  function act(fn) {
    var logLen = S.log.length, before = capture();
    S.fx = [];
    var r = fn();
    if (r && r.ok === false) {
      S.fx = [];
      setFlash(r.error);
      render();
      return false;
    }
    var fresh = S.log.slice(logLen).map(function (l) { return l.text; })
      .filter(function (t) { return !/^Ход \d+/.test(t); });
    if (fresh.length) ui.outcome = fresh.slice(-3);
    ui.sel = null;
    var events = S.fx.splice(0);
    ui.playing = true;
    play(events, function (gone) {
      ui.playing = false;
      if (!S) return;
      render();
      animate(before, gone);
      advance();
    });
    return true;
  }

  // ---------- Анимации ----------

  // Позиции и вид жетонов до действия
  function capture() {
    var units = {};
    Array.prototype.forEach.call(stage.querySelectorAll('.board [data-unit]'), function (el) {
      units[el.dataset.unit] = { c: center(el), html: el.outerHTML, w: el.offsetWidth, h: el.offsetHeight };
    });
    return { units: units, turn: S.turn };
  }

  // Новые существа появляются, погибшие тают на прежнем месте, начало хода - баннер
  function animate(before, gone) {
    var now = {};
    Array.prototype.forEach.call(stage.querySelectorAll('.board [data-unit]'), function (el) {
      now[el.dataset.unit] = true;
      if (!before.units[el.dataset.unit]) el.classList.add('enter');
    });
    Object.keys(before.units).forEach(function (uid) {
      if (now[uid] || (gone && gone[uid])) return;
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

  // ---------- Проигрывание событий движка ----------

  // Длительность с учётом ускорения
  function ms(n) { return Math.round(n * (ui.fast ? 0.5 : 1)); }

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Элемент цели: кольцо жетона или портрет героя
  function refEl(ref) {
    if (!ref) return null;
    if (ref.kind === 'hero') return stage.querySelector('[data-hero="' + ref.player + '"] .portrait');
    if (ref.kind === 'unit') return stage.querySelector('.board [data-unit="' + ref.uid + '"] .tk-ring');
    return null;
  }

  function unitEl(uid) { return stage.querySelector('.board [data-unit="' + uid + '"]'); }

  function shake(el) {
    if (el && el.animate) el.animate([{ translate: '0' }, { translate: '-6px' }, { translate: '6px' }, { translate: '-4px' }, { translate: '3px' }, { translate: '0' }], { duration: ms(340) });
  }

  // Число на щите здоровья меняется сразу, не дожидаясь перерисовки
  function bumpHp(ref, d) {
    var el = ref.kind === 'hero' ? stage.querySelector('[data-hero="' + ref.player + '"] .hero-hp')
      : stage.querySelector('.board [data-unit="' + ref.uid + '"] .stat.hp');
    if (!el) return;
    el.textContent = Math.max(0, (parseInt(el.textContent, 10) || 0) + d);
    if (ref.kind === 'unit' && d < 0) el.classList.add('hurt');
    if (el.animate) el.animate([{ scale: 1 }, { scale: 1.5 }, { scale: 1 }], { duration: ms(300) });
  }

  // Рывок жетона к цели и обратно: замах, удар, возврат. Возвращает задержку до момента удара.
  function lunge(uid, ref) {
    var el = unitEl(uid), to = refEl(ref);
    if (!el || !to || !el.animate) return 0;
    var a = center(el.querySelector('.tk-ring')), b = center(to);
    var dx = (b.x - a.x) * 0.78, dy = (b.y - a.y) * 0.78;
    el.style.zIndex = 20;
    var anim = el.animate([
      { translate: '0 0', scale: 1 },
      { translate: (-dx * 0.08) + 'px ' + (-dy * 0.08) + 'px', scale: 1.08, offset: 0.35 },
      { translate: dx + 'px ' + dy + 'px', scale: 1.14, offset: 0.55 },
      { translate: '0 0', scale: 1 }
    ], { duration: ms(600), easing: 'cubic-bezier(.4,0,.2,1)' });
    anim.onfinish = function () { el.style.zIndex = ''; };
    return ms(330);
  }

  // Сгусток (вампиризм, снаряд заклинания) летит по дуге от одной цели к другой
  function orb(fromEl, toEl, cls, dur) {
    if (!fromEl || !toEl) return 0;
    var a = center(fromEl), b = center(toEl), o = document.createElement('div');
    o.className = 'orb ' + cls;
    stage.appendChild(o);
    var bend = (a.x < 640 ? 1 : -1) * 70;
    var anim = o.animate([
      { transform: 'translate(' + a.x + 'px,' + a.y + 'px) scale(0.6)' },
      { transform: 'translate(' + ((a.x + b.x) / 2 + bend) + 'px,' + ((a.y + b.y) / 2) + 'px) scale(1.2)', offset: 0.5 },
      { transform: 'translate(' + b.x + 'px,' + b.y + 'px) scale(0.8)' }
    ], { duration: ms(dur), easing: 'ease-in-out' });
    anim.onfinish = function () { o.remove(); };
    return ms(dur);
  }

  // Гибель: вспышка, обесцвечивание, распад на осколки цвета стихии
  function shatter(uid, how) {
    var el = unitEl(uid);
    if (!el || !el.animate) return;
    var ring = el.querySelector('.tk-ring'), c = center(ring);
    var color = getComputedStyle(el).getPropertyValue('--el') || '#c9a24a';
    el.animate(how === 'die' ? [
      { filter: 'none', opacity: 1 },
      { filter: 'brightness(2.2) saturate(0)', opacity: 1, scale: 1.1, offset: 0.25 },
      { filter: 'brightness(0.4) saturate(0)', opacity: 0, scale: 0.5, translate: '0 12px' }
    ] : [{ opacity: 1 }, { opacity: 0, scale: 0.7 }], { duration: ms(720), fill: 'forwards' });
    if (how !== 'die') return;
    for (var i = 0; i < 10; i++) {
      var sh = document.createElement('div'), ang = i / 10 * Math.PI * 2 + Math.random() * 0.5, r = 46 + Math.random() * 30;
      sh.className = 'shard';
      sh.style.left = c.x + 'px';
      sh.style.top = c.y + 'px';
      sh.style.background = color;
      stage.appendChild(sh);
      sh.animate([
        { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + Math.cos(ang) * r + 'px), calc(-50% + ' + (Math.sin(ang) * r + 20) + 'px)) rotate(' + (200 + i * 30) + 'deg)', opacity: 0 }
      ], { duration: ms(760), easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = (function (x) { return function () { x.remove(); }; })(sh);
    }
  }

  // Карта, сыгранная противником, крупно по центру поля
  function showCast(id) {
    var box = document.createElement('div');
    box.className = 'cast-show';
    box.innerHTML = cardFull(E().cardDef(id), 'big');
    stage.appendChild(box);
    fitCards(box);
    setTimeout(function () { box.remove(); }, ms(1100));
    return ms(950);
  }

  // Один шаг очереди. Возвращает паузу до следующего события (мс).
  function playOne(ev, gone) {
    var el;
    switch (ev.t) {
      case 'fight':
        [ev.a, ev.b].forEach(function (uid) { var u = unitEl(uid); if (u) u.classList.add('clash'); });
        return ms(160);
      case 'strike':
        return lunge(ev.from, ev.to);
      case 'damage':
        el = refEl(ev.ref);
        if (!el) return 0;
        floatAt(el, '-' + ev.n, 'dmg');
        shake(el);
        bumpHp(ev.ref, -ev.n);
        return ms(260);
      case 'heal':
        el = refEl(ev.ref);
        if (!el) return 0;
        floatAt(el, '+' + ev.n, 'heal');
        if (el.animate) el.animate([{ boxShadow: '0 0 0 0 rgba(127,208,138,0)' }, { boxShadow: '0 0 0 6px rgba(127,208,138,.7), 0 0 30px rgba(127,208,138,.6)' }, { boxShadow: '0 0 0 0 rgba(127,208,138,0)' }], { duration: ms(600) });
        bumpHp(ev.ref, ev.n);
        return ms(320);
      case 'drain':
        return orb(refEl(ev.from), refEl(ev.to), 'drain', 650);
      case 'absorb':
        floatAt(refEl(ev.ref), 'Поглощено', 'note');
        return ms(320);
      case 'regen':
        floatAt(refEl({ kind: 'unit', uid: ev.uid }), 'Регенерация', 'heal note');
        return ms(360);
      case 'death':
        gone[ev.uid] = true;
        shatter(ev.uid, ev.how);
        return ms(ev.how === 'die' ? 420 : 300);
      case 'cast':
        var wait = ev.p === FOE ? showCast(ev.id) : 0;
        if (ev.target && refEl(ev.target)) {
          var from = stage.querySelector('[data-hero="' + ev.p + '"] .portrait'), def = E().cardDef(ev.id);
          setTimeout(function () { orb(from, refEl(ev.target), 'bolt el-' + def.element, 380); }, wait);
          wait += ms(380);
        }
        return wait;
      case 'ability':
        var src = refEl({ kind: 'unit', uid: ev.uid });
        if (src && src.animate) src.animate([{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], { duration: ms(300) });
        if (ev.target && src) return orb(src, refEl(ev.target), 'bolt el-' + E().cardDef(ev.id).element, 360);
        return src ? ms(260) : 0;
      default:
        return 0;
    }
  }

  // Проиграть события по очереди, затем done(gone) - gone: uid существ, уже показанных гибнущими
  function play(events, done) {
    var gone = {}, i = 0;
    if (reduced()) {
      events.forEach(function (ev) { if (ev.t === 'death') gone[ev.uid] = true; });
      done(gone);
      return;
    }
    (function next() {
      if (!S) return;
      if (i >= events.length) { setTimeout(function () { done(gone); }, events.length ? ms(300) : 0); return; }
      var wait = playOne(events[i++], gone);
      if (wait > 0) setTimeout(next, wait);
      else next();
    })();
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
    if (name === 'zoomclose') { ui.zoom = null; render(); return; }
    if (name === 'infoclose') { ui.info = null; render(); return; }
    if (name === 'zoomplay') { var zu = ui.zoom; ui.zoom = null; if (zu != null) onHand(zu); else render(); return; }
    if (name === 'eye') return;
    if (name === 'fast') { ui.fast = !ui.fast; savePref('avi-dem-fast', ui.fast); render(); return; }
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
    if (!S || ui.playing) return;
    if (ui.noClick) { ui.noClick = false; return; }
    var t = ev.target.closest('[data-ab],[data-btn],[data-hand],[data-unit],[data-hero],[data-ench],[data-turn],[data-grave],[data-gravebtn]');
    if (!t) return;
    var d = t.dataset;
    if (d.ab) { var p = d.ab.split(':'); onAbility(Number(p[0]), Number(p[1])); return; }
    if (d.btn) { onButton(d.btn); return; }
    if (d.grave) { var g = d.grave.split(':'); chooseRef({ kind: 'grave', player: Number(g[0]), uid: Number(g[1]) }); return; }
    if (d.gravebtn) { ui.graveView = Number(d.gravebtn); render(); return; }
    if (d.ench) { onEnch(Number(d.ench)); return; }
    if (d.hand) {
      if (portrait() && !ui.sel && ui.zoom !== Number(d.hand)) { ui.zoom = Number(d.hand); render(); return; }
      onHand(Number(d.hand));
      return;
    }
    if (d.unit) { onUnit(Number(d.unit)); return; }
    if (d.hero) { if (ui.sel) chooseRef({ kind: 'hero', player: Number(d.hero) }); return; }
    if (d.turn) { ui.openTurns[d.turn] = !ui.openTurns[d.turn]; render(); }
  }

  // Подсмотр карты при наведении на жетон или чары
  function onOver(ev) {
    if (!S || portrait()) return;
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
    fitCards(peek);
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

  // Подсказка по ключевым словам при наведении на полную карту (рука, награда, могильник)
  var kwTip = null, kwCard = null;

  function onKwOver(ev) {
    var c = ev.target.closest ? ev.target.closest('.card.full[data-kw]') : null;
    if (c === kwCard) return;
    kwCard = c;
    if (!kwTip) {
      kwTip = document.createElement('div');
      kwTip.className = 'kw-tip';
      document.body.appendChild(kwTip);
    }
    var html = c && cfg && !portrait() ? keywordHelp(Ef().parseKeywords(c.dataset.kw.split(','))) : '';
    kwTip.innerHTML = html;
    kwTip.style.display = html ? '' : 'none';
    if (!html) return;
    var r = c.getBoundingClientRect(), k = ui.scale || 1, w = 262 * k;
    kwTip.style.transform = 'scale(' + k + ')';
    kwTip.style.left = Math.max(4, r.right + 10 + w < window.innerWidth ? r.right + 10 : r.left - 10 - w) + 'px';
    kwTip.style.top = Math.max(4, r.top) + 'px';
  }

  document.addEventListener('mouseover', onKwOver);

  function onKey(ev) {
    if (S && !ui.playing && ev.key === 'Escape' && (ui.sel || ui.graveView != null || ui.zoom != null || ui.info)) {
      ui.sel = null; ui.graveView = null; ui.zoom = null; ui.info = null; render();
    }
  }

  function onContext(ev) {
    if (!S) return;
    ev.preventDefault();
    if (portrait()) return;
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
      stage.addEventListener('pointerdown', onEyeDown);
      stage.addEventListener('pointerdown', onPress);
      window.addEventListener('pointerup', onEyeUp);
      window.addEventListener('pointercancel', onEyeUp);
      window.addEventListener('blur', onEyeUp);
      stage.addEventListener('pointermove', onPressMove);
      stage.addEventListener('pointerup', onPressEnd);
      stage.addEventListener('pointercancel', onPressEnd);
      document.addEventListener('keydown', onKey);
      bound = true;
    }
    S = E().create(setup);
    render();
    advance();
  }

  function setScale(k) { ui.scale = k; }

  AD.Battle = {
    start: start,
    setConfig: function (c) { cfg = c; },
    setScale: setScale,
    relayout: function () { if (S && !ui.playing) render(); },
    cardFull: function (def, extra, attrs, cost) { return cardFull(def, extra, attrs, cost); },
    fitCards: fitCards,
    keywordHelpFor: function (def) { return keywordHelp(Ef().parseKeywords(def.keywords)); },
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
