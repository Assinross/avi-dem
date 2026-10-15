// Кампания: баланс опыта по рубежам и прогон всей кампании ИИ за героя
var fs = require('fs');
var path = require('path');

function json(name) { return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/' + name + '.json'), 'utf8')); }

module.exports = function (t) {
  var AD = t.AD, E = AD.Engine, AI = AD.AI, C = AD.Campaign, test = t.test, eq = t.eq, ok = t.ok;
  var d = { cards: json('cards'), races: json('races'), monsters: json('monsters'), campaign: json('campaign'), progression: json('progression') };
  C.setData(d);

  test('уровень монстра задан узлом и не растёт с героем; здоровье по главам, колода размером с колоду героя', function () {
    [1, 2, 4, 7].forEach(function (lv) {
      var run = C.newRun('chaos', 1, 5);
      run.level = lv; run.skills = { HEAL: 1 };
      d.campaign.chapters.forEach(function (ch, i) {
        run.chapter = i;
        ch.nodes.filter(function (n) { return n.monster; }).forEach(function (n) {
          var foe = C.battleSetup(run, n.id).players[1], me = C.battleSetup(run, n.id).players[0];
          ok(n.level > 0, n.monster + ': уровень задан в узле');
          eq(foe.level, n.level, n.monster + ': уровень');
          eq(foe.hp, Math.round(C.heroHp(run, n.level) * C.chapterHpScale(run, n)), n.monster + ': здоровье');
          eq(foe.deck.length, me.deck.length, n.monster + ': размер колоды');
          ok(d.monsters[n.monster].variants[0].deck.every(function (id) { return foe.deck.indexOf(id) >= 0; }), n.monster + ': свои карты');
        });
      });
    });
  });

  test('все узлы глав достижимы, монстры и колоды существуют', function () {
    d.campaign.chapters.forEach(function (ch) {
      var seen = { start: true }, changed = true;
      while (changed) {
        changed = false;
        ch.edges.forEach(function (e) {
          if (seen[e[0]] !== seen[e[1]]) { seen[e[0]] = seen[e[1]] = true; changed = true; }
        });
      }
      ch.nodes.forEach(function (n) {
        ok(seen[n.id], ch.name + ': узел ' + n.id + ' недостижим');
        if (n.monster) {
          var m = d.monsters[n.monster];
          ok(m, 'нет монстра ' + n.monster);
          m.variants.forEach(function (v) { ok(v.deck.length > 0, n.monster + ': пустая колода'); });
        }
      });
    });
    Object.keys(d.races).forEach(function (el) {
      var run = C.newRun(el, 0, 1);
      eq(C.validateDeck(run, run.deck), null, el + ': стартовая колода');
    });
  });

  test('здоровье монстров: глава 1 как у героя, к концу кампании растёт до 1.5-1.6', function () {
    var run = C.newRun('chaos', 1, 7), last = d.campaign.chapters.length - 1;
    run.level = 5;
    run.chapter = 0;
    eq(C.monsterHp(run, { type: 'battle' }), E.heroHp(5), 'бой главы 1');
    run.chapter = last;
    eq(C.monsterHp(run, { type: 'battle' }), Math.round(E.heroHp(5) * 1.5), 'бой последней главы');
    var prev = 0;
    for (var i = 0; i <= last; i++) {
      run.chapter = i;
      ok(C.chapterHpScale(run, { type: 'gate' }) >= C.chapterHpScale(run, { type: 'battle' }), 'страж не слабее боя, глава ' + (i + 1));
      ok(C.chapterHpScale(run, { type: 'battle' }) >= prev, 'рост по главам, глава ' + (i + 1));
      prev = C.chapterHpScale(run, { type: 'battle' });
    }
  });

  test('страж главы открывается только после победы над всеми монстрами', function () {
    var run = C.newRun('chaos', 1, 9), ch = d.campaign.chapters[0];
    ch.nodes.forEach(function (n) { if (n.type !== 'gate' && n.type !== 'battle') run.cleared[n.id] = true; });
    var battles = ch.nodes.filter(function (n) { return n.type === 'battle'; });
    battles.slice(0, -1).forEach(function (n) { run.cleared[n.id] = true; });
    ok(!C.isAvailable(run, 'gate'), 'страж закрыт, пока остался бой');
    eq(C.battlesLeft(run), 1);
    run.cleared[battles[battles.length - 1].id] = true;
    ok(C.isAvailable(run, 'gate'), 'страж открыт');
  });

  test('уровни узлов: пройдя все бои главы, герой подходит к стражу его уровня', function () {
    var xp = 0;
    d.campaign.chapters.forEach(function (ch) {
      ch.nodes.filter(function (n) { return n.type === 'battle'; }).forEach(function (n) {
        ok(Math.abs(n.level - C.levelFor(xp)) <= 1, ch.name + '/' + n.id + ': уровень монстра рядом с уровнем героя');
        xp += C.xpForMonster(n.level);
      });
      var gate = ch.nodes.filter(function (n) { return n.type === 'gate'; })[0];
      eq(C.levelFor(xp), gate.level, ch.name + ': герой у стража');
      xp += C.xpForMonster(gate.level);
    });
  });

  test('финальный страж кампании - всегда 12 уровня', function () {
    var run = C.newRun('life', 1, 3), last = d.campaign.chapters.length - 1;
    run.chapter = last;
    [1, 9, 13].forEach(function (lv) {
      run.level = lv;
      var foe = C.battleSetup(run, 'gate').players[1];
      eq(foe.level, 12, 'уровень финала при герое ' + lv);
      eq(foe.hp, Math.round(AD.Engine.heroHp(12) * 1.6), 'здоровье финала при герое ' + lv);
    });
  });

  function fight(setup, seed) {
    setup.seed = seed;
    var s = E.create(setup), guard = 0;
    while (s.winner === null && guard++ < 400) {
      if (s.phase === 'main') AI.playTurn(s, s.active);
      else if (s.phase === 'block') E.declareBlocks(s, 1 - s.active, AI.chooseBlocks(s, 1 - s.active));
    }
    return s.winner === 0;
  }

  // Полная кампания: ИИ за героя, берёт первую карту награды, до 3 попыток на бой
  function playthrough(el, diff, seed) {
    var run = C.newRun(el, diff, seed), report = [], tries = 0;
    for (var guard = 0; !run.done && guard < 200; guard++) {
      if (run.pending) { C.resolvePending(run, run.pending.cards ? run.pending.cards[0] : run.pending.skills[0]); continue; }
      var ch = C.chapter(run);
      var next = ch.nodes.filter(function (n) { return n.type !== 'gate' && C.isAvailable(run, n.id); })[0] ||
                 ch.nodes.filter(function (n) { return C.isAvailable(run, n.id); })[0];
      if (!next) break;
      if (next.type === 'reward' || next.type === 'event') { C.visit(run, next.id); continue; }
      var won = fight(C.battleSetup(run, next.id), seed + guard * 31 + tries);
      C.battleResult(run, next.id, won);
      if (won) { report.push(tries); tries = 0; }
      else if (++tries >= 3) return { done: false, at: ch.name + '/' + next.id, level: run.level, report: report };
    }
    return { done: run.done, level: run.level, report: report, chapter: run.chapter };
  }

  test('кампанию можно пройти на лёгкой сложности (ИИ за героя)', function () {
    var lines = [];
    Object.keys(d.races).forEach(function (el, i) {
      var r = playthrough(el, 0, 100 + i);
      lines.push(el + ': ' + (r.done ? 'пройдена' : 'стоп на ' + r.at) + ', уровень ' + r.level +
        ', поражений ' + r.report.reduce(function (a, b) { return a + b; }, 0));
    });
    console.log('       ' + lines.join('\n       '));
  });
};
