// Кампания: забег, карта узлов, опыт и уровни, награды, события, колода. Чистая логика, без DOM.
(function (AD) {
  'use strict';

  var data = null; // { cards, races, monsters, campaign, progression }

  var DIFFICULTY = ['Лёгкая', 'Обычная', 'Трудная', 'Эксперт', 'Невозможная'];

  // События: усиления героя (навыки оригинала)
  var SKILLS = {
    HEAL: { name: 'Усиленный организм', text: '+10% к здоровью героя.', max: 5 },
    REGN: { name: 'Самовосстановление', text: 'Каждый 3-й ход в бою герой восстанавливает 1 здоровье за уровень навыка.', max: 3 },
    CONC: { name: 'Тактический анализ', text: 'Каждый 4-й ход в бою герой берёт дополнительную карту.', max: 2 }
  };

  // Веса редкости наград: обычный бой и рубеж/сокровищница
  var RARITY_WEIGHTS = {
    battle: { cantrip: 3, common: 6, rare: 3, unique: 1 },
    rich: { cantrip: 0, common: 1, rare: 4, unique: 4 }
  };

  function setData(d) { data = d; }

  // ---------- Случайность (зерно в забеге) ----------

  function rand(run) {
    var t = (run.seed = (run.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------- Опыт и уровни ----------

  function levelFor(xp) {
    var need = data.progression.expNeeded, lv = 1;
    while (lv < need.length && xp >= need[lv]) lv++;
    return lv;
  }

  function xpForMonster(level) {
    return data.progression.expForMonster[level - 1] || 0;
  }

  // Опыт: [набрано на уровне, нужно до следующего]
  function xpProgress(run) {
    var need = data.progression.expNeeded, lv = run.level;
    if (lv >= need.length) return [1, 1];
    return [run.xp - need[lv - 1], need[lv] - need[lv - 1]];
  }

  // ---------- Забег ----------

  function newRun(element, difficulty, seed) {
    var race = data.races[element];
    return {
      version: 1,
      element: element,
      heroName: race.hero,
      difficulty: difficulty || 0,
      xp: 0,
      level: data.campaign.startLevel || 1,
      chapter: 0,
      cleared: { start: true },
      collection: race.starter.slice(),
      deck: race.starter.slice(),
      skills: {},
      pending: null,
      done: false,
      seed: (seed || Date.now()) | 0,
      stats: { wins: 0, losses: 0 }
    };
  }

  function chapter(run) { return data.campaign.chapters[run.chapter]; }

  function node(run, id) {
    return chapter(run).nodes.filter(function (n) { return n.id === id; })[0];
  }

  // Доступен ли узел: не пройден и соседствует с пройденным
  function isAvailable(run, id) {
    if (run.cleared[id] || run.pending || run.done) return false;
    return chapter(run).edges.some(function (e) {
      return (e[0] === id && run.cleared[e[1]]) || (e[1] === id && run.cleared[e[0]]);
    });
  }

  function monster(id) { return data.monsters[id]; }

  // Параметры боя для движка: игрок против монстра узла
  function battleSetup(run, nodeId) {
    var n = node(run, nodeId), m = monster(n.monster);
    var v = m.variants[run.difficulty] || m.variants[0];
    return {
      seed: run.seed + run.chapter * 101 + nodeId.length * 7 + run.stats.wins * 13 + run.stats.losses,
      players: [
        { name: run.heroName, element: run.element, level: run.level, deck: run.deck.slice(), skills: run.skills,
          art: 'heroes/' + data.races[run.element].faction },
        { name: m.name + (n.type === 'gate' ? ' (страж)' : ''), element: m.element, level: m.level, hp: v.hp,
          deck: v.deck.slice(), skills: v.skills, passives: n.boss || [], art: monsterArt(m) }
      ]
    };
  }

  function monsterArt(m) {
    var c = m.avatar && data.cards.filter(function (x) { return x.id === m.avatar; })[0];
    return c ? c.art : null;
  }

  // ---------- Награды ----------

  function playableCards(element) {
    return data.cards.filter(function (c) { return c.element === element && !c.special && c.impl !== false; });
  }

  function pickWeighted(run, pool, weights) {
    var total = 0;
    pool.forEach(function (c) { total += weights[c.rarity] || 0; });
    var r = rand(run) * total;
    for (var i = 0; i < pool.length; i++) {
      r -= weights[pool[i].rarity] || 0;
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  // Три разные карты своей стихии
  function cardOffer(run, kind) {
    var pool = playableCards(run.element), out = [];
    var weights = RARITY_WEIGHTS[kind] || RARITY_WEIGHTS.battle;
    for (var guard = 0; out.length < 3 && guard < 200; guard++) {
      var c = pickWeighted(run, pool, weights);
      if (out.indexOf(c.id) < 0) out.push(c.id);
    }
    return out;
  }

  function skillOffer(run) {
    return Object.keys(SKILLS).filter(function (k) { return (run.skills[k] || 0) < SKILLS[k].max; });
  }

  // ---------- Ход по карте ----------

  // Войти в узел без боя (награда, событие)
  function visit(run, nodeId) {
    if (!isAvailable(run, nodeId)) return false;
    var n = node(run, nodeId);
    if (n.type === 'reward') run.pending = { type: 'reward', node: nodeId, cards: cardOffer(run, 'rich') };
    else if (n.type === 'event') run.pending = { type: 'event', node: nodeId, skills: skillOffer(run) };
    else return false;
    return true;
  }

  // Итог боя
  function battleResult(run, nodeId, won) {
    if (!won) { run.stats.losses++; return; }
    var n = node(run, nodeId), m = monster(n.monster);
    run.stats.wins++;
    run.xp += xpForMonster(m.level);
    var before = run.level;
    run.level = levelFor(run.xp);
    run.pending = { type: 'reward', node: nodeId, cards: cardOffer(run, n.type === 'gate' ? 'rich' : 'battle'),
      levelUp: run.level > before ? run.level : 0, xpGain: xpForMonster(m.level), gate: n.type === 'gate' };
  }

  // Завершить ожидающее (награда/событие): choice - id карты, код навыка или null (пропустить)
  function resolvePending(run, choice) {
    var p = run.pending;
    if (!p) return;
    if (p.type === 'reward' && choice && p.cards.indexOf(choice) >= 0) {
      run.collection.push(choice);
      if (run.deck.length < data.progression.deckMax && copies(run.deck, choice) < data.progression.maxCopies) run.deck.push(choice);
    }
    if (p.type === 'event' && choice && SKILLS[choice]) run.skills[choice] = (run.skills[choice] || 0) + 1;
    run.cleared[p.node] = true;
    run.pending = null;
    if (p.gate) nextChapter(run);
  }

  function nextChapter(run) {
    if (run.chapter + 1 >= data.campaign.chapters.length) { run.done = true; return; }
    run.chapter++;
    run.cleared = { start: true };
  }

  // ---------- Колода ----------

  function copies(list, id) {
    return list.filter(function (x) { return x === id; }).length;
  }

  // Проверка колоды: размер, копии, только карты коллекции
  function validateDeck(run, deck) {
    var p = data.progression;
    if (deck.length < p.deckMin) return 'В колоде должно быть не меньше ' + p.deckMin + ' карт.';
    if (deck.length > p.deckMax) return 'В колоде должно быть не больше ' + p.deckMax + ' карт.';
    for (var i = 0; i < deck.length; i++) {
      var id = deck[i];
      if (copies(deck, id) > copies(run.collection, id)) return 'Карт "' + id + '" больше, чем в коллекции.';
      if (copies(deck, id) > p.maxCopies) return 'Не больше ' + p.maxCopies + ' копий одной карты.';
    }
    return null;
  }

  function setDeck(run, deck) {
    var err = validateDeck(run, deck);
    if (!err) run.deck = deck.slice();
    return err;
  }

  AD.Campaign = {
    DIFFICULTY: DIFFICULTY,
    SKILLS: SKILLS,
    setData: setData,
    data: function () { return data; },
    levelFor: levelFor,
    xpForMonster: xpForMonster,
    xpProgress: xpProgress,
    newRun: newRun,
    chapter: chapter,
    node: node,
    monster: monster,
    isAvailable: isAvailable,
    battleSetup: battleSetup,
    visit: visit,
    battleResult: battleResult,
    resolvePending: resolvePending,
    copies: copies,
    validateDeck: validateDeck,
    setDeck: setDeck,
    playableCards: playableCards
  };
})(window.AD = window.AD || {});
