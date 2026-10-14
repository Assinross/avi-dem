// Точечные тесты механик полного набора карт
module.exports = function (t) {
  var AD = t.AD, E = AD.Engine, test = t.test, eq = t.eq, ok = t.ok;

  function game() {
    var s = E.create({ seed: 7, players: [{ name: 'А', level: 10, deck: ['ash_rat', 'ash_rat', 'ash_rat', 'ash_rat', 'ash_rat', 'ash_rat', 'ash_rat'] },
      { name: 'Б', level: 10, deck: ['ash_rat', 'ash_rat', 'ash_rat', 'ash_rat', 'ash_rat', 'ash_rat', 'ash_rat'] }] });
    s.players[0].ether = 20;
    return s;
  }
  function give(s, p, id) { var c = { uid: s.seq++, id: id }; s.players[p].hand.push(c); return c.uid; }
  function put(s, p, id) { var u = E.enterUnit(s, p, id); u.sick = false; return u; }
  function hero(p) { return { kind: 'hero', player: p }; }
  function unit(u) { return { kind: 'unit', uid: u.uid }; }
  function grave(s, p, id) { var c = { uid: s.seq++, id: id }; s.players[p].graveyard.push(c); return { kind: 'grave', player: p, uid: c.uid }; }

  test('жертва: Каннибализм лечит на здоровье жертвы', function () {
    var s = game(), u = put(s, 0, 'basalt_wall');
    s.players[0].hp = 10;
    ok(E.playCard(s, 0, give(s, 0, 'cnbl'), { target: unit(u) }).ok);
    eq(s.players[0].hp, 20);
    eq(E.findUnit(s, u.uid), null);
  });

  test('жертва как цена: Сила жертвы', function () {
    var s = game(), u = put(s, 0, 'ash_ogre');
    var hp = s.players[1].hp;
    eq(E.playCard(s, 0, give(s, 0, 'canv'), {}).ok, false, 'без жертвы нельзя');
    ok(E.playCard(s, 0, s.players[0].hand[s.players[0].hand.length - 1].uid, { sacrifice: u.uid }).ok);
    eq(s.players[1].hp, hp - 6);
  });

  test('реанимация способностью: Воительница поднимает из могильника', function () {
    var s = game(), f = put(s, 0, 'fmfi'), g = grave(s, 0, 'ash_bat');
    ok(E.activate(s, 0, f.uid, 0, { target: g }).ok);
    eq(s.players[0].graveyard.length, 0);
    ok(s.players[0].field.some(function (u) { return u.id === 'ash_bat'; }));
  });

  test('дракон из могильника возвращается в руку в начале хода', function () {
    var s = game();
    grave(s, 0, 'rddg');
    E.endTurn(s, 0); E.endTurn(s, 1);
    ok(s.players[0].hand.some(function (c) { return c.id === 'rddg'; }));
  });

  test('прыгун возвращается, если над ним 3 существа', function () {
    var s = game();
    grave(s, 0, 'hopr'); grave(s, 0, 'ash_rat'); grave(s, 0, 'ash_rat'); grave(s, 0, 'ash_rat');
    E.endTurn(s, 0);
    ok(s.players[0].field.some(function (u) { return u.id === 'hopr'; }));
  });

  test('скидка: Скат-полководец удешевляет скатов', function () {
    var s = game();
    put(s, 0, 'lmwd');
    eq(E.cardCost(s, 0, E.cardDef('lmwa')), 5);
    eq(E.cardCost(s, 1, E.cardDef('lmwa')), 7);
  });

  test('Густой лес: слабые не атакуют', function () {
    var s = game();
    E.attachHero(s, 1, 'dnfr', 1);
    var rat = put(s, 0, 'ash_rat'), ogre = put(s, 0, 'ash_ogre');
    eq(E.canAttack(s, rat), false);
    eq(E.canAttack(s, ogre), true);
  });

  test('Робость: атака стоит эфира', function () {
    var s = game();
    E.attachHero(s, 1, 'lsds', 1);
    var a = put(s, 0, 'ash_ogre');
    s.players[0].ether = 0;
    eq(E.declareAttack(s, 0, [a.uid]).ok, false);
    s.players[0].ether = 1;
    ok(E.declareAttack(s, 0, [a.uid]).ok);
    eq(s.players[0].ether, 0);
  });

  test('Туман в фазе блока: урона нет', function () {
    var s = game(), a = put(s, 0, 'ash_ogre');
    var hp = s.players[1].hp;
    E.declareAttack(s, 0, [a.uid]);
    s.players[1].ether = 5;
    ok(E.playCard(s, 1, give(s, 1, 'fogg'), {}).ok);
    E.declareBlocks(s, 1, {});
    eq(s.players[1].hp, hp);
  });

  test('шершень убивает раненое существо', function () {
    var s = game(), h = put(s, 0, 'maho'), w = put(s, 1, 'wlbz');
    E.declareAttack(s, 0, [h.uid]);
    var bl = {}; bl[h.uid] = w.uid;
    E.declareBlocks(s, 1, bl);
    eq(E.findUnit(s, w.uid), null);
  });

  test('змей вешает яд на героя', function () {
    var s = game(), sn = put(s, 0, 'trsn');
    var hp = s.players[1].hp;
    E.declareAttack(s, 0, [sn.uid]);
    E.declareBlocks(s, 1, {});
    ok(s.players[1].enchants.some(function (e) { return e.id === 'snake_venom'; }));
    eq(s.players[1].hp, hp - 1 - 1, 'удар + яд в конце хода');
  });

  test('развоплощение возвращает в руку, чары - в сброс', function () {
    var s = game(), u = put(s, 1, 'ash_ogre');
    E.playCard(s, 0, give(s, 0, 'tempering'), { target: unit(u) });
    ok(E.playCard(s, 0, give(s, 0, 'unsm'), { target: unit(u) }).ok);
    ok(s.players[1].hand.some(function (c) { return c.id === 'ash_ogre'; }));
    ok(s.players[0].discard.some(function (c) { return c.id === 'tempering'; }));
  });

  test('X за жизнь: Обмен эфира', function () {
    var s = game();
    s.players[0].ether = 2;
    var hp = s.players[0].hp;
    ok(E.playCard(s, 0, give(s, 0, 'chnl'), { x: 3 }).ok);
    eq(s.players[0].hp, hp - 3);
    eq(s.players[0].ether, 7);
  });

  test('Перенаправление: урон герою получает существо', function () {
    var s = game(), u = put(s, 0, 'basalt_wall');
    var hp = s.players[0].hp;
    E.playCard(s, 0, give(s, 0, 'redr'), { target: unit(u) });
    E.dealDamage(s, hero(0), 3, { kind: 'magic' });
    eq(s.players[0].hp, hp);
    eq(u.damage, 3);
  });

  test('Обездвиживание: снятие за эфир и жизнь поднимает существо', function () {
    var s = game(), u = put(s, 1, 'ash_ogre');
    E.playCard(s, 0, give(s, 0, 'immb'), { target: unit(u) });
    u.rested = true;
    E.endTurn(s, 0);
    eq(u.rested, true, 'не встал сам');
    var e = u.enchants[0];
    s.players[1].ether = 2;
    ok(E.release(s, 1, e.uid).ok);
    eq(u.rested, false);
  });

  test('Перегрузка: существо теряет 2/2 в конце каждого хода и погибает', function () {
    var s = game(), u = put(s, 0, 'ash_rat');
    E.playCard(s, 0, give(s, 0, 'ovrl'), { target: unit(u) });
    eq(E.stats(s, u).hp, 6);
    for (var i = 0; i < 3; i++) E.endTurn(s, s.active);
    eq(E.findUnit(s, u.uid), null, 'погиб на третьем конце хода');
  });

  test('Стазис: враг не получает эфир', function () {
    var s = game();
    E.playCard(s, 0, give(s, 0, 'stsi'), {});
    E.endTurn(s, 0);
    eq(s.players[1].ether, 0);
  });

  test('навыки монстра: HEAL увеличивает здоровье, REGN лечит каждый 3-й ход', function () {
    var s = E.create({ seed: 1, players: [{ name: 'А', level: 5, deck: ['ash_rat'] }, { name: 'М', level: 5, hp: 20, deck: ['ash_rat'], skills: { HEAL: 2, REGN: 2 } }] });
    eq(s.players[1].maxHp, 24);
    s.players[1].hp = 10;
    for (var i = 0; i < 6; i++) E.endTurn(s, s.active);
    eq(s.players[1].hp, 12, 'один раз за 3 своих хода');
  });

  test('босс: бесплатный призыв в начале хода', function () {
    var s = E.create({ seed: 1, players: [{ name: 'А', level: 5, deck: ['ash_rat'] },
      { name: 'Б', level: 5, deck: ['ash_rat'], passives: [{ trigger: 'startOfTurn', whose: 'owner', effect: 'castFree', card: 'bewr' }] }] });
    E.endTurn(s, 0);
    ok(s.players[1].field.some(function (u) { return u.id === 'bewr'; }));
  });
  // ---------- Аспекты Иных ----------

  test('бледный аспект: рассеянное не атакует, не цель для Искры и массового урона', function () {
    var s = game(), u = put(s, 0, 'smtg');
    ok(E.activate(s, 0, u.uid, 0).ok, 'рассеяться');
    eq(u.pale, true);
    eq(E.canAttack(s, u), false);
    var spark = give(s, 1, 'spark');
    eq(AD.Effects.listTargets(s, 1, 'creatureOrHero').some(function (r) { return r.uid === u.uid; }), false);
    E.playCard(s, 0, give(s, 0, 'thunderstorm'));
    eq(u.damage, 0, 'шквал не задел рассеянного');
  });

  test('проявление за жертву и за изгнание из могильника', function () {
    var s = game(), o = put(s, 0, 'ous1'), rat = put(s, 0, 'ash_rat');
    o.pale = true;
    ok(E.activate(s, 0, o.uid, 1, { sacrifice: rat.uid }).ok);
    eq(o.pale, false);
    var f = put(s, 0, 'smfx');
    f.pale = true;
    var g = grave(s, 1, 'ash_bat');
    ok(E.activate(s, 0, f.uid, 1, { target: g }).ok);
    eq(f.pale, false);
    eq(s.players[1].graveyard.length, 0);
  });

  test('Бледный призрак входит рассеянным и проявляется X/X от колдовства', function () {
    var s = game();
    var uid = give(s, 0, 'osj2');
    E.playCard(s, 0, uid);
    var u = E.findUnit(s, uid);
    eq(u.pale, true);
    E.playCard(s, 0, give(s, 0, 'thunderstorm'), {});
    eq(u.pale, false);
    eq([E.stats(s, u).atk, E.stats(s, u).hp], [2, 2]);
  });

  test('Поток бьёт только рассеянных', function () {
    var s = game(), a = put(s, 0, 'smtg'), b = put(s, 1, 'ash_ogre');
    a.pale = true;
    E.playCard(s, 0, give(s, 0, 'oflx'));
    eq(a.damage, 1, 'одно проявленное существо');
    eq(b.damage, 0);
  });

  test('Страж аспектов: смена аспекта стоит эфир и жизнь', function () {
    var s = game(), u = put(s, 0, 'smtg');
    E.attachHero(s, 0, 'prwr', 1);
    var hp = s.players[0].hp, eth = s.players[0].ether;
    ok(E.activate(s, 0, u.uid, 0).ok);
    eq([s.players[0].hp, s.players[0].ether], [hp - 1, eth - 1]);
  });

  // ---------- Контроль и прочее ----------

  test('Смена власти: контроль пока висят чары, снятие возвращает', function () {
    var s = game(), u = put(s, 1, 'ash_ogre');
    ok(E.playCard(s, 0, give(s, 0, 'chcm'), { target: unit(u) }).ok);
    eq(u.owner, 0);
    var e = u.enchants[0];
    ok(E.playCard(s, 0, give(s, 0, 'clnp'), { target: { kind: 'ench', uid: e.uid } }).ok);
    eq(u.owner, 1);
  });

  test('Наскоро: существо из чужого могильника, снятие чар убивает его', function () {
    var s = game(), g = grave(s, 1, 'ash_ogre');
    ok(E.playCard(s, 0, give(s, 0, 'qkfx'), { target: g }).ok);
    var u = s.players[0].field.filter(function (x) { return x.id === 'ash_ogre'; })[0];
    ok(u, 'огр у нас');
    eq(E.stats(s, u).atk, 5);
    E.playCard(s, 0, give(s, 0, 'clnp'), { target: { kind: 'ench', uid: u.enchants[0].uid } });
    eq(E.findUnit(s, u.uid), null);
  });

  test('Серпень-патриарх: цена по числу сородичей цели, усыпляет всех', function () {
    var s = game(), m = put(s, 0, 'mtpt'), r1 = put(s, 1, 'ash_rat'), r2 = put(s, 1, 'drat'), o = put(s, 1, 'ash_ogre');
    var eth = s.players[0].ether;
    ok(E.activate(s, 0, m.uid, 0, { target: unit(r1) }).ok);
    eq(s.players[0].ether, eth - 2);
    eq([r1.rested, r2.rested, o.rested], [true, true, false]);
  });

  test('Голографическая стена: здоровье по могильнику', function () {
    var s = game(), w = put(s, 0, 'wlil');
    grave(s, 0, 'ash_rat'); grave(s, 0, 'ash_rat'); grave(s, 0, 'ash_rat');
    ok(E.activate(s, 0, w.uid, 0).ok);
    eq(E.stats(s, w).hp, 4);
  });
};
