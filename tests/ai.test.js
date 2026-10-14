// Тесты ИИ и прогон полных боёв ИИ против ИИ
var fs = require('fs');
var path = require('path');

module.exports = function (t) {
  var AD = t.AD, E = AD.Engine, AI = AD.AI, test = t.test, eq = t.eq, ok = t.ok;
  var decks = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/decks.json'), 'utf8'));

  function game(seed) {
    return E.create({
      seed: seed,
      players: [
        { name: 'А', level: 5, deck: decks.chaos_starter.cards.slice() },
        { name: 'Б', level: 5, deck: decks.chaos_ash_cult.cards.slice() }
      ]
    });
  }

  function put(s, p, id) {
    var u = { uid: s.seq++, id: id, owner: p, damage: 0, rested: false, sick: false, enchants: [], temp: [], perm: { atk: 0, hp: 0 }, enteredTurn: 0, damagedTurn: 0 };
    s.players[p].field.push(u);
    return u;
  }

  test('ИИ добивает героя искрой', function () {
    var s = game(1);
    s.players[1].hp = 1;
    s.players[0].ether = 1;
    s.players[0].hand = [{ uid: s.seq++, id: 'spark' }];
    var a = AI.nextAction(s, 0);
    ok(a && a.opts.target && a.opts.target.kind === 'hero' && a.opts.target.player === 1, 'цель - герой врага');
  });

  test('ИИ не атакует в заведомо проигрышный блок', function () {
    var s = game(2);
    var rat = put(s, 0, 'ash_rat');
    put(s, 1, 'ember_wall');
    eq(AI.chooseAttackers(s, 0).indexOf(rat.uid), -1);
  });

  test('ИИ блокирует, убивая атакующего', function () {
    var s = game(3);
    var rat = put(s, 0, 'ash_rat');
    var wall = put(s, 1, 'ember_wall');
    E.declareAttack(s, 0, [rat.uid]);
    eq(AI.chooseBlocks(s, 1)[rat.uid], wall.uid);
  });

  test('бои ИИ против ИИ доходят до конца без ошибок', function () {
    var wins = [0, 0, 0];
    for (var seed = 1; seed <= 30; seed++) {
      var s = game(seed), guard = 0;
      while (s.winner === null && guard++ < 400) {
        if (s.phase === 'main') AI.playTurn(s, s.active);
        else if (s.phase === 'block') {
          var r = E.declareBlocks(s, 1 - s.active, AI.chooseBlocks(s, 1 - s.active));
          if (!r.ok) throw new Error('блок отклонён: ' + r.error);
        }
      }
      ok(s.winner !== null, 'бой ' + seed + ' не закончился за ' + s.turn + ' ходов');
      wins[s.winner === 'draw' ? 2 : s.winner]++;
    }
    console.log('       победы А/Б/ничьи: ' + wins.join('/'));
  });
};
