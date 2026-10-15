// События анимаций (state.fx): порядок удар -> урон -> вампиризм -> лечение, гибель
module.exports = function (t) {
  var E = t.AD.Engine, test = t.test, eq = t.eq, ok = t.ok;

  var DECK = [];
  for (var i = 0; i < 15; i++) DECK.push('ash_rat');

  function game() {
    return E.create({ seed: 7, players: [{ name: 'Игрок', level: 5, deck: DECK.slice() }, { name: 'Враг', level: 5, deck: DECK.slice() }] });
  }

  function put(s, p, id) {
    var u = { uid: s.seq++, id: id, owner: p, damage: 0, rested: false, sick: false, enchants: [], temp: [], perm: { atk: 0, hp: 0 }, enteredTurn: 0, damagedTurn: 0 };
    s.players[p].field.push(u);
    return u;
  }

  function kinds(s) { return s.fx.map(function (e) { return e.t; }); }

  test('fx: незаблокированный вампир бьёт героя и лечит своего', function () {
    var s = game();
    s.players[0].hp = 10;
    var a = put(s, 0, 'brmz');
    E.declareAttack(s, 0, [a.uid]);
    s.fx = [];
    E.declareBlocks(s, 1, {});
    var k = kinds(s);
    var i = k.indexOf('strike');
    ok(i >= 0, 'есть удар');
    eq(s.fx[i].to, { kind: 'hero', player: 1 });
    eq(k.slice(i, i + 4), ['strike', 'damage', 'drain', 'heal']);
    eq(s.fx[i + 3].n, 4, 'лечение на силу удара');
  });

  test('fx: схватка - удары по очереди и гибель', function () {
    var s = game();
    var a = put(s, 0, 'brmz'), b = put(s, 1, 'ash_rat');
    E.declareAttack(s, 0, [a.uid]);
    s.fx = [];
    var bl = {}; bl[a.uid] = b.uid;
    E.declareBlocks(s, 1, bl);
    var k = kinds(s);
    eq(k.slice(0, 3), ['fight', 'strike', 'damage']);
    eq(s.fx[3].ref, { kind: 'hero', player: 1 }, 'излишек прорыва - герою, без отдельного удара');
    ok(s.fx.some(function (e) { return e.t === 'death' && e.uid === b.uid; }), 'блокер погиб');
    eq(k.filter(function (x) { return x === 'strike'; }).length, 1, 'погибший не отвечает');
  });

  test('предпросмотр: итог схватки совпадает с настоящим, состояние не меняется', function () {
    var s = game();
    var a = put(s, 0, 'brmz'), b = put(s, 1, 'ash_rat'), c = put(s, 0, 'ash_rat');
    s.players[0].hp = 10;
    var before = JSON.stringify(s);
    var p1 = E.previewCombat(s, {}, [a.uid, c.uid]);
    eq(JSON.stringify(s), before, 'исходное состояние не тронуто');
    eq(p1.players[1].hp, s.players[1].hp - 5, 'без блоков: 4 + 1 урона');
    eq(p1.players[0].hp, 14, 'вампиризм лечит');
    E.declareAttack(s, 0, [a.uid, c.uid]);
    var bl = {}; bl[c.uid] = b.uid;
    var p2 = E.previewCombat(s, bl);
    E.declareBlocks(s, 1, bl);
    eq(p2.players[1].hp, s.players[1].hp, 'здоровье героя как в настоящем бою');
    eq(!!E.findUnit(p2, b.uid), !!E.findUnit(s, b.uid), 'блокер жив/погиб так же');
    eq(!!E.findUnit(p2, c.uid), !!E.findUnit(s, c.uid), 'атакующий жив/погиб так же');
  });

  test('предпросмотр: без атакующих схватки нет', function () {
    var s = game();
    eq(E.previewCombat(s, {}, []), null);
  });
};
