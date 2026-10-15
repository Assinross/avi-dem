// ИИ противника. Розыгрыш - жадный: перебирает действия на копии состояния и берёт лучшее по оценке.
// Атака и блок проверяются настоящим движком на копии боя (как ИИ в Forge): перебор наборов атакующих
// с прогнозом блоков и ответного удара, блоки - улучшение расстановки по итогу схваток. Без DOM.
(function (AD) {
  'use strict';

  var MAX_ACTIONS = 30;
  var ATTACK_FULL = 6;     // до стольких атакующих перебираются все наборы, больше - по одному
  var BLOCK_PASSES = 3;    // проходов улучшения расстановки блоков

  function E() { return AD.Engine; }

  // Ценность существа на поле
  function unitValue(state, u) {
    var st = E().stats(state, u), kw = st.kw, def = E().cardDef(u.id);
    var v = 0.5 + st.atk + st.hp * 0.7;
    if (kw.wall) v -= st.atk * 0.6;
    if (kw.flying) v += 1;
    if (kw.firstStrike) v += 0.8;
    if (kw.trample) v += 0.5;
    if (kw.restless) v += 0.5;
    if (kw.elusive || kw.unblockable) v += 0.8;
    if (kw.lifetap) v += 0.5;
    if (kw.regen) v += 1;
    def.abilities.forEach(function (ab) { if (ab.trigger === 'activated') v += 1.5; });
    return u.pale ? v * 0.35 : v;
  }

  // Здоровье героя дороже, когда его мало
  function heroValue(hp) {
    return hp * 1.2 + (hp < 6 ? (hp - 6) * 1.5 : 0);
  }

  // Оценка позиции с точки зрения игрока me
  function evaluate(state, me) {
    if (state.winner === me) return 1e6;
    if (state.winner === 'draw') return -5e5;
    if (state.winner !== null) return -1e6;
    var s = 0;
    state.players.forEach(function (p, i) {
      var sign = i === me ? 1 : -1;
      s += sign * heroValue(p.hp);
      p.field.forEach(function (u) { s += sign * unitValue(state, u); });
      s += sign * p.enchants.length * 1.5;
    });
    s += state.players[me].ether * 0.05;
    return s;
  }

  // Варианты жертвы: самые дешёвые свои существа (кроме источника)
  function sacrificeOptions(state, me, notUid) {
    return state.players[me].field.filter(function (u) { return u.uid !== notUid; })
      .sort(function (a, b) { return unitValue(state, a) - unitValue(state, b); })
      .slice(0, 2).map(function (u) { return u.uid; });
  }

  // Все варианты действий в фазе розыгрыша
  function candidates(state, me) {
    var Ef = AD.Effects, p = state.players[me], out = [];
    p.hand.forEach(function (c) {
      var def = E().cardDef(c.id);
      var x = 0;
      if (def.xCost === true) x = p.ether - E().cardCost(state, me, def);
      if (def.xCost === 'life') x = Math.min(4, p.hp - 6);
      if (def.xCost && x < 1) return;
      if (!E().canPlay(state, me, c.uid, x).ok) return;
      var sacs = def.sacrifice ? sacrificeOptions(state, me) : [undefined];
      sacs.forEach(function (sac) {
        var ctx = { controller: me, x: x, sac: sac ? { cost: E().cardDef(E().findUnit(state, sac).id).cost } : null };
        var targets = def.target ? Ef.listTargets(state, me, def.target, def.targetFilter, ctx) : [null];
        targets.forEach(function (t) {
          out.push({ type: 'play', uid: c.uid, opts: { target: t || undefined, x: x, sacrifice: sac } });
        });
      });
    });
    var sources = p.field.map(function (u) { return { uid: u.uid, id: u.id }; });
    E().allEnchants(state).forEach(function (e) { if (e.owner === me) sources.push({ uid: e.uid, id: e.id }); });
    sources.forEach(function (src) {
      E().cardDef(src.id).abilities.forEach(function (ab, idx) {
        if (ab.trigger !== 'activated' || ab.linked) return;
        var x = ab.cost && ab.cost.ether === 'X' ? p.ether : 0;
        if (!E().canActivate(state, me, src.uid, idx, x).ok) return;
        var spec = Ef.chooseSpec(E().cardDef(src.id), ab);
        var targets = spec ? Ef.listTargets(state, me, spec, ab.filter, { controller: me, x: x }) : [null];
        var sacs = ab.cost && ab.cost.sacrifice ? sacrificeOptions(state, me, src.uid) : [undefined];
        sacs.forEach(function (sac) {
          targets.forEach(function (t) {
            out.push({ type: 'act', uid: src.uid, idx: idx, opts: { target: t || undefined, x: x, sacrifice: sac } });
          });
        });
      });
    });
    return out;
  }

  function apply(state, me, a) {
    if (a.type === 'play') return E().playCard(state, me, a.uid, a.opts);
    return E().activate(state, me, a.uid, a.idx, a.opts);
  }

  // Лучшее следующее действие в фазе розыгрыша или null
  function nextAction(state, me) {
    if (state.phase !== 'main' || state.active !== me) return null;
    var base = evaluate(state, me), best = null, bestV = base + 0.01;
    candidates(state, me).forEach(function (a) {
      var c = E().clone(state);
      if (!apply(c, me, a).ok) return;
      var v = evaluate(c, me);
      if (v > bestV) { bestV = v; best = a; }
    });
    return best;
  }

  // Прогноз схватки: атакующий бьёт первым, если у защитника нет первого удара
  function fightResult(state, a, b) {
    var sa = E().stats(state, a), sb = E().stats(state, b);
    var ha = sa.hp - a.damage, hb = sb.hp - b.damage;
    var bFirst = sb.kw.firstStrike && !sa.kw.firstStrike;
    var aKills = sa.atk >= hb || (sa.kw.poison && sa.atk > 0);
    var bKills = sb.atk >= ha || (sb.kw.poison && sb.atk > 0);
    if (bFirst) return { aDies: bKills, bDies: !bKills && aKills };
    return { bDies: aKills, aDies: !aKills && bKills };
  }

  // ---------- Быстрые эвристики (лёгкий ИИ и модель ответа игрока внутри перебора) ----------

  // Выбор атакующих по формуле, без движка
  function quickAttackers(state, me) {
    var p = state.players[me], foe = state.players[1 - me];
    var ready = p.field.filter(function (u) { return E().canAttack(state, u); });
    var tax = E().heroMods(state, 1 - me).attackTax;
    if (tax) ready = ready.sort(function (a, b) { return E().stats(state, b).atk - E().stats(state, a).atk; })
      .slice(0, Math.floor(p.ether / tax));
    var blockers = foe.field.filter(function (u) { return !u.rested; });
    var total = ready.reduce(function (s, u) { return s + E().stats(state, u).atk; }, 0);
    // добивание: блокеров мало, а урона хватает
    if (total >= foe.hp + blockers.length * 3) return ready.map(function (u) { return u.uid; });
    return ready.filter(function (a) {
      if (E().stats(state, a).atk <= 0) return false;
      return blockers.every(function (b) {
        if (!E().canBlock(state, b, a)) return true;
        var r = fightResult(state, a, b);
        if (r.aDies && !r.bDies) return false;
        if (r.aDies && r.bDies) return unitValue(state, a) <= unitValue(state, b);
        return true;
      });
    }).map(function (u) { return u.uid; });
  }

  // Выбор блоков по формуле: { uidАтакующего: uidБлокирующего }
  function quickBlocks(state, me) {
    var p = state.players[me], blocks = {};
    if (!state.combat) return blocks;
    var free = p.field.filter(function (u) { return !u.rested; });
    var attackers = state.combat.attackers.map(function (uid) { return E().findUnit(state, uid); })
      .filter(Boolean)
      .sort(function (x, y) { return E().stats(state, y).atk - E().stats(state, x).atk; });
    var incoming = 0;

    attackers.forEach(function (a) {
      var opts = free.filter(function (b) { return E().canBlock(state, b, a); });
      var pick = null, kind = '';
      opts.forEach(function (b) {
        var r = fightResult(state, a, b), v = unitValue(state, b);
        var k = r.aDies && !r.bDies ? 'kill' : (!r.bDies ? 'hold' : (r.aDies && v <= unitValue(state, a) ? 'trade' : ''));
        var rank = { kill: 3, hold: 2, trade: 1, '': 0 }[k];
        var cur = { kill: 3, hold: 2, trade: 1, '': 0 }[kind];
        if (rank > cur || (rank === cur && rank > 0 && v < unitValue(state, pick))) { pick = b; kind = k; }
      });
      if (pick && kind) {
        blocks[a.uid] = pick.uid;
        free.splice(free.indexOf(pick), 1);
      } else {
        incoming += E().stats(state, a).atk;
      }
    });

    // спасаем героя: закрываем самых сильных незаблокированных
    if (incoming >= p.hp) {
      attackers.forEach(function (a) {
        if (blocks[a.uid] || incoming < p.hp) return;
        var b = free.filter(function (x) { return E().canBlock(state, x, a); })
          .sort(function (x, y) { return unitValue(state, x) - unitValue(state, y); })[0];
        if (!b) return;
        blocks[a.uid] = b.uid;
        free.splice(free.indexOf(b), 1);
        incoming -= E().stats(state, a).atk;
      });
    }
    return blocks;
  }

  // ---------- Атака и блок через движок ----------

  // Копия боя без журнала и событий анимаций - дешевле для перебора
  function light(state) {
    var log = state.log, fx = state.fx;
    state.log = [];
    state.fx = null;
    var c = E().clone(state);
    state.log = log;
    state.fx = fx;
    return c;
  }

  // Сколько урона враг сможет нанести мне в свой следующий ход: его существа встанут,
  // мои атаковавшие останутся отдыхать. Каждый мой свободный блокер закрывает одного самого сильного.
  function crackBack(state, me) {
    var foe = 1 - me, hp = state.players[me].hp;
    var attackers = state.players[foe].field.filter(function (u) {
      var st = E().stats(state, u);
      return !u.pale && !st.kw.noAttack && st.atk > 0 && !(u.rested && st.kw.noUntap);
    }).sort(function (a, b) { return E().stats(state, b).atk - E().stats(state, a).atk; });
    var free = state.players[me].field.filter(function (u) { return !u.rested && !u.pale; });
    var dmg = 0;
    attackers.forEach(function (a) {
      var i = -1;
      for (var k = 0; k < free.length; k++) if (E().canBlock(state, free[k], a)) { i = k; break; }
      if (i >= 0) free.splice(i, 1);
      else dmg += E().stats(state, a).atk;
    });
    return { dmg: dmg, lethal: dmg >= hp };
  }

  // Оценка итога атаки для атакующего: позиция после схваток минус угроза ответного удара
  function attackScore(res, me) {
    var v = evaluate(res, me);
    if (res.winner !== null) return v;
    var cb = crackBack(res, me);
    return v - (cb.lethal ? 400 : cb.dmg * 0.6);
  }

  // Итог атаки набором list при блоках защитника; blocker(c, foe) - модель блоков. null - атака невозможна.
  function tryAttack(state, me, list, blocker) {
    var c = light(state);
    if (!E().declareAttack(c, me, list).ok || c.phase !== 'block') return null;
    var res = E().previewCombat(c, blocker(c, 1 - me));
    return res ? { list: c.combat.attackers, score: attackScore(res, me), win: res.winner === me } : null;
  }

  // Наборы атакующих: все сочетания для небольшого числа, иначе жадное добавление по одному
  function attackSets(state, me, ready, scoreOf) {
    var out = [];
    if (ready.length <= ATTACK_FULL) {
      for (var mask = 1; mask < (1 << ready.length); mask++) {
        out.push(ready.filter(function (u, i) { return mask & (1 << i); }).map(function (u) { return u.uid; }));
      }
      return out;
    }
    var cur = [], curV = -Infinity;
    for (;;) {
      var bestAdd = null, bestV = curV;
      ready.forEach(function (u) {
        if (cur.indexOf(u.uid) >= 0) return;
        var v = scoreOf(cur.concat([u.uid]));
        if (v > bestV) { bestV = v; bestAdd = u.uid; }
      });
      if (bestAdd === null) break;
      cur = cur.concat([bestAdd]);
      curV = bestV;
      out.push(cur);
    }
    out.push(ready.map(function (u) { return u.uid; }));
    return out;
  }

  // Выбор атакующих (uid): лучший набор по итогу схваток через движок.
  // Блоки игрока предсказываются быстрой эвристикой; смертельный набор проверяется полным расчётом блоков.
  function chooseAttackers(state, me) {
    var ready = state.players[me].field.filter(function (u) { return E().canAttack(state, u) && E().stats(state, u).atk > 0; });
    if (!ready.length) return [];
    var base = light(state);
    var none = evaluate(base, me) - crackBack(base, me).dmg * 0.6;
    var cache = {};
    var scoreOf = function (list) {
      var key = list.slice().sort().join(',');
      if (!(key in cache)) {
        var quick = tryAttack(state, me, list, quickBlocks);
        var bare = tryAttack(state, me, list, function () { return {}; });
        // защитник выберет худшее для меня из своих вариантов
        var r = quick && bare ? (quick.score <= bare.score ? quick : bare) : (quick || bare);
        if (r && r.win) {
          var strong = tryAttack(state, me, list, chooseBlocks);
          if (strong) r = strong.score < r.score ? strong : r;
        }
        cache[key] = r ? r.score : -Infinity;
      }
      return cache[key];
    };
    var best = [], bestV = none;
    attackSets(state, me, ready, scoreOf).forEach(function (list) {
      var v = scoreOf(list);
      if (v > bestV + 0.01) { bestV = v; best = list; }
    });
    return best;
  }

  // Выбор блоков: { uidАтакующего: uidБлокирующего }. Начало - эвристика или без блоков,
  // затем перебор замен по одному атакующему, пока итог схваток через движок улучшается.
  function chooseBlocks(state, me) {
    if (!state.combat || state.phase !== 'block') return {};
    var c = light(state);
    var attackers = c.combat.attackers.map(function (uid) { return E().findUnit(c, uid); }).filter(Boolean);
    var free = c.players[me].field.filter(function (u) { return !u.rested && !u.pale; });
    var score = function (blocks) {
      var res = E().previewCombat(c, blocks);
      return res ? evaluate(res, me) : -Infinity;
    };
    var cur = quickBlocks(c, me), curV = score(cur), empty = score({});
    if (empty > curV) { cur = {}; curV = empty; }
    for (var pass = 0; pass < BLOCK_PASSES; pass++) {
      var improved = false;
      attackers.forEach(function (a) {
        var used = {};
        for (var k in cur) if (Number(k) !== a.uid) used[cur[k]] = 1;
        var opts = [null].concat(free.filter(function (b) { return !used[b.uid] && E().canBlock(c, b, a); }).map(function (b) { return b.uid; }));
        opts.forEach(function (bUid) {
          if ((cur[a.uid] || null) === bUid) return;
          var next = {};
          for (var k2 in cur) if (Number(k2) !== a.uid) next[k2] = cur[k2];
          if (bUid !== null) next[a.uid] = bUid;
          var v = score(next);
          if (v > curV + 0.01) { cur = next; curV = v; improved = true; }
        });
      });
      if (!improved) break;
    }
    return cur;
  }

  // Полный ход ИИ без пауз (для тестов и автобоя)
  function playTurn(state, me) {
    for (var i = 0; i < MAX_ACTIONS; i++) {
      var a = nextAction(state, me);
      if (!a) break;
      apply(state, me, a);
    }
    if (state.phase === 'main' && state.active === me) declare(state, me);
  }

  // Объявить атаку; если выбор отклонён (команда, налог) - атаковать без спорных
  function declare(state, me) {
    var list = chooseAttackers(state, me);
    var r = E().declareAttack(state, me, list);
    if (!r.ok) r = E().declareAttack(state, me, list.filter(function (uid) {
      return !E().stats(state, E().findUnit(state, uid)).kw.teamAttack;
    }));
    if (!r.ok) r = E().declareAttack(state, me, []);
    return r;
  }

  AD.AI = {
    declare: declare,
    MAX_ACTIONS: MAX_ACTIONS,
    evaluate: evaluate,
    unitValue: unitValue,
    nextAction: nextAction,
    apply: apply,
    chooseAttackers: chooseAttackers,
    chooseBlocks: chooseBlocks,
    quickAttackers: quickAttackers,
    quickBlocks: quickBlocks,
    crackBack: crackBack,
    fightResult: fightResult,
    playTurn: playTurn
  };
})(window.AD = window.AD || {});
