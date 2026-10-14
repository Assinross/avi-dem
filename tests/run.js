// Запуск: node tests/run.js
// Грузит модули игры в общий контекст (как браузер) и выполняет tests/*.test.js.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var ctx = { window: {}, console: console, Math: Math, JSON: JSON };
vm.createContext(ctx);
['js/effects.js', 'js/engine.js', 'js/ai.js', 'js/campaign.js'].forEach(function (f) {
  var file = path.join(root, f);
  if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
});
var AD = ctx.window.AD;
AD.Engine.setData({
  cards: JSON.parse(fs.readFileSync(path.join(root, 'data/cards.json'), 'utf8')),
  ether: JSON.parse(fs.readFileSync(path.join(root, 'data/ether.json'), 'utf8'))
});

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ок   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e)); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'не равно') + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
}
function ok(v, msg) { if (!v) throw new Error(msg || 'ожидалось истинное значение'); }

fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); }).sort().forEach(function (f) {
  console.log(f);
  require(path.join(__dirname, f))({ AD: AD, test: test, eq: eq, ok: ok });
});
console.log('\nПройдено: ' + passed + ', упало: ' + failed);
process.exit(failed ? 1 : 0);
