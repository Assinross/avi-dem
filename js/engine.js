// Движок боя: правила из docs/rules.md. Чистая логика, без DOM.
// Состояние - обычный JSON (можно клонировать для ИИ), справочники карт и эфира - в модуле (setData).
// Все действия возвращают { ok: true } или { ok: false, error: "..." }.
(function (AD) {
  'use strict';

  var HAND_LIMIT = 8;
  var START_HAND = [5, 6]; // первый ходящий / второй
  var data = { cards: {}, ether: null };

  function setData(d) {
    if (d.cards) {
      data.cards = {};
      (Array.isArray(d.cards) ? d.cards : Object.values(d.cards)).forEach(function (c) { data.cards[c.id] = c; });
    }
    if (d.ether) data.ether = d.ether.channels || d.ether;
  }

  function cardDef(id) {
    var c = data.cards[id];
    if (!c) throw new Error('Нет карты: ' + id);
    return c;
  }

  function hasCard(id) { return !!data.cards[id]; }

  function fail(msg) { return { ok: false, error: msg }; }
  var OK = { ok: true };
  function Ef() { return AD.Effects; }

  // ---------- Случайность (детерминированная, по зерну в состоянии) ----------

  function rand(state) {
    var t = (state.seed = (state.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function shuffle(state, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand(state) * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---------- Журнал ----------

  function log(state, text) {
    state.log.push({ turn: state.turn, text: text });
  }

  // ---------- Создание боя ----------

  function heroHp(level) { return 7 + 3 * (level - 1); }

  // Навыки героя/монстра -> постоянные способности героя
  function skillPassives(skills) {
    var out = [];
    if (skills.REGN) out.push({ trigger: 'startOfTurn', whose: 'owner', effect: 'heal', target: 'ownHero', amount: skills.REGN, every: 3 });
    if (skills.CONC) out.push({ trigger: 'startOfTurn', whose: 'owner', effect: 'draw', target: 'ownHero', amount: skills.CONC, every: 4 });
    return out;
  }

  // opts: { players: [{ name, element, level, hp?, deck: [id...], skills?: {HEAL:1}, passives?: [...] }], first, seed }
  function create(opts) {
    var state = {
      turn: 0,
      active: opts.first || 0,
      phase: 'main',
      seq: 1,
      seed: (opts.seed || Date.now()) | 0,
      players: [],
      combat: null,
      fog: false,
      winner: null,
      log: []
    };
    opts.players.forEach(function (o) {
      var level = o.level || 5, skills = o.skills || {};
      var hp = o.hp || heroHp(level);
      if (skills.HEAL) hp = Math.round(hp * (1 + 0.1 * skills.HEAL));
      state.players.push({
        name: o.name, element: o.element || null, level: level,
        hp: hp, maxHp: hp,
        channels: 0, bonusChannels: 0, ether: 0, turns: 0, extraDraw: 0, flags: {},
        passives: (o.passives || []).concat(skillPassives(skills)),
        deck: shuffle(state, o.deck.filter(hasCard).map(function (id) { return { uid: state.seq++, id: id }; })),
        hand: [], discard: [], graveyard: [], field: [], enchants: []
      });
    });
    draw(state, state.active, START_HAND[0]);
    draw(state, 1 - state.active, START_HAND[1]);
    startTurn(state);
    return state;
  }

  function clone(state) { return JSON.parse(JSON.stringify(state)); }

  // ---------- Колода и рука ----------

  function draw(state, pIdx, n) {
    var p = state.players[pIdx];
    for (var i = 0; i < n; i++) {
      if (!p.deck.length && p.discard.length) {
        p.deck = shuffle(state, p.discard);
        p.discard = [];
        log(state, p.name + ' замешивает сброс в колоду.');
      }
      if (!p.deck.length) return;
      var c = p.deck.pop();
      if (p.hand.length >= HAND_LIMIT) {
        p.discard.push(c);
        log(state, p.name + ': рука полна, карта "' + cardDef(c.id).name + '" сгорает.');
      } else {
        p.hand.push(c);
      }
    }
  }

  // Сбросить n случайных карт (с фильтром)
  function discard(state, pIdx, n, filter) {
    var p = state.players[pIdx], k = 0;
    for (var i = 0; i < n; i++) {
      var pool = p.hand.filter(function (c) { return Ef().matchCard(cardDef(c.id), filter); });
      if (!pool.length) break;
      var c = pool[Math.floor(rand(state) * pool.length)];
      p.hand.splice(p.hand.indexOf(c), 1);
      p.discard.push(c);
      k++;
    }
    if (k) log(state, p.name + ' сбрасывает карт: ' + k + '.');
  }

  // Сбросить руку и взять столько же карт, подходящих под фильтр (из колоды и сброса)
  function refreshHand(state, pIdx, filter) {
    var p = state.players[pIdx], n = p.hand.length;
    p.discard = p.discard.concat(p.hand);
    p.hand = [];
    var pool = shuffle(state, p.deck.concat(p.discard)).filter(function (c) { return Ef().matchCard(cardDef(c.id), filter); });
    pool.slice(0, n).forEach(function (c) {
      var di = p.deck.indexOf(c);
      if (di >= 0) p.deck.splice(di, 1); else p.discard.splice(p.discard.indexOf(c), 1);
      p.hand.push(c);
    });
    log(state, p.name + ' обновляет руку.');
  }

  // ---------- Источники способностей ----------

  // Все источники: существа, чары на существах, чары на героях, свойства героев
  function sources(state) {
    var out = [];
    state.players.forEach(function (pl, i) {
      pl.field.forEach(function (u) {
        out.push({ def: cardDef(u.id), controller: u.owner, unit: u, sourceUid: u.uid });
        u.enchants.forEach(function (e) {
          out.push({ def: cardDef(e.id), controller: e.owner, ench: e, enchantedUid: u.uid, enchantedOwner: u.owner, holder: u.owner, sourceUid: e.uid });
        });
      });
      pl.enchants.forEach(function (e) {
        out.push({ def: cardDef(e.id), controller: e.owner, ench: e, holder: i, sourceUid: e.uid });
      });
      if (pl.passives.length) out.push({ def: { name: pl.name, abilities: pl.passives }, controller: i, passive: true });
    });
    return out;
  }

  function allEnchants(state) {
    var out = [];
    state.players.forEach(function (pl) {
      pl.enchants.forEach(function (e) { out.push(e); });
      pl.field.forEach(function (u) { u.enchants.forEach(function (e) { out.push(e); }); });
    });
    return out;
  }

  function findEnchant(state, uid) {
    for (var i = 0; i < state.players.length; i++) {
      var pl = state.players[i];
      for (var j = 0; j < pl.enchants.length; j++) if (pl.enchants[j].uid === uid) return { e: pl.enchants[j], list: pl.enchants, holder: i };
      for (var k = 0; k < pl.field.length; k++) {
        var u = pl.field[k];
        for (var m = 0; m < u.enchants.length; m++) if (u.enchants[m].uid === uid) return { e: u.enchants[m], list: u.enchants, unit: u, holder: i };
      }
    }
    return null;
  }

  function sourceCtx(src, extra) {
    var ctx = {
      sourceName: src.def.name, sourceUid: src.sourceUid, controller: src.controller, ench: src.ench,
      enchantedUid: src.enchantedUid, enchantedOwner: src.enchantedOwner, holder: src.holder
    };
    for (var k in extra) ctx[k] = extra[k];
    return ctx;
  }

  // Сработать всем способностям с триггером trig (test отбирает источники)
  function fire(state, trig, extra, test) {
    var list = [];
    sources(state).forEach(function (src) {
      src.def.abilities.forEach(function (ab) {
        if (ab.trigger === trig && (!test || test(src, ab))) list.push({ src: src, ab: ab });
      });
    });
    list.forEach(function (x) {
      if (state.winner !== null) return;
      Ef().run(state, x.src.controller, x.src.def, x.ab, sourceCtx(x.src, extra || {}));
    });
  }

  // Триггеры начала/конца хода: whose = owner | each | enchanted
  function fireTurn(state, trig) {
    fire(state, trig, {}, function (src, ab) {
      var w = ab.whose || 'owner';
      if (w === 'each') return true;
      if (w === 'enchanted') return src.holder === state.active;
      return src.controller === state.active;
    });
  }

  // Триггеры карт в могильнике
  function fireGrave(state, trig, players) {
    players.forEach(function (i) {
      state.players[i].graveyard.slice().forEach(function (c) {
        var def = cardDef(c.id);
        def.abilities.forEach(function (ab) {
          if (ab.trigger !== trig || state.winner !== null) return;
          if (!state.players[i].graveyard.some(function (x) { return x.uid === c.uid; })) return;
          Ef().run(state, i, def, ab, { sourceName: def.name, sourceUid: c.uid, controller: i, graveOwner: i });
        });
      });
    });
  }

  // ---------- Свойства героев и стоимость ----------

  // Модификаторы героя pIdx от постоянных свойств: лимит атаки, налог, каналы и т.п.
  function heroMods(state, pIdx) {
    var m = { attackLimit: 0, attackTax: 0, channels: 0, noEtherGain: false, etherThorns: false };
    sources(state).forEach(function (src) {
      src.def.abilities.forEach(function (ab) {
        if (ab.trigger !== 'static') return;
        var applies = ab.scope === 'allHeroes' ||
          (ab.scope === 'ownHero' && src.controller === pIdx) ||
          (ab.scope === 'enemyHero' && src.controller !== pIdx);
        if (!applies) return;
        if (ab.attackLimit) m.attackLimit = Math.max(m.attackLimit, ab.attackLimit);
        if (ab.attackTax) m.attackTax += ab.attackTax;
        if (ab.channels) m.channels += ab.channels;
        if (ab.noEtherGain) m.noEtherGain = true;
        if (ab.etherThorns) m.etherThorns = true;
      });
    });
    return m;
  }

  // Стоимость карты в руке игрока pIdx с учётом запретов и скидок
  function cardCost(state, pIdx, def) {
    var cost = def.cost, add = 0, mul = 1, min = 0;
    sources(state).forEach(function (src) {
      src.def.abilities.forEach(function (ab) {
        if (ab.trigger !== 'static' || !ab.costMod) return;
        if (ab.scope === 'ownHand' && src.controller !== pIdx) return;
        if (ab.scope !== 'ownHand' && ab.scope !== 'allHands') return;
        var cm = ab.costMod;
        if (cm.type && def.type !== cm.type) return;
        if (cm.race && def.race !== cm.race) return;
        if (cm.mul) mul *= cm.mul;
        if (cm.add) add += cm.add;
        if (cm.min) min = Math.max(min, cm.min);
      });
    });
    return Math.max(min, cost * mul + add, 0);
  }

  // ---------- Ход ----------

  function etherChannels(p) {
    var row = data.ether && data.ether[String(p.level)];
    var base = row ? row[Math.min(p.turns, row.length) - 1] : Math.ceil(p.turns * 0.7);
    return Math.max(0, base + p.bonusChannels);
  }

  function startTurn(state) {
    state.turn++;
    state.phase = 'main';
    var p = state.players[state.active], m = heroMods(state, state.active);
    p.turns++;
    p.channels = etherChannels(p) + m.channels;
    p.ether = m.noEtherGain ? 0 : p.channels;
    log(state, 'Ход ' + state.turn + ': ' + p.name + '. Эфир: ' + p.ether + '.');
    p.field.forEach(function (u) {
      u.sick = false;
      if (u.rested && !stats(state, u).kw.noUntap) u.rested = false;
    });
    if (state.turn > 1) draw(state, state.active, 1 + p.extraDraw);
    fireTurn(state, 'startOfTurn');
    fireGrave(state, 'startOfTurnInGrave', [state.active]);
    checkDeaths(state);
  }

  function endTurn(state) {
    fireTurn(state, 'endOfTurn');
    fireGrave(state, 'endOfTurnInGrave', [0, 1]);
    checkDeaths(state);
    state.players.forEach(function (pl) {
      pl.flags = {};
      pl.field.forEach(function (u) {
        if (!stats(state, u).flags.noHeal) u.damage = 0;
        u.temp = u.temp.filter(function (t) { return t.until > state.turn; });
        u.noRegenTurn = false;
      });
    });
    state.players[state.active].ether = 0;
    state.combat = null;
    state.fog = false;
    if (state.winner !== null) return;
    state.active = 1 - state.active;
    startTurn(state);
  }

  // ---------- Существа и характеристики ----------

  function findUnit(state, ref) {
    var uid = ref !== null && typeof ref === 'object' ? (ref.kind === 'unit' ? ref.uid : null) : ref;
    if (uid == null) return null;
    for (var i = 0; i < state.players.length; i++) {
      var f = state.players[i].field;
      for (var j = 0; j < f.length; j++) if (f[j].uid === uid) return f[j];
    }
    return null;
  }

  var FLAG_KEYS = ['noRegen', 'noHeal', 'noAbilities', 'redirectHero', 'absorbOnce', 'enterRested'];

  // Текущие сила, здоровье (максимум), ключевые слова и флаги с учётом всех модификаторов
  function stats(state, unit) {
    var def = cardDef(unit.id);
    var st = { atk: (def.atk || 0) + unit.perm.atk, hp: (def.hp || 0) + unit.perm.hp,
      kw: Ef().parseKeywords(def.keywords), flags: { magicShield: 0, combatShield: 0 } };
    var floor = false, setHp = null, swap = false;

    function val(v, e) {
      if (v === 'X') return e && e.x || 0;
      if (v === 'basePower') return def.atk || 0;
      return v || 0;
    }
    function apply(ab, e) {
      st.atk += val(ab.atk, e);
      st.hp += val(ab.hp, e);
      Ef().parseKeywords(ab.keywords, st.kw);
      FLAG_KEYS.forEach(function (k) { if (ab[k]) st.flags[k] = true; });
      if (ab.magicShield) st.flags.magicShield += ab.magicShield;
      if (ab.combatShield) st.flags.combatShield += ab.combatShield;
      if (ab.floorHp) floor = true;
      if (ab.setHp != null) setHp = ab.setHp;
      if (ab.swap) swap = true;
    }

    unit.enchants.forEach(function (e) {
      cardDef(e.id).abilities.forEach(function (ab) {
        if (ab.trigger === 'static' && ab.scope === 'enchanted') apply(ab, e);
      });
    });
    sources(state).forEach(function (src) {
      src.def.abilities.forEach(function (ab) {
        if (ab.trigger !== 'static' || ab.scope === 'enchanted') return;
        if (!Ef().scopeApplies(state, ab, src.controller, unit, src.ench && { hostUid: src.enchantedUid })) return;
        if (ab.unity) {
          var n = 0;
          state.players.forEach(function (pl) {
            pl.field.forEach(function (o) { if (o.uid !== unit.uid && cardDef(o.id).race === def.race) n++; });
          });
          st.atk += n; st.hp += n;
          return;
        }
        apply(ab, src.ench);
      });
    });
    unit.temp.forEach(function (m) { apply(m); });
    if (swap) { var t = st.atk; st.atk = st.hp; st.hp = t; }
    if (setHp != null) st.hp = setHp;
    st.atk = Math.max(0, st.atk);
    if (floor) st.hp = Math.max(1, st.hp);
    return st;
  }

  function newUnit(state, id, owner, uid) {
    return {
      uid: uid || state.seq++, id: id, owner: owner, damage: 0, rested: false, sick: true,
      enchants: [], temp: [], perm: { atk: 0, hp: 0 }, enteredTurn: state.turn, damagedTurn: 0
    };
  }

  // Существо входит в игру под началом pIdx
  function enterUnit(state, pIdx, id, uid) {
    var def = cardDef(id), u = newUnit(state, id, pIdx, uid);
    var kw = Ef().parseKeywords(def.keywords);
    u.sick = !kw.haste;
    state.players[pIdx].field.push(u);
    if (stats(state, u).flags.enterRested) u.rested = true;
    log(state, def.name + ' входит в игру (' + state.players[pIdx].name + ').');
    def.abilities.forEach(function (ab) {
      if (ab.trigger === 'onEnter') Ef().run(state, pIdx, def, ab, { sourceName: def.name, sourceUid: u.uid, controller: pIdx });
    });
    return u;
  }

  // Чары на герое holder от игрока owner
  function attachHero(state, holder, id, owner, uid, x) {
    var e = { uid: uid || state.seq++, id: id, owner: owner, x: x || 0, usedTurn: 0 };
    state.players[holder].enchants.push(e);
    log(state, 'Чары "' + cardDef(id).name + '" на герое ' + state.players[holder].name + '.');
    return e;
  }

  // ---------- Урон, лечение, смерть ----------

  function refName(state, ref) {
    if (!ref) return '?';
    if (ref.kind === 'hero') return state.players[ref.player].name;
    if (ref.kind === 'ench') { var f = findEnchant(state, ref.uid); return f ? cardDef(f.e.id).name : '?'; }
    if (ref.kind === 'grave') {
      var c = state.players[ref.player].graveyard.filter(function (x) { return x.uid === ref.uid; })[0];
      return c ? cardDef(c.id).name + ' (могильник)' : '?';
    }
    var u = findUnit(state, ref);
    return u ? cardDef(u.id).name : '?';
  }

  // Урон. src: { name, kind: 'magic'|'combat', unit, burnRegen, redirected, mirrored }
  function dealDamage(state, ref, n, src) {
    src = src || {};
    if (n <= 0 || state.winner !== null) return 0;
    if (ref.kind === 'hero') {
      var p = state.players[ref.player];
      var guard = p.field.filter(function (u) { return stats(state, u).flags.redirectHero; })[0];
      if (guard) return dealDamage(state, { kind: 'unit', uid: guard.uid }, n, src);
      if (p.flags.redirect && !src.redirected) {
        src.redirected = true;
        return dealDamage(state, { kind: 'hero', player: 1 - ref.player }, n, src);
      }
      p.hp -= n;
      log(state, (src.name ? src.name + ': ' : '') + p.name + ' получает ' + n + ' урона.');
      if (p.flags.mirror && !src.mirrored) {
        dealDamage(state, { kind: 'hero', player: 1 - ref.player }, n, { name: 'Резонанс', kind: 'magic', mirrored: true });
      }
      checkWinner(state);
      return n;
    }
    var u = findUnit(state, ref);
    if (!u) return 0;
    var st = stats(state, u);
    if (st.flags.absorbOnce) {
      u.enchants.filter(function (e) {
        return cardDef(e.id).abilities.some(function (ab) { return ab.absorbOnce; });
      }).slice(0, 1).forEach(function (e) { removeEnchant(state, e.uid); });
      log(state, cardDef(u.id).name + ': урон поглощён.');
      return 0;
    }
    n -= src.kind === 'combat' ? st.flags.combatShield : st.flags.magicShield;
    if (n <= 0) return 0;
    u.damage += n;
    u.damagedTurn = state.turn;
    if (src.burnRegen) u.noRegenTurn = true;
    log(state, (src.name ? src.name + ': ' : '') + cardDef(u.id).name + ' получает ' + n + ' урона.');
    var dmgRef = { kind: 'unit', uid: u.uid };
    fire(state, 'onEnchantedDamaged', { damage: n }, function (s) { return s.enchantedUid === u.uid; });
    if (src.unit) fire(state, 'onDamageCreature', { damaged: dmgRef }, function (s) { return s.sourceUid === src.unit.uid && !s.ench; });
    return n;
  }

  function heal(state, ref, n) {
    if (ref.kind === 'hero') {
      var p = state.players[ref.player];
      var before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + n);
      if (p.hp > before) log(state, p.name + ' восстанавливает ' + (p.hp - before) + ' здоровья.');
    } else {
      var u = findUnit(state, ref);
      if (u) u.damage = Math.max(0, u.damage - n);
    }
  }

  function checkWinner(state) {
    var dead = state.players.map(function (p) { return p.hp <= 0; });
    if (!dead[0] && !dead[1]) return;
    state.winner = dead[0] && dead[1] ? 'draw' : (dead[0] ? 1 : 0);
    state.phase = 'over';
    log(state, state.winner === 'draw' ? 'Ничья.' : 'Победа: ' + state.players[state.winner].name + '.');
  }

  // Убрать погибших. Регенерация N спасает, если у хозяина есть N эфира.
  function checkDeaths(state) {
    for (var guard = 0; guard < 20; guard++) {
      var dead = [];
      state.players.forEach(function (pl) {
        pl.field.forEach(function (u) {
          var st = stats(state, u);
          if (!u.doomed && u.damage < st.hp) return;
          var cost = st.kw.regen;
          if (cost && !st.flags.noRegen && !u.noRegenTurn && u.doomed !== 'noRegen' && pl.ether >= cost) {
            pl.ether -= cost;
            u.damage = 0;
            u.doomed = false;
            log(state, cardDef(u.id).name + ' регенерирует (' + cost + ' эфира).');
            fire(state, 'onRegen', {});
            return;
          }
          dead.push(u);
        });
      });
      if (!dead.length) return;
      dead.forEach(function (u) { if (findUnit(state, u.uid)) removeUnit(state, u, 'die'); });
    }
  }

  // Существо покидает игру: die (в могильник), exile (из игры), unsummon (в руку)
  function removeUnit(state, u, how) {
    var pl = state.players[u.owner], owner = u.origOwner != null ? u.origOwner : u.owner;
    var def = cardDef(u.id), snap = { hp: stats(state, u).hp, atk: stats(state, u).atk };
    pl.field.splice(pl.field.indexOf(u), 1);
    var card = { uid: u.uid, id: u.id };
    if (how === 'die') {
      state.players[owner].graveyard.push(card);
      log(state, def.name + ' погибает.');
    } else if (how === 'unsummon') {
      state.players[owner].hand.push(card);
      log(state, def.name + ' возвращается в руку.');
    } else {
      log(state, def.name + ' изгнан из игры.');
    }
    // чары на существе: сработать "при гибели", затем в сброс или в руку
    u.enchants.forEach(function (e) {
      if (how === 'die') {
        var edef = cardDef(e.id);
        edef.abilities.forEach(function (ab) {
          if (ab.trigger === 'onEnchantedDeath') {
            Ef().run(state, e.owner, edef, ab, { sourceName: edef.name, sourceUid: e.uid, controller: e.owner, ench: e,
              deadUid: u.uid, deadOwner: owner, enchantedSnap: snap });
          }
        });
      }
      state.players[e.owner][e.toHand ? 'hand' : 'discard'].push({ uid: e.uid, id: e.id });
    });
    if (how === 'die') fire(state, 'onAnyDeath', { deadOwner: owner });
    def.abilities.forEach(function (ab) {
      if (ab.trigger === 'onLeave') Ef().run(state, u.owner, def, ab, { sourceName: def.name, controller: u.owner });
    });
  }

  function removeEnchant(state, uid) {
    var f = findEnchant(state, uid);
    if (!f) return;
    f.list.splice(f.list.indexOf(f.e), 1);
    state.players[f.e.owner].discard.push({ uid: f.e.uid, id: f.e.id });
    log(state, 'Чары "' + cardDef(f.e.id).name + '" сняты.');
  }

  // Карта из могильника: в игру (под началом controller), в руку или из игры
  function fromGrave(state, ref, where, controller) {
    var g = state.players[ref.player].graveyard, c = null;
    for (var i = 0; i < g.length; i++) if (g[i].uid === ref.uid) c = g[i];
    if (!c) return null;
    g.splice(g.indexOf(c), 1);
    if (where === 'hand') {
      state.players[ref.player].hand.push(c);
      log(state, cardDef(c.id).name + ' возвращается из могильника в руку.');
    } else if (where === 'play') {
      var u = enterUnit(state, controller, c.id, c.uid);
      if (controller !== ref.player) u.origOwner = ref.player;
      return u;
    } else {
      log(state, cardDef(c.id).name + ' убран из могильника.');
    }
    return c;
  }

  // ---------- Оплата ----------

  function pay(state, pIdx, ether, life) {
    var p = state.players[pIdx];
    p.ether -= ether;
    if (life) dealDamage(state, { kind: 'hero', player: pIdx }, life, { name: 'Плата жизнью', kind: 'magic' });
    if (ether > 0 && heroMods(state, pIdx).etherThorns) {
      dealDamage(state, { kind: 'hero', player: pIdx }, ether, { name: 'Эфирные шипы', kind: 'magic' });
    }
  }

  function costEther(state, pIdx, v, x, ctx) {
    if (v === 'X') return x || 0;
    if (v && typeof v === 'object') return Ef().amount(state, pIdx, v, ctx || { controller: pIdx });
    return v || 0;
  }

  // ---------- Проверки для UI и ИИ ----------

  // Может ли игрок pIdx сейчас действовать (своя фаза розыгрыша или своя фаза защиты)
  function canAct(state, pIdx) {
    if (state.phase === 'main') return state.active === pIdx;
    if (state.phase === 'block') return state.active !== pIdx;
    return false;
  }

  function handCard(p, uid) {
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].uid === uid) return p.hand[i];
    return null;
  }

  function unitSnap(state, u) {
    if (!u) return null;
    var st = stats(state, u);
    return { atk: st.atk, hp: st.hp, cost: cardDef(u.id).cost, owner: u.owner };
  }

  // Можно ли сыграть карту (без проверки конкретной цели). x - доплата для карт с X.
  function canPlay(state, pIdx, handUid, x) {
    if (!canAct(state, pIdx)) return fail('Сейчас не ваш ход.');
    var p = state.players[pIdx], c = handCard(p, handUid);
    if (!c) return fail('Карты нет в руке.');
    var def = cardDef(c.id);
    if (def.impl === false) return fail('Эта карта пока не работает.');
    if (state.phase === 'block' && !def.blockPhase) return fail('В фазе блока эту карту нельзя.');
    if (state.phase === 'main' && def.blockPhase === 'only') return fail('Только в фазе блока.');
    var xv = def.xCost ? Math.max(1, x || 1) : 0;
    var ether = cardCost(state, pIdx, def) + (def.xCost === true ? xv : 0);
    if (ether > p.ether) return fail('Не хватает эфира.');
    if (def.xCost === 'life' && xv >= p.hp) return fail('Не хватает жизни.');
    if (def.sacrifice && !p.field.length) return fail('Нужно существо для жертвы.');
    if (def.target) {
      var ctx = { controller: pIdx, x: xv };
      if (!Ef().listTargets(state, pIdx, def.target, def.targetFilter, def.sacrifice ? null : ctx).length &&
          !(def.sacrifice && def.targetFilter && def.targetFilter.maxCost === 'sacCost')) {
        return fail('Нет подходящих целей.');
      }
    }
    if (def.attach === 'creature' && !def.target) return fail('Нет цели.');
    return OK;
  }

  // Может ли существо атаковать (без учёта команды и налога)
  function canAttack(state, u) {
    var st = stats(state, u);
    if (u.rested || u.sick || st.kw.noAttack) return false;
    var limit = heroMods(state, 1 - u.owner).attackLimit;
    return !(limit && st.atk <= limit);
  }

  function canBlock(state, blocker, attacker) {
    if (blocker.rested) return false;
    var b = stats(state, blocker).kw, a = stats(state, attacker).kw;
    var bWall = cardDef(blocker.id).race === 'wall';
    if (a.unblockable) return false;
    if (a.flying && !b.flying) return false;
    if (a.elusive && !bWall) return false;
    if (a.wallproof && bWall) return false;
    return true;
  }

  // Источник активируемой способности: своё существо или свои чары (на любом герое)
  function abilitySource(state, pIdx, uid) {
    var u = findUnit(state, uid);
    if (u && u.owner === pIdx) return { unit: u, id: u.id };
    var f = findEnchant(state, uid);
    if (f && f.e.owner === pIdx && !f.unit) return { ench: f.e, id: f.e.id, holder: f.holder };
    return null;
  }

  function canActivate(state, pIdx, sourceUid, abIdx, x) {
    if (!canAct(state, pIdx)) return fail('Сейчас не ваш ход.');
    var src = abilitySource(state, pIdx, sourceUid);
    if (!src) return fail('Нет такого источника.');
    var def = cardDef(src.id), ab = def.abilities[abIdx];
    if (!ab || ab.trigger !== 'activated' || ab.linked) return fail('Нет такой способности.');
    var cost = ab.cost || {};
    if (state.phase === 'block' && cost.notInBlock) return fail('Нельзя в фазе блока.');
    if (src.unit && stats(state, src.unit).flags.noAbilities) return fail('Существо не может использовать способности.');
    if (cost.rest && (src.unit.rested || src.unit.sick)) return fail('Существо отдыхает.');
    var ether = costEther(state, pIdx, cost.ether, Math.max(1, x || 1));
    if (ether > state.players[pIdx].ether) return fail('Не хватает эфира.');
    if (cost.life && cost.life >= state.players[pIdx].hp) return fail('Не хватает жизни.');
    var used = src.unit ? src.unit.usedTurn : src.ench.usedTurn;
    if (cost.once && used === state.turn) return fail('Уже использовано в этот ход.');
    if (cost.sacrifice && !state.players[pIdx].field.some(function (u) { return u.uid !== sourceUid; })) {
      return fail('Нужно существо для жертвы.');
    }
    var spec = Ef().chooseSpec(def, ab);
    if (spec && !Ef().listTargets(state, pIdx, spec, ab.filter, { controller: pIdx, x: Math.max(1, x || 1) }).length) {
      return fail('Нет подходящих целей.');
    }
    return OK;
  }

  // ---------- Действия ----------

  function checkSacrifice(state, pIdx, uid, notUid) {
    var u = findUnit(state, uid);
    return u && u.owner === pIdx && u.uid !== notUid ? u : null;
  }

  // opts: { target: ref, x: число, sacrifice: uid }
  function playCard(state, pIdx, handUid, opts) {
    opts = opts || {};
    var chk = canPlay(state, pIdx, handUid, opts.x);
    if (!chk.ok) return chk;
    var p = state.players[pIdx], c = handCard(p, handUid), def = cardDef(c.id);
    var x = def.xCost ? Math.max(1, opts.x || 1) : 0;
    var sacU = null;
    if (def.sacrifice) {
      sacU = checkSacrifice(state, pIdx, opts.sacrifice);
      if (!sacU) return fail('Выберите своё существо для жертвы.');
    }
    var ctx = { target: opts.target, x: x, sourceName: def.name, sourceUid: c.uid, controller: pIdx, sac: unitSnap(state, sacU) };
    if (def.target && !Ef().isValidTarget(state, pIdx, def.target, def.targetFilter, opts.target, ctx)) return fail('Неверная цель.');
    if (sacU && opts.target && opts.target.kind === 'unit' && opts.target.uid === sacU.uid) return fail('Жертва не может быть целью.');

    pay(state, pIdx, cardCost(state, pIdx, def) + (def.xCost === true ? x : 0), def.xCost === 'life' ? x : 0);
    p.hand.splice(p.hand.indexOf(c), 1);
    log(state, p.name + ' разыгрывает "' + def.name + '"' + (def.xCost ? ' (X=' + x + ')' : '') +
      (opts.target ? ' → ' + refName(state, opts.target) : '') + '.');
    ctx.targetSnap = opts.target && opts.target.kind === 'unit' ? unitSnap(state, findUnit(state, opts.target)) : null;
    if (sacU) { log(state, 'В жертву: ' + cardDef(sacU.id).name + '.'); removeUnit(state, sacU, 'die'); }

    if (def.type === 'creature') {
      enterUnit(state, pIdx, c.id, c.uid);
    } else if (def.type === 'enchantment') {
      if (def.attach === 'creature') {
        var host = findUnit(state, opts.target);
        if (host) host.enchants.push({ uid: c.uid, id: c.id, owner: pIdx, x: x, usedTurn: 0 });
        else p.discard.push(c);
      } else {
        var holder = def.target === 'hero' && opts.target ? opts.target.player : pIdx;
        attachHero(state, holder, c.id, pIdx, c.uid, x);
      }
    } else {
      p.discard.push(c);
    }
    def.abilities.forEach(function (ab) {
      if (ab.trigger === 'onPlay' && state.winner === null) {
        Ef().run(state, pIdx, def, ab, ctx);
      }
    });
    fire(state, 'onCast', {}, function (src, ab) {
      if (ab.by === 'enemy' && src.controller === pIdx) return false;
      if (ab.by === 'self' && src.controller !== pIdx) return false;
      if (ab.cardType === 'creature') return def.type === 'creature';
      if (ab.cardType === 'notCreature') return def.type !== 'creature';
      return true;
    });
    checkDeaths(state);
    return OK;
  }

  // opts: { target, x, sacrifice }
  function activate(state, pIdx, sourceUid, abIdx, opts) {
    opts = opts || {};
    var chk = canActivate(state, pIdx, sourceUid, abIdx, opts.x);
    if (!chk.ok) return chk;
    var src = abilitySource(state, pIdx, sourceUid), def = cardDef(src.id), ab = def.abilities[abIdx];
    var cost = ab.cost || {};
    var x = cost.ether === 'X' ? Math.max(1, opts.x || 1) : 0;
    var sacU = null;
    if (cost.sacrifice) {
      sacU = checkSacrifice(state, pIdx, opts.sacrifice, sourceUid);
      if (!sacU) return fail('Выберите своё существо для жертвы.');
    }
    var ctx = { target: opts.target, x: x, sourceName: def.name, sourceUid: sourceUid, controller: pIdx,
      sac: unitSnap(state, sacU), ench: src.ench, holder: src.holder };
    var spec = Ef().chooseSpec(def, ab);
    if (spec && !Ef().isValidTarget(state, pIdx, spec, ab.filter, opts.target, ctx)) return fail('Неверная цель.');

    if (src.unit) ctx.sourcePower = stats(state, src.unit).atk;
    pay(state, pIdx, costEther(state, pIdx, cost.ether, x, ctx), cost.life || 0);
    if (cost.rest) src.unit.rested = true;
    if (cost.once) (src.unit || src.ench).usedTurn = state.turn;
    ctx.targetSnap = opts.target && opts.target.kind === 'unit' ? unitSnap(state, findUnit(state, opts.target)) : null;
    log(state, def.name + ': способность' + (opts.target ? ' → ' + refName(state, opts.target) : '') + '.');
    if (sacU) { log(state, 'В жертву: ' + cardDef(sacU.id).name + '.'); removeUnit(state, sacU, 'die'); }
    if (cost.sacrificeSelf && src.unit) removeUnit(state, src.unit, ab.effect === 'fog' ? 'exile' : 'die');
    Ef().run(state, pIdx, def, ab, ctx);
    // связанные способности срабатывают вместе с этой
    for (var i = abIdx + 1; i < def.abilities.length && def.abilities[i].linked; i++) {
      Ef().run(state, pIdx, def, def.abilities[i], ctx);
    }
    return OK;
  }

  // Снять с существа чары с "release": хозяин существа платит эфир/жизнь
  function release(state, pIdx, enchUid) {
    if (!(state.phase === 'main' && state.active === pIdx)) return fail('Только в свою фазу розыгрыша.');
    var f = findEnchant(state, enchUid);
    if (!f || !f.unit || f.unit.owner !== pIdx) return fail('Нет таких чар.');
    var rel = cardDef(f.e.id).release;
    if (!rel) return fail('Эти чары нельзя снять.');
    if ((rel.ether || 0) > state.players[pIdx].ether) return fail('Не хватает эфира.');
    if ((rel.life || 0) >= state.players[pIdx].hp) return fail('Не хватает жизни.');
    pay(state, pIdx, rel.ether || 0, rel.life || 0);
    if (rel.keep) {
      f.unit.rested = false;
      log(state, cardDef(f.unit.id).name + ' поднимается, несмотря на чары.');
    } else {
      removeEnchant(state, enchUid);
    }
    return OK;
  }

  // Объявить атакующих (uid в порядке очереди). Берсерки добавляются сами. Пусто - конец хода.
  function declareAttack(state, pIdx, uids) {
    if (!(state.phase === 'main' && state.active === pIdx)) return fail('Сейчас не ваша фаза розыгрыша.');
    var p = state.players[pIdx], list = [];
    for (var i = 0; i < (uids || []).length; i++) {
      var u = findUnit(state, uids[i]);
      if (!u || u.owner !== pIdx || !canAttack(state, u)) return fail('Это существо не может атаковать.');
      if (list.indexOf(u.uid) < 0) list.push(u.uid);
    }
    p.field.forEach(function (u) {
      if (list.indexOf(u.uid) < 0 && stats(state, u).kw.berserk && canAttack(state, u)) list.push(u.uid);
    });
    // командные бойцы атакуют только с другим существом своей породы
    var bad = list.filter(function (uid) {
      var u = findUnit(state, uid);
      if (!stats(state, u).kw.teamAttack) return false;
      var race = cardDef(u.id).race;
      return !list.some(function (o) { return o !== uid && cardDef(findUnit(state, o).id).race === race; });
    });
    if (bad.length) {
      if (uids && uids.some(function (x) { return bad.indexOf(x) >= 0; })) return fail('Это существо атакует только вместе с сородичем.');
      list = list.filter(function (x) { return bad.indexOf(x) < 0; });
    }
    var tax = heroMods(state, 1 - pIdx).attackTax * list.length;
    if (tax > p.ether) return fail('Атака стоит ' + tax + ' эфира.');
    if (!list.length) {
      log(state, p.name + ' не атакует.');
      endTurn(state);
      return OK;
    }
    if (tax) pay(state, pIdx, tax, 0);
    list.forEach(function (uid) {
      var u = findUnit(state, uid);
      if (!stats(state, u).kw.restless) u.rested = true;
    });
    state.combat = { attackers: list, blocks: {} };
    state.phase = 'block';
    log(state, p.name + ' атакует: ' + list.map(function (uid) { return refName(state, { kind: 'unit', uid: uid }); }).join(', ') + '.');
    return OK;
  }

  function endTurnAction(state, pIdx) {
    return declareAttack(state, pIdx, []);
  }

  // Назначить блоки: { uidАтакующего: uidБлокирующего }. Затем схватки и конец хода.
  function declareBlocks(state, pIdx, blocks) {
    if (state.phase !== 'block' || state.active === pIdx) return fail('Сейчас не ваша фаза блока.');
    blocks = blocks || {};
    var used = {};
    for (var aUid in blocks) {
      var a = findUnit(state, Number(aUid)), b = findUnit(state, blocks[aUid]);
      if (!a || state.combat.attackers.indexOf(a.uid) < 0) return fail('Это существо не атакует.');
      if (!b || b.owner !== pIdx || used[b.uid] || !canBlock(state, b, a)) return fail('Недопустимый блок.');
      used[b.uid] = true;
    }
    state.combat.blocks = {};
    for (var k in blocks) state.combat.blocks[k] = blocks[k];
    resolveCombat(state);
    if (state.winner === null) endTurn(state);
    return OK;
  }

  // ---------- Схватки ----------

  function resolveCombat(state) {
    var def = 1 - state.active;
    if (state.fog) { log(state, 'Туман: схватки без урона.'); return; }
    state.combat.attackers.forEach(function (aUid) {
      if (state.winner !== null) return;
      var a = findUnit(state, aUid);
      if (!a) return;
      var b = findUnit(state, state.combat.blocks[aUid]);
      if (b && b.owner !== def) b = null;
      if (!b) hitHero(state, a, stats(state, a).atk);
      else fight(state, a, b);
    });
  }

  function hitHero(state, a, n) {
    var target = 1 - a.owner;
    var dealt = dealDamage(state, { kind: 'hero', player: target }, n, { name: cardDef(a.id).name, kind: 'combat', unit: a });
    if (!dealt) return;
    var st = stats(state, a);
    if (st.kw.lifetap) heal(state, { kind: 'hero', player: a.owner }, dealt);
    if (st.kw.discard) discard(state, target, st.kw.discard);
    fire(state, 'onHitHero', { hitHero: target }, function (s) { return s.sourceUid === a.uid && !s.ench; });
  }

  // Удар x по y. Прорыв переносит излишек урона герою (только для атакующего).
  function strike(state, x, y, isAttacker) {
    var sx = stats(state, x), n = sx.atk;
    if (n <= 0) return;
    var left = Math.max(0, stats(state, y).hp - y.damage);
    var dealt = dealDamage(state, { kind: 'unit', uid: y.uid }, n, { name: cardDef(x.id).name, kind: 'combat', unit: x, burnRegen: sx.kw.burnRegen });
    if (dealt > 0) {
      var yWall = cardDef(y.id).race === 'wall', yFly = stats(state, y).kw.flying;
      if (sx.kw.poison || sx.kw.deadly || (sx.kw.deadlyFlying && yFly) || (sx.kw.deadlyNonWall && !yWall)) y.poisoned = true;
    }
    if (isAttacker && sx.kw.trample && n > left) hitHero(state, x, n - left);
  }

  function stripEnchants(state, u) {
    if (!u.enchants.length) return;
    u.enchants.slice().forEach(function (e) { removeEnchant(state, e.uid); });
  }

  function fight(state, a, b) {
    log(state, 'Схватка: ' + cardDef(a.id).name + ' против ' + cardDef(b.id).name + '.');
    if (stats(state, a).kw.disenchant) stripEnchants(state, b);
    if (stats(state, b).kw.disenchant) stripEnchants(state, a);
    var bFirst = stats(state, b).kw.firstStrike && !stats(state, a).kw.firstStrike;
    var first = bFirst ? b : a, second = bFirst ? a : b;
    strike(state, first, second, !bFirst);
    checkDeaths(state);
    if (findUnit(state, second.uid) && findUnit(state, first.uid) && state.winner === null) {
      strike(state, second, first, bFirst);
      checkDeaths(state);
    }
    [a, b].forEach(function (u) {
      if (u.poisoned) { u.poisoned = false; if (findUnit(state, u.uid)) u.doomed = true; }
    });
    checkDeaths(state);
  }

  // ---------- Бесплатное колдовство (сценарии боссов) ----------

  function castFree(state, pIdx, id) {
    if (!hasCard(id)) return;
    var def = cardDef(id);
    log(state, state.players[pIdx].name + ' призывает силу: "' + def.name + '".');
    if (def.type === 'creature') { enterUnit(state, pIdx, id); return; }
    var target = null;
    if (def.target) {
      var refs = Ef().listTargets(state, pIdx, def.target, def.targetFilter, { controller: pIdx, x: 3 });
      var harmful = def.abilities.some(function (ab) { return Ef().HARMFUL[ab.effect]; });
      var mine = function (r) {
        if (r.kind === 'hero' || r.kind === 'grave') return r.player === pIdx;
        var u = findUnit(state, r);
        return u ? u.owner === pIdx : false;
      };
      var pref = refs.filter(function (r) { return harmful ? !mine(r) : mine(r); });
      var pool = pref.length ? pref : refs;
      if (!pool.length) return;
      target = pool[Math.floor(rand(state) * pool.length)];
    }
    var uid = state.seq++;
    if (def.type === 'enchantment') {
      if (def.attach === 'creature') {
        var host = findUnit(state, target);
        if (!host) return;
        host.enchants.push({ uid: uid, id: id, owner: pIdx, x: 3, usedTurn: 0 });
      } else {
        attachHero(state, def.target === 'hero' && target ? target.player : pIdx, id, pIdx, uid, 3);
      }
    }
    var ctx = { target: target, x: 3, sourceName: def.name, sourceUid: uid, controller: pIdx,
      targetSnap: target && target.kind === 'unit' ? unitSnap(state, findUnit(state, target)) : null };
    def.abilities.forEach(function (ab) {
      if (ab.trigger === 'onPlay' && state.winner === null) Ef().run(state, pIdx, def, ab, ctx);
    });
    checkDeaths(state);
  }

  AD.Engine = {
    HAND_LIMIT: HAND_LIMIT,
    setData: setData,
    cardDef: cardDef,
    hasCard: hasCard,
    create: create,
    clone: clone,
    heroHp: heroHp,
    stats: stats,
    heroMods: heroMods,
    cardCost: cardCost,
    findUnit: findUnit,
    findEnchant: findEnchant,
    allEnchants: allEnchants,
    refName: refName,
    canAct: canAct,
    canPlay: canPlay,
    canAttack: canAttack,
    canBlock: canBlock,
    canActivate: canActivate,
    playCard: playCard,
    activate: activate,
    release: release,
    declareAttack: declareAttack,
    declareBlocks: declareBlocks,
    endTurn: endTurnAction,
    // для effects.js
    log: log,
    draw: draw,
    discard: discard,
    refreshHand: refreshHand,
    dealDamage: dealDamage,
    heal: heal,
    checkDeaths: checkDeaths,
    removeUnit: removeUnit,
    removeEnchant: removeEnchant,
    fromGrave: fromGrave,
    enterUnit: enterUnit,
    attachHero: attachHero,
    castFree: castFree
  };
})(window.AD = window.AD || {});
