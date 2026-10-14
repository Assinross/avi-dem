// Тесты движка боя по docs/rules.md
module.exports = function (t) {
  var E = t.AD.Engine, test = t.test, eq = t.eq, ok = t.ok;

  var DECK = [];
  for (var i = 0; i < 15; i++) DECK.push('ash_rat');

  function game(level) {
    return E.create({
      seed: 42,
      players: [{ name: 'Игрок', level: level || 5, deck: DECK.slice() }, { name: 'Враг', level: level || 5, deck: DECK.slice() }]
    });
  }

  // Положить карту в руку игрока и вернуть её uid
  function give(s, p, id) {
    var c = { uid: s.seq++, id: id };
    s.players[p].hand.push(c);
    return c.uid;
  }

  // Поставить существо на поле сразу готовым к бою
  function put(s, p, id) {
    var u = { uid: s.seq++, id: id, owner: p, damage: 0, rested: false, sick: false, enchants: [], temp: [], perm: { atk: 0, hp: 0 }, enteredTurn: 0, damagedTurn: 0 };
    s.players[p].field.push(u);
    return u;
  }

  function hero(p) { return { kind: 'hero', player: p }; }
  function unit(u) { return { kind: 'unit', uid: u.uid }; }

  // ---------- Старт и эфир ----------

  test('старт: 5 и 6 карт, первый не берёт карту на 1-м ходу', function () {
    var s = game();
    eq(s.players[0].hand.length, 5);
    eq(s.players[1].hand.length, 6);
    eq(s.turn, 1);
    eq(s.players[0].hp, 19, 'здоровье уровня 5');
  });

  test('эфир растёт по таблице уровня 5: 1, 2, 3, 4, 4', function () {
    var s = game(), seen = [];
    for (var k = 0; k < 10; k++) {
      if (s.active === 0) seen.push(s.players[0].ether);
      E.endTurn(s, s.active);
    }
    eq(seen, [1, 2, 3, 4, 4]);
  });

  test('второй игрок берёт карту в начале своего хода', function () {
    var s = game();
    E.endTurn(s, 0);
    eq(s.players[1].hand.length, 7);
  });

  test('лимит руки 8: лишняя карта сгорает', function () {
    var s = game();
    while (s.players[1].hand.length < 8) give(s, 1, 'ash_rat');
    var before = s.players[1].discard.length;
    E.endTurn(s, 0);
    eq(s.players[1].hand.length, 8);
    eq(s.players[1].discard.length, before + 1);
  });

  test('пустая колода: сброс замешивается обратно', function () {
    var s = game();
    var p = s.players[1];
    p.discard = p.deck; p.deck = [];
    E.endTurn(s, 0);
    eq(p.discard.length, 0);
    ok(p.hand.length === 7);
  });

  // ---------- Розыгрыш ----------

  test('нельзя сыграть карту дороже запаса эфира', function () {
    var s = game();
    var uid = give(s, 0, 'ash_bat');
    eq(E.playCard(s, 0, uid).ok, false);
  });

  test('призванное существо отдыхает от вызова, на следующем ходу атакует', function () {
    var s = game();
    var uid = give(s, 0, 'ash_rat');
    ok(E.playCard(s, 0, uid).ok);
    var u = E.findUnit(s, uid);
    eq(E.canAttack(s, u), false);
    E.endTurn(s, 0); E.endTurn(s, 1);
    eq(E.canAttack(s, u), true);
  });

  test('колдовство с целью: Искра по герою', function () {
    var s = game();
    var uid = give(s, 0, 'spark');
    ok(E.playCard(s, 0, uid, { target: hero(1) }).ok);
    eq(s.players[1].hp, 18);
    eq(s.players[0].ether, 0);
    ok(s.players[0].discard.some(function (c) { return c.uid === uid; }), 'карта в сбросе');
  });

  test('X-стоимость: Падающая звезда с X=3 стоит 4 и наносит 3', function () {
    var s = game();
    s.players[0].ether = 4;
    var uid = give(s, 0, 'falling_star');
    ok(E.playCard(s, 0, uid, { target: hero(1), x: 3 }).ok);
    eq(s.players[1].hp, 16);
    eq(s.players[0].ether, 0);
  });

  test('Удар молнии нельзя направить в героя', function () {
    var s = game();
    put(s, 1, 'ash_rat');
    var uid = give(s, 0, 'lightning');
    eq(E.playCard(s, 0, uid, { target: hero(1) }).ok, false);
  });

  test('массовый урон: Грозовой шквал бьёт всех существ', function () {
    var s = game();
    s.players[0].ether = 2;
    var a = put(s, 0, 'ash_rat'), b = put(s, 1, 'basalt_wall');
    ok(E.playCard(s, 0, give(s, 0, 'thunderstorm')).ok);
    eq(E.findUnit(s, a.uid), null, 'своя крыса погибла');
    eq(E.findUnit(s, b.uid).damage, 3);
    eq(s.players[0].graveyard.length, 1);
  });

  test('урон на существах снимается в конце хода', function () {
    var s = game();
    s.players[0].ether = 2;
    var b = put(s, 1, 'basalt_wall');
    E.playCard(s, 0, give(s, 0, 'tremor'));
    eq(b.damage, 2);
    E.endTurn(s, 0);
    eq(b.damage, 0);
  });

  // ---------- Чары ----------

  test('чары на существо: Ярость пламени +4 к силе', function () {
    var s = game();
    s.players[0].ether = 2;
    var u = put(s, 0, 'ash_rat');
    ok(E.playCard(s, 0, give(s, 0, 'flame_fury'), { target: unit(u) }).ok);
    eq(E.stats(s, u).atk, 5);
  });

  test('Тление: -4/-4, но здоровье не ниже 1', function () {
    var s = game();
    s.players[0].ether = 2;
    var u = put(s, 1, 'ash_bat');
    E.playCard(s, 0, give(s, 0, 'smolder'), { target: unit(u) });
    var st = E.stats(s, u);
    eq([st.atk, st.hp], [0, 1]);
    ok(E.findUnit(s, u.uid), 'существо живо');
  });

  test('чары уходят в сброс вместе с погибшим существом', function () {
    var s = game();
    s.players[0].ether = 4;
    var u = put(s, 1, 'ash_rat');
    var fury = give(s, 0, 'flame_fury');
    E.playCard(s, 0, fury, { target: unit(u) });
    E.playCard(s, 0, give(s, 0, 'spark'), { target: unit(u) });
    eq(E.findUnit(s, u.uid), null);
    ok(s.players[0].discard.some(function (c) { return c.uid === fury; }), 'чары у хозяина в сбросе');
  });

  test('чары на героя: Боевой клич даёт +1 силы только своим', function () {
    var s = game();
    s.players[0].ether = 2;
    var mine = put(s, 0, 'ash_rat'), theirs = put(s, 1, 'ash_rat');
    E.playCard(s, 0, give(s, 0, 'war_cry'));
    eq(E.stats(s, mine).atk, 2);
    eq(E.stats(s, theirs).atk, 1);
  });

  test('Пылающая сфера: раз в ход, 1 эфир, 2 урона', function () {
    var s = game();
    s.players[0].ether = 5;
    var uid = give(s, 0, 'burning_orb');
    E.playCard(s, 0, uid);
    ok(E.activate(s, 0, uid, 0, { target: hero(1) }).ok);
    eq(s.players[1].hp, 17);
    eq(E.activate(s, 0, uid, 0, { target: hero(1) }).ok, false, 'второй раз нельзя');
  });

  // ---------- Способности существ ----------

  test('Искровик: Отдых - 1 урон, нельзя в ход вызова', function () {
    var s = game();
    s.players[0].ether = 1;
    var uid = give(s, 0, 'sparker');
    E.playCard(s, 0, uid);
    eq(E.activate(s, 0, uid, 0, { target: hero(1) }).ok, false);
    E.endTurn(s, 0); E.endTurn(s, 1);
    ok(E.activate(s, 0, uid, 0, { target: hero(1) }).ok);
    eq(s.players[1].hp, 18);
    eq(E.findUnit(s, uid).rested, true);
  });

  test('Жрец пламени: Отдых - +1 эфир', function () {
    var s = game();
    var u = put(s, 0, 'flame_priest');
    var before = s.players[0].ether;
    ok(E.activate(s, 0, u.uid, 0).ok);
    eq(s.players[0].ether, before + 1);
  });

  // ---------- Атака и блок ----------

  test('незаблокированный атакующий бьёт героя и отдыхает', function () {
    var s = game();
    var u = put(s, 0, 'ash_ogre');
    ok(E.declareAttack(s, 0, [u.uid]).ok);
    eq(s.phase, 'block');
    ok(E.declareBlocks(s, 1, {}).ok);
    eq(s.players[1].hp, 13);
    eq(s.active, 1);
  });

  test('атакующий бьёт первым: блокер погиб - ответа нет', function () {
    var s = game();
    var a = put(s, 0, 'ash_bat');   // 3/2 полёт
    var b = put(s, 1, 'magma_barrier'); // 2/5 стена, полёт
    var r = put(s, 0, 'ash_rat');   // 1/1
    var k = put(s, 1, 'ash_rat');
    E.declareAttack(s, 0, [r.uid, a.uid]);
    E.declareBlocks(s, 1, (function () { var o = {}; o[r.uid] = k.uid; o[a.uid] = b.uid; return o; })());
    eq(E.findUnit(s, k.uid), null, 'крыса-блокер погибла');
    ok(E.findUnit(s, r.uid), 'атакующая крыса жива: блокер не ответил');
    eq(E.findUnit(s, a.uid), null, 'нетопырь 3/2 погиб от ответа заслона 2/5');
  });

  test('первый удар у защитника: бьёт первым', function () {
    var s = game();
    var a = put(s, 0, 'ash_bat');        // 3/2 полёт
    var w = put(s, 1, 'magma_barrier');  // 2/5 стена, полёт
    // первый удар заслону даёт Натиск на герое врага
    s.players[1].enchants.push({ uid: s.seq++, id: 'onslaught', owner: 1, usedTurn: 0 });
    E.declareAttack(s, 0, [a.uid]);
    var bl = {}; bl[a.uid] = w.uid;
    E.declareBlocks(s, 1, bl);
    eq(E.findUnit(s, a.uid), null, 'нетопырь погиб первым и не ударил');
    ok(s.log.every(function (l) { return l.text.indexOf('Пепельный нетопырь: Магмовый заслон') < 0; }), 'заслон не получил урона');
  });

  test('нелетающий не блокирует летающего, увёртливого блокирует только стена', function () {
    var s = game();
    var bat = put(s, 0, 'ash_bat'), pup = put(s, 0, 'dusk_pup');
    var rat = put(s, 1, 'ash_rat'), wall = put(s, 1, 'ember_wall');
    eq(E.canBlock(s, rat, bat), false);
    eq(E.canBlock(s, rat, pup), false);
    eq(E.canBlock(s, wall, pup), true);
  });

  test('отдыхающий не блокирует, стена не атакует', function () {
    var s = game();
    var a = put(s, 0, 'ash_rat'), wall = put(s, 0, 'ember_wall');
    var r = put(s, 1, 'ash_rat');
    r.rested = true;
    eq(E.canBlock(s, r, a), false);
    eq(E.canAttack(s, wall), false);
  });

  test('неутомимый не отдыхает после атаки', function () {
    var s = game();
    var o = put(s, 0, 'ash_ogre');
    E.declareAttack(s, 0, [o.uid]);
    eq(o.rested, false);
  });

  test('прорыв: излишек урона проходит герою', function () {
    var s = game();
    var t = put(s, 0, 'fire_titan'); // 9/9 прорыв
    var r = put(s, 1, 'ember_wall'); // 1/3
    E.declareAttack(s, 0, [t.uid]);
    var bl = {}; bl[t.uid] = r.uid;
    E.declareBlocks(s, 1, bl);
    eq(s.players[1].hp, 19 - 6);
  });

  test('недопустимый блок отклоняется', function () {
    var s = game();
    var bat = put(s, 0, 'ash_bat'), rat = put(s, 1, 'ash_rat');
    E.declareAttack(s, 0, [bat.uid]);
    var bl = {}; bl[bat.uid] = rat.uid;
    eq(E.declareBlocks(s, 1, bl).ok, false);
    eq(s.phase, 'block');
  });

  test('регенерация спасает за эфир', function () {
    var s = game();
    s.players[1].ether = 3;
    var u = put(s, 1, 'ash_rat');
    u.temp.push({ keywords: ['regen:2'] });
    s.players[0].ether = 1;
    E.playCard(s, 0, give(s, 0, 'spark'), { target: unit(u) });
    ok(E.findUnit(s, u.uid), 'выжила');
    eq(s.players[1].ether, 1);
  });

  test('победа: здоровье героя до 0', function () {
    var s = game();
    s.players[1].hp = 1;
    s.players[0].ether = 1;
    E.playCard(s, 0, give(s, 0, 'spark'), { target: hero(1) });
    eq(s.winner, 0);
    eq(s.phase, 'over');
    eq(E.endTurn(s, 0).ok, false, 'после конца боя действия запрещены');
  });

  test('клон состояния независим', function () {
    var s = game(), c = E.clone(s);
    E.endTurn(c, 0);
    eq(s.turn, 1);
    eq(c.turn, 2);
  });
};
