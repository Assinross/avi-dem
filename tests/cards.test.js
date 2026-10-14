// Проверка всех карт: данные известны движку, каждая карта разыгрывается, бои на всех стихиях доходят до конца
var fs = require('fs');
var path = require('path');

var TRIGGERS = ['onPlay', 'activated', 'static', 'startOfTurn', 'endOfTurn', 'startOfTurnInGrave', 'endOfTurnInGrave',
  'onAnyDeath', 'onCast', 'onDamageCreature', 'onEnchantedDamaged', 'onEnchantedDeath', 'onEnter', 'onLeave',
  'onHitHero', 'onRegen'];

module.exports = function (t) {
  var AD = t.AD, E = AD.Engine, AI = AD.AI, Ef = AD.Effects, test = t.test, ok = t.ok;
  var cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
  var impl = cards.filter(function (c) { return c.impl !== false; });
  var playable = impl.filter(function (c) { return !c.special; });

  test('эффекты и триггеры всех карт известны движку', function () {
    var bad = [];
    impl.forEach(function (c) {
      c.abilities.forEach(function (ab) {
        if (TRIGGERS.indexOf(ab.trigger) < 0) bad.push(c.id + ': триггер ' + ab.trigger);
        if (ab.effect && !Ef.EFFECTS[ab.effect]) bad.push(c.id + ': эффект ' + ab.effect);
        if (ab.card && !E.hasCard(ab.card)) bad.push(c.id + ': нет карты ' + ab.card);
      });
    });
    ok(!bad.length, bad.join('; '));
  });

  // Поле с разными существами у обоих, карта в руке, много эфира
  function sandbox(id, seed) {
    var s = E.create({ seed: seed, players: [{ name: 'А', level: 10, deck: ['ash_rat', 'ash_rat', 'ash_rat'] },
      { name: 'Б', level: 10, deck: ['ash_rat', 'ash_rat', 'ash_rat'] }] });
    ['ash_bat', 'ember_wall', 'tant'].forEach(function (cid) { E.enterUnit(s, 0, cid).sick = false; });
    ['bloodwing', 'basalt_wall', 'ash_rat'].forEach(function (cid) { E.enterUnit(s, 1, cid).sick = false; });
    s.players[0].graveyard.push({ uid: s.seq++, id: 'ash_rat' });
    s.players[1].graveyard.push({ uid: s.seq++, id: 'ash_bat' });
    E.attachHero(s, 1, 'war_cry', 1);
    s.players[0].ether = 20;
    s.players[0].hand.push({ uid: s.seq++, id: id });
    return s;
  }

  test('каждая реализованная карта разыгрывается во всех вариантах', function () {
    var errors = [], played = 0;
    impl.forEach(function (c, i) {
      var s = sandbox(c.id, 100 + i);
      var uid = s.players[0].hand[s.players[0].hand.length - 1].uid;
      var opts = [];
      var x = c.xCost === 'life' ? 3 : (c.xCost ? 4 : 0);
      var sacs = c.sacrifice ? s.players[0].field.map(function (u) { return u.uid; }) : [undefined];
      sacs.forEach(function (sac) {
        var ctx = { controller: 0, x: x, sac: sac ? { cost: E.cardDef(E.findUnit(s, sac).id).cost } : null };
        var targets = c.target ? Ef.listTargets(s, 0, c.target, c.targetFilter, ctx) : [undefined];
        targets.forEach(function (tg) { opts.push({ target: tg, x: x, sacrifice: sac }); });
      });
      if (c.blockPhase === 'only') return;
      opts.forEach(function (o) {
        var cl = E.clone(s);
        try {
          var r = E.playCard(cl, 0, uid, o);
          if (r.ok) played++;
          // ход до конца и ответ врага: срабатывают триггеры начала/конца хода
          if (r.ok && cl.phase === 'main') { E.endTurn(cl, 0); if (cl.phase === 'main') AI.playTurn(cl, 1); }
        } catch (e) {
          errors.push(c.id + ' ' + JSON.stringify(o) + ': ' + e.message);
        }
      });
    });
    ok(!errors.length, errors.slice(0, 5).join('\n       '));
    ok(played > 300, 'сыграно вариантов: ' + played);
  });

  test('способности существ и чар срабатывают без ошибок', function () {
    var errors = [];
    impl.forEach(function (c, i) {
      if (!c.abilities.some(function (ab) { return ab.trigger === 'activated'; })) return;
      var s = sandbox('ash_rat', 500 + i), src;
      if (c.type === 'creature') { src = E.enterUnit(s, 0, c.id); src.sick = false; }
      else if (c.attach === 'hero') src = E.attachHero(s, 0, c.id, 0);
      else return;
      c.abilities.forEach(function (ab, idx) {
        if (ab.trigger !== 'activated' || ab.linked) return;
        var spec = Ef.chooseSpec(c, ab);
        var targets = spec ? Ef.listTargets(s, 0, spec, ab.filter, { controller: 0, x: 3 }) : [undefined];
        var sac = s.players[0].field.filter(function (u) { return u.uid !== src.uid; })[0];
        targets.forEach(function (tg) {
          var cl = E.clone(s);
          try { E.activate(cl, 0, src.uid, idx, { target: tg, x: 3, sacrifice: sac && sac.uid }); }
          catch (e) { errors.push(c.id + ': ' + e.message); }
        });
      });
    });
    ok(!errors.length, errors.slice(0, 5).join('\n       '));
  });

  test('бои ИИ на случайных колодах всех стихий доходят до конца', function () {
    var elements = ['chaos', 'life', 'movement', 'synthesis'], unfinished = 0, total = 0;
    var byEl = {};
    elements.forEach(function (el) { byEl[el] = playable.filter(function (c) { return c.element === el; }); });
    function deck(el, seed) {
      var pool = byEl[el], out = [];
      for (var i = 0; i < 16; i++) out.push(pool[(seed * 31 + i * 17) % pool.length].id);
      return out;
    }
    elements.forEach(function (a, ai) {
      elements.forEach(function (b, bi) {
        for (var k = 0; k < 3; k++) {
          var seed = 1000 + ai * 100 + bi * 10 + k;
          var s = E.create({ seed: seed, players: [{ name: 'А', level: 6, deck: deck(a, seed) }, { name: 'Б', level: 6, deck: deck(b, seed + 7) }] });
          var guard = 0;
          try {
            while (s.winner === null && guard++ < 300) {
              if (s.phase === 'main') AI.playTurn(s, s.active);
              else if (s.phase === 'block') E.declareBlocks(s, 1 - s.active, AI.chooseBlocks(s, 1 - s.active));
            }
          } catch (e) {
            throw new Error(a + '/' + b + ' seed ' + seed + ' ход ' + s.turn + ': ' + e.stack);
          }
          total++;
          if (s.winner === null) unfinished++;
        }
      });
    });
    ok(unfinished <= 2, 'не закончились ' + unfinished + ' из ' + total);
  });
};
