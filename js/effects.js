// Система способностей: триггер -> условие -> цель -> эффект. Чистая логика, без DOM.
// Формат способностей описан в tools/cards_spec.py. Цели с выбором игрока приходят в ctx.target,
// групповые вычисляются здесь. Ссылки на цели:
//   { kind: 'unit', uid } | { kind: 'hero', player } | { kind: 'ench', uid } | { kind: 'grave', player, uid }
(function (AD) {
  'use strict';

  function E() { return AD.Engine; }

  // Цели, которые выбирает игрок
  var CHOSEN = {
    creature: 1, enemyCreature: 1, friendlyCreature: 1, creatureOrHero: 1, hero: 1,
    enchantment: 1, graveCreature: 1, anyGraveCreature: 1, attackingCreature: 1
  };

  // Вредные эффекты: при автоматическом выборе цели (бесплатное колдовство босса) бьют по врагу
  var HARMFUL = {
    damage: 1, destroy: 1, exile: 1, rest: 1, unsummon: 1, selfHarm: 1, discard: 1,
    burnEther: 1, stealEther: 1, drainLife: 1, destroyEnchantment: 1, sacrificeTarget: 0, gainControl: 1, cleave: 1, paleBlast: 1
  };

  // ---------- Ключевые слова ----------

  // ["flying", "regen:1"] -> { flying: true, regen: 1 }
  function parseKeywords(list, into) {
    var kw = into || {};
    (list || []).forEach(function (k) {
      var p = k.split(':');
      kw[p[0]] = p.length > 1 ? Number(p[1]) : true;
    });
    return kw;
  }

  // ---------- Количества ----------

  function countOf(state, pIdx, spec, ctx, targetRef) {
    var n = 0, f = spec.filter;
    function units(side) {
      state.players.forEach(function (pl, i) {
        if (side === 'friendly' && i !== pIdx) return;
        if (side === 'enemy' && i === pIdx) return;
        pl.field.forEach(function (u) { if (!f || matchFilter(state, u, f, ctx, true)) n++; });
      });
    }
    switch (spec.count) {
      case 'friendly': case 'enemy': case 'all': units(spec.count); break;
      case 'targetGraveyard': n = targetRef && targetRef.kind === 'hero' ? state.players[targetRef.player].graveyard.length : 0; break;
      case 'targetHandOver5': n = targetRef && targetRef.kind === 'hero' ? Math.max(0, state.players[targetRef.player].hand.length - 5) : 0; break;
      case 'ownGraveyard': n = state.players[pIdx].graveyard.length; break;
      case 'targetPaleAspect':
        n = targetRef && targetRef.kind === 'hero' ? state.players[targetRef.player].field.filter(function (u) { return u.pale; }).length : 0;
        break;
    }
    return n * (spec.mult || 1) + (spec.add || 0);
  }

  // Значение количества: число, 'X', 'power', {count}, снимки жертвы и цели
  function amount(state, pIdx, v, ctx, targetRef) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object') return countOf(state, pIdx, v, ctx, targetRef);
    var snap = ctx.targetSnap || {}, sac = ctx.sac || {};
    switch (v) {
      case 'X': return ctx.x || 0;
      case 'X+4': return (ctx.x || 0) + 4;
      case 'power': { var src = E().findUnit(state, ctx.sourceUid); return src ? E().stats(state, src).atk : (ctx.sourcePower || 0); }
      case 'targetPower': return snap.atk || 0;
      case 'targetToughness': return snap.hp || 0;
      case 'sacPower': return sac.atk || 0;
      case 'sacToughness': return sac.hp || 0;
      case 'sacSum': return (sac.atk || 0) + (sac.hp || 0);
      case 'sacCost': return sac.cost || 0;
      case 'activeEther': return state.players[state.active].ether;
      case 'ownChannels': return state.players[pIdx].channels;
      case 'damage': return ctx.damage || 0;
      case 'enchantedToughness': return ctx.enchantedSnap ? ctx.enchantedSnap.hp : 0;
      case 'castCost': return ctx.castCost || 0;
      case 'castEther': return ctx.castEther || 0;
    }
    return 0;
  }

  // ---------- Фильтры ----------

  // Подходит ли существо под фильтр. base: использовать ключевые слова карты без модификаторов
  function matchFilter(state, u, f, ctx, base) {
    if (!f) return true;
    var def = E().cardDef(u.id);
    var kw = base ? parseKeywords(def.keywords) : E().stats(state, u).kw;
    var st = base ? { atk: def.atk, hp: def.hp } : E().stats(state, u);
    var pIdx = ctx && ctx.controller != null ? ctx.controller : u.owner;
    function val(v) { return amount(state, pIdx, v, ctx || {}); }
    if (f.race && def.race !== f.race) return false;
    if (f.notRace && def.race === f.notRace) return false;
    if (f.code && def.code !== f.code) return false;
    if (f.notCode && def.code === f.notCode) return false;
    if (f.keyword && !kw[f.keyword]) return false;
    if (f.notKeyword && kw[f.notKeyword]) return false;
    if (f.maxCost != null && def.cost > val(f.maxCost)) return false;
    if (f.minAtk != null && st.atk < val(f.minAtk)) return false;
    if (f.maxAtk != null && st.atk > val(f.maxAtk)) return false;
    if (f.maxHp != null && st.hp > val(f.maxHp)) return false;
    if (f.rested && !u.rested) return false;
    if (f.aspect === 'pale' && !u.pale) return false;
    if (f.aspect === 'bright' && u.pale) return false;
    if (f.ltSourceAtk || f.ltSourceHp) {
      var src = ctx && E().findUnit(state, ctx.sourceUid);
      if (!src) return false;
      var ss = E().stats(state, src);
      if (f.ltSourceAtk && !(st.atk < ss.atk)) return false;
      if (f.ltSourceHp && !(st.hp < ss.hp)) return false;
    }
    if (f.sameRaceAsTarget) {
      var tu = ctx && ctx.target && E().findUnit(state, ctx.target);
      if (!tu || E().cardDef(tu.id).race !== def.race) return false;
    }
    return true;
  }

  // Существо в бледном аспекте видно только эффектам, которые явно его ищут
  function aspectVisible(u, f) {
    return !u.pale || (f && (f.aspect === 'pale' || f.aspect === 'any'));
  }

  function matchCard(def, f) {
    if (!f) return true;
    if (f.type && def.type !== f.type) return false;
    if (f.notType && def.type === f.notType) return false;
    if (f.race && def.race !== f.race) return false;
    if (f.maxCost != null && typeof f.maxCost === 'number' && def.cost > f.maxCost) return false;
    if (f.code && def.code !== f.code) return false;
    return true;
  }

  // ---------- Цели ----------

  // Цель выбирает игрок только при розыгрыше карты и у активируемых способностей
  function chooseSpec(def, ab) {
    if (ab.trigger !== 'onPlay' && ab.trigger !== 'activated') return null;
    var t = ab.target === 'chosen' ? def.target : ab.target;
    return CHOSEN[t] ? t : null;
  }

  // Фильтр выбора: у карты targetFilter, у способности filter
  function chooseFilter(def, ab) {
    return ab.trigger === 'onPlay' ? def.targetFilter : (ab.filter || null);
  }

  // Допустимые цели выбора для игрока pIdx. ctx нужен для фильтров с X и жертвой.
  function listTargets(state, pIdx, spec, filter, ctx) {
    var out = [];
    ctx = ctx || { controller: pIdx };
    function unitOk(u) {
      var st = E().stats(state, u);
      return !st.kw.untargetable && aspectVisible(u, filter) && matchFilter(state, u, filter, ctx);
    }
    switch (spec) {
      case 'creature': case 'enemyCreature': case 'friendlyCreature': case 'creatureOrHero':
        state.players.forEach(function (pl, i) {
          if (spec === 'enemyCreature' && i === pIdx) return;
          if (spec === 'friendlyCreature' && i !== pIdx) return;
          pl.field.forEach(function (u) { if (unitOk(u)) out.push({ kind: 'unit', uid: u.uid }); });
        });
        if (spec === 'creatureOrHero') out.push({ kind: 'hero', player: pIdx }, { kind: 'hero', player: 1 - pIdx });
        break;
      case 'hero':
        out.push({ kind: 'hero', player: pIdx }, { kind: 'hero', player: 1 - pIdx });
        break;
      case 'attackingCreature':
        if (state.combat) state.combat.attackers.forEach(function (uid) {
          var u = E().findUnit(state, uid);
          if (u && unitOk(u)) out.push({ kind: 'unit', uid: uid });
        });
        break;
      case 'enchantment':
        E().allEnchants(state).forEach(function (e) {
          var def = E().cardDef(e.id);
          if (filter && filter.maxCost != null && def.cost > amount(state, pIdx, filter.maxCost, ctx)) return;
          out.push({ kind: 'ench', uid: e.uid });
        });
        break;
      case 'graveCreature': case 'anyGraveCreature':
        state.players.forEach(function (pl, i) {
          if (spec === 'graveCreature' && i !== pIdx) return;
          pl.graveyard.forEach(function (c) {
            var def = E().cardDef(c.id);
            if (filter && filter.maxCost != null && def.cost > amount(state, pIdx, filter.maxCost, ctx)) return;
            if (filter && !matchCard(def, { race: filter.race, code: filter.code })) return;
            out.push({ kind: 'grave', player: i, uid: c.uid });
          });
        });
        break;
    }
    return out;
  }

  function sameRef(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'hero') return a.player === b.player;
    return a.uid === b.uid;
  }

  function isValidTarget(state, pIdx, spec, filter, ref, ctx) {
    return listTargets(state, pIdx, spec, filter, ctx).some(function (r) { return sameRef(r, ref); });
  }

  function unitRefs(state, test, filter, ctx) {
    var out = [];
    state.players.forEach(function (pl, i) {
      pl.field.forEach(function (u) {
        if (test(i) && aspectVisible(u, filter) && matchFilter(state, u, filter, ctx)) out.push({ kind: 'unit', uid: u.uid });
      });
    });
    return out;
  }

  // Цели способности: выбранная или групповая
  function resolveTargets(state, pIdx, def, ab, ctx) {
    if (chooseSpec(def, ab)) return ctx.target ? [ctx.target] : [];
    var f = ab.filter;
    switch (ab.target) {
      case 'allCreatures':         return unitRefs(state, function () { return true; }, f, ctx);
      case 'allEnemyCreatures':    return unitRefs(state, function (i) { return i !== pIdx; }, f, ctx);
      case 'allFriendlyCreatures': return unitRefs(state, function (i) { return i === pIdx; }, f, ctx);
      case 'enemyHero':            return [{ kind: 'hero', player: 1 - pIdx }];
      case 'bothHeroes':           return [{ kind: 'hero', player: state.active }, { kind: 'hero', player: 1 - state.active }];
      case 'activeHero':           return [{ kind: 'hero', player: state.active }];
      case 'self':                 return ctx.sourceUid != null ? [{ kind: 'unit', uid: ctx.sourceUid }] : [];
      case 'enchanted':            return ctx.enchantedUid != null ? [{ kind: 'unit', uid: ctx.enchantedUid }] : [];
      case 'enchantedController':  return ctx.enchantedOwner != null ? [{ kind: 'hero', player: ctx.enchantedOwner }] : [];
      case 'enchantedHero':        return ctx.holder != null ? [{ kind: 'hero', player: ctx.holder }] : [];
      case 'deadOwner':            return ctx.deadOwner != null ? [{ kind: 'hero', player: ctx.deadOwner }] : [];
      case 'hitHero':              return ctx.hitHero != null ? [{ kind: 'hero', player: ctx.hitHero }] : [];
      case 'damaged':              return ctx.damaged ? [ctx.damaged] : [];
      case 'targetController':     return ctx.targetSnap ? [{ kind: 'hero', player: ctx.targetSnap.owner }] : [];
      case 'lastGraveCreature': {
        var g = state.players[pIdx].graveyard;
        return g.length ? [{ kind: 'grave', player: pIdx, uid: g[g.length - 1].uid }] : [];
      }
      case 'ownHero':
      default:                     return [{ kind: 'hero', player: pIdx }];
    }
  }

  // ---------- Условия ----------

  function conditionOk(state, pIdx, ab, ctx) {
    if (ab.every && state.players[pIdx].turns % ab.every !== 0) return false;
    var c = ab.condition;
    if (!c) return true;
    if (c.enemyMoreChannels && !(state.players[1 - pIdx].channels > state.players[pIdx].channels)) return false;
    if (c.activeNotEnchantedOwner && state.active === ctx.enchantedOwner) return false;
    if (c.castType && ctx.castType !== c.castType) return false;
    if (c.castXCost && !ctx.castX) return false;
    if (c.notDamaged || c.notNew) {
      var u = E().findUnit(state, ctx.sourceUid);
      if (!u) return false;
      if (c.notDamaged && u.damagedTurn === state.turn) return false;
      if (c.notNew && u.enteredTurn === state.turn) return false;
    }
    if (c.creaturesAbove != null) {
      var g = state.players[ctx.graveOwner].graveyard, i = -1;
      g.forEach(function (x, k) { if (x.uid === ctx.sourceUid) i = k; });
      if (i < 0) return false;
      var above = g.slice(i + 1).filter(function (x) { return E().cardDef(x.id).type === 'creature'; }).length;
      if (above < c.creaturesAbove) return false;
    }
    return true;
  }

  // ---------- Эффекты ----------
  // Каждый получает (state, pIdx, ref, n, ab, ctx)

  function unitOf(s, ref) { return E().findUnit(s, ref); }

  var EFFECTS = {
    damage: function (s, p, ref, n, ab, ctx) {
      E().dealDamage(s, ref, n, { name: ctx.sourceName, kind: 'magic' });
    },
    heal: function (s, p, ref, n) { E().heal(s, ref, n); },
    setLife: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      var pl = s.players[ref.player];
      pl.hp = Math.max(1, n);
      E().log(s, pl.name + ': здоровье становится ' + pl.hp + '.');
    },
    gainEther: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      s.players[ref.player].ether += n;
      E().log(s, s.players[ref.player].name + ' получает ' + n + ' эфира.');
    },
    gainChannels: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      var pl = s.players[ref.player];
      pl.bonusChannels += n;
      pl.channels = Math.max(0, pl.channels + n);
      E().log(s, pl.name + (n >= 0 ? ' получает' : ' теряет') + ' эфирных каналов: ' + Math.abs(n) + '.');
    },
    stealEther: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      var from = s.players[ref.player], k = Math.min(n, from.ether);
      from.ether -= k;
      s.players[p].ether += k;
      E().log(s, s.players[p].name + ' крадёт ' + k + ' эфира.');
    },
    burnEther: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      var from = s.players[ref.player], k = Math.min(n, from.ether);
      from.ether -= k;
      E().dealDamage(s, ref, k, { name: 'Сгоревший эфир', kind: 'magic' });
    },
    drainLife: function (s, p, ref, n, ab, ctx) {
      var dealt = E().dealDamage(s, ref, n, { name: ctx.sourceName, kind: 'magic' });
      if (dealt && s.fx) s.fx.push({ t: 'drain', from: ref, to: { kind: 'hero', player: p } });
      if (dealt) E().heal(s, { kind: 'hero', player: p }, dealt);
    },
    draw: function (s, p, ref, n) { if (ref.kind === 'hero') E().draw(s, ref.player, n); },
    extraDraw: function (s, p, ref, n) { if (ref.kind === 'hero') s.players[ref.player].extraDraw += n; },
    discard: function (s, p, ref, n, ab) { if (ref.kind === 'hero') E().discard(s, ref.player, n, ab.cardFilter); },
    refreshHand: function (s, p, ref, n, ab) { if (ref.kind === 'hero') E().refreshHand(s, ref.player, ab.cardFilter); },
    destroy: function (s, p, ref, n, ab) {
      var u = unitOf(s, ref);
      if (u) u.doomed = ab.noRegen ? 'noRegen' : true;
    },
    sacrificeTarget: function (s, p, ref) {
      var u = unitOf(s, ref);
      if (u) u.doomed = 'noRegen';
    },
    exile: function (s, p, ref) {
      var u = unitOf(s, ref);
      if (u) E().removeUnit(s, u, 'exile');
    },
    selfHarm: function (s, p, ref) {
      var u = unitOf(s, ref);
      if (!u) return;
      var n = E().stats(s, u).atk;
      u.noRegenTurn = true;
      E().dealDamage(s, ref, n, { name: 'Голод', kind: 'magic' });
    },
    unsummon: function (s, p, ref) {
      var u = unitOf(s, ref);
      if (u) E().removeUnit(s, u, 'unsummon');
    },
    // Временное усиление (до конца хода или до конца следующего хода)
    buff: function (s, p, ref, n, ab, ctx) {
      var u = unitOf(s, ref);
      if (!u) return;
      u.temp.push({
        atk: amount(s, p, ab.atk, ctx), hp: amount(s, p, ab.hp, ctx), keywords: ab.keywords || [],
        until: s.turn + (ab.duration === 'nextTurn' ? 1 : 0)
      });
    },
    permBuff: function (s, p, ref, n, ab, ctx) {
      var u = unitOf(s, ref);
      if (!u) return;
      u.perm.atk += amount(s, p, ab.atk, ctx);
      u.perm.hp += amount(s, p, ab.hp, ctx);
    },
    rest: function (s, p, ref) { var u = unitOf(s, ref); if (u) u.rested = true; },
    wake: function (s, p, ref) { var u = unitOf(s, ref); if (u) u.rested = false; },
    // Из могильника в игру под началом p
    reanimate: function (s, p, ref) { if (ref.kind === 'grave') E().fromGrave(s, ref, 'play', p); },
    regrave: function (s, p, ref) { if (ref.kind === 'grave') E().fromGrave(s, ref, 'hand', ref.player); },
    exileGrave: function (s, p, ref, n) {
      if (ref.kind === 'grave') { E().fromGrave(s, ref, 'exile'); return; }
      if (ref.kind !== 'hero') return;
      var g = s.players[ref.player].graveyard;
      for (var i = 0; i < n && g.length; i++) E().fromGrave(s, { kind: 'grave', player: ref.player, uid: g[g.length - 1].uid }, 'exile');
    },
    reanimateSelf: function (s, p, ref, n, ab, ctx) {
      E().fromGrave(s, { kind: 'grave', player: ctx.graveOwner, uid: ctx.sourceUid }, 'play', ctx.graveOwner);
    },
    reanimateUnder: function (s, p, ref, n, ab, ctx) {
      if (ctx.deadUid == null) return;
      E().fromGrave(s, { kind: 'grave', player: ctx.deadOwner, uid: ctx.deadUid }, 'play', p);
    },
    returnSelfToHand: function (s, p, ref, n, ab, ctx) {
      if (ctx.graveOwner != null) { E().fromGrave(s, { kind: 'grave', player: ctx.graveOwner, uid: ctx.sourceUid }, 'hand', ctx.graveOwner); return; }
      if (ctx.ench) ctx.ench.toHand = true;
    },
    destroyEnchantment: function (s, p, ref) { if (ref.kind === 'ench') E().removeEnchant(s, ref.uid); },
    removeAllEnchantments: function (s) {
      E().allEnchants(s).forEach(function (e) { E().removeEnchant(s, e.uid); });
    },
    annihilate: function (s) {
      var power = [0, 0];
      s.players.forEach(function (pl, i) {
        pl.field.forEach(function (u) { power[i] += E().stats(s, u).atk; u.doomed = true; });
      });
      E().checkDeaths(s);
      s.players.forEach(function (pl, i) {
        E().dealDamage(s, { kind: 'hero', player: i }, power[1 - i], { name: 'Аннигиляция', kind: 'magic' });
      });
    },
    summon: function (s, p, ref, n, ab) {
      for (var i = 0; i < (n || 1); i++) E().enterUnit(s, p, ab.card);
    },
    cloneCreature: function (s, p, ref) {
      var u = unitOf(s, ref);
      if (u) E().enterUnit(s, p, u.id);
    },
    attachEnchant: function (s, p, ref, n, ab) {
      if (ref.kind === 'hero') E().attachHero(s, ref.player, ab.card, p);
    },
    heroFlag: function (s, p, ref, n, ab) {
      if (ref.kind === 'hero') s.players[ref.player].flags[ab.flag] = true;
    },
    fog: function (s) {
      s.fog = true;
      E().log(s, 'Туман: в этот ход существа не наносят урон в схватках.');
    },
    // Плата за чары в начале хода: нет эфира - чары исчезают
    upkeep: function (s, p, ref, n, ab, ctx) {
      var pl = s.players[p];
      if (pl.ether >= n) { pl.ether -= n; return; }
      if (ctx.ench) E().removeEnchant(s, ctx.ench.uid);
    },
    creatureUpkeep: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      var pl = s.players[ref.player];
      pl.ether = Math.max(0, pl.ether - pl.field.length * n);
    },
    // Вытянуть эфир у героя и вылечить своего на столько же
    drainEther: function (s, p, ref, n) {
      if (ref.kind !== 'hero') return;
      var from = s.players[ref.player], k = Math.min(n, from.ether);
      from.ether -= k;
      if (k) E().heal(s, { kind: 'hero', player: p }, k);
    },
    // Копия чар в руку
    copyEnchantToHand: function (s, p, ref) {
      if (ref.kind !== 'ench') return;
      var f = E().findEnchant(s, ref.uid);
      if (!f) return;
      s.players[p].hand.push({ uid: s.seq++, id: f.e.id });
      E().log(s, s.players[p].name + ' получает копию чар "' + E().cardDef(f.e.id).name + '".');
    },
    // Аспекты бледных существ
    dissipate: function (s, p, ref) { var u = unitOf(s, ref); if (u) E().setAspect(s, u, true); },
    manifest: function (s, p, ref) { var u = unitOf(s, ref); if (u) E().setAspect(s, u, false); },
    toggleAspect: function (s, p, ref) { var u = unitOf(s, ref); if (u) E().setAspect(s, u, !u.pale); },
    // Проявиться со стороной X/X
    manifestAs: function (s, p, ref, n) {
      var u = unitOf(s, ref);
      if (!u || !u.pale) return;
      var def = E().cardDef(u.id);
      u.perm.atk = n - (def.atk || 0);
      u.perm.hp = n - (def.hp || 0);
      E().setAspect(s, u, false, true);
    },
    gainControl: function (s, p, ref) { var u = unitOf(s, ref); if (u) E().changeControl(s, u, p); },
    giveControl: function (s, p, ref) { var u = unitOf(s, ref); if (u) E().changeControl(s, u, 1 - p); },
    // Здоровье существа становится n (сила не меняется)
    setBaseHp: function (s, p, ref, n) {
      var u = unitOf(s, ref);
      if (u) u.perm.hp = n - (E().cardDef(u.id).hp || 0);
    },
    aspectLock: function (s) { s.aspectLock = true; E().log(s, 'Смена аспектов невозможна до конца хода.'); },
    // Каждый ход: нет бледных - чары исчезают, иначе гибнет самое хрупкое бледное существо
    paleWarp: function (s, p, ref, n, ab, ctx) {
      var pale = [];
      s.players.forEach(function (pl) {
        pl.field.forEach(function (u) { if (E().stats(s, u).kw.pale) pale.push(u); });
      });
      if (!pale.length) { if (ctx.ench) E().removeEnchant(s, ctx.ench.uid); return; }
      pale.sort(function (a, b) { return (E().stats(s, a).hp - a.damage) - (E().stats(s, b).hp - b.damage); });
      pale[0].doomed = true;
    },
    // 3 урона бледному существу, 1 - обычному
    paleBlast: function (s, p, ref, n, ab, ctx) {
      var u = unitOf(s, ref);
      if (!u) return;
      E().dealDamage(s, ref, E().stats(s, u).kw.pale ? 3 : 1, { name: ctx.sourceName, kind: 'magic' });
    },
    // Уничтожить: бледное - урон врагу по его силе, обычное - его хозяин лечится на силу+здоровье
    cleave: function (s, p, ref, n, ab, ctx) {
      var u = unitOf(s, ref);
      if (!u) return;
      var st = E().stats(s, u);
      if (st.kw.pale) E().dealDamage(s, { kind: 'hero', player: 1 - p }, st.atk, { name: ctx.sourceName, kind: 'magic' });
      else E().heal(s, { kind: 'hero', player: u.owner }, st.atk + st.hp);
      u.doomed = true;
    },
    // Каждый герой сбрасывает по карте за каждую породу своих бледных, враг берёт столько же
    paleTheft: function (s) {
      [0, 1].forEach(function (i) {
        var races = {};
        s.players[i].field.forEach(function (u) { if (E().stats(s, u).kw.pale) races[E().cardDef(u.id).race + E().cardDef(u.id).code.slice(0, 3)] = 1; });
        var n = Math.min(Object.keys(races).length, s.players[i].hand.length);
        if (!n) return;
        E().discard(s, i, n);
        E().draw(s, 1 - i, n);
      });
    },
    // Уничтожить существо и вернуть его в игру под своим началом
    reclaim: function (s, p, ref) {
      var u = unitOf(s, ref);
      if (!u) return;
      var owner = u.origOwner != null ? u.origOwner : u.owner, uid = u.uid;
      E().removeUnit(s, u, 'die');
      E().fromGrave(s, { kind: 'grave', player: owner, uid: uid }, 'play', p);
    },
    // Бесплатно сыграть карту (сценарии боссов)
    castFree: function (s, p, ref, n, ab) { E().castFree(s, p, ab.card); }
  };

  // Выполнить способность
  function run(state, pIdx, def, ab, ctx) {
    var fn = EFFECTS[ab.effect];
    if (!fn) throw new Error('Неизвестный эффект: ' + ab.effect);
    if (!conditionOk(state, pIdx, ab, ctx)) return;
    resolveTargets(state, pIdx, def, ab, ctx).forEach(function (ref) {
      if (state.winner !== null) return;
      fn(state, pIdx, ref, amount(state, pIdx, ab.amount, ctx, ref), ab, ctx);
    });
    E().checkDeaths(state);
  }

  // Статическое свойство scope от источника sourceOwner применимо к существу u?
  function scopeApplies(state, ab, sourceOwner, u, ench) {
    var s = ab.scope;
    if (s === 'friendlyCreatures' && sourceOwner !== u.owner) return false;
    if (s === 'enemyCreatures' && sourceOwner === u.owner) return false;
    if (s !== 'friendlyCreatures' && s !== 'enemyCreatures' && s !== 'allCreatures') return false;
    var f = ab.filter;
    if (f && f.sameRaceAsEnchanted) {
      var host = ench && ench.hostUid != null ? E().findUnit(state, ench.hostUid) : null;
      return !!host && E().cardDef(host.id).race === E().cardDef(u.id).race;
    }
    return matchFilter(state, u, f, null, true);
  }

  AD.Effects = {
    CHOSEN: CHOSEN,
    HARMFUL: HARMFUL,
    EFFECTS: EFFECTS,
    parseKeywords: parseKeywords,
    amount: amount,
    matchFilter: matchFilter,
    aspectVisible: aspectVisible,
    matchCard: matchCard,
    chooseSpec: chooseSpec,
    chooseFilter: chooseFilter,
    listTargets: listTargets,
    isValidTarget: isValidTarget,
    sameRef: sameRef,
    conditionOk: conditionOk,
    run: run,
    scopeApplies: scopeApplies
  };
})(window.AD = window.AD || {});
