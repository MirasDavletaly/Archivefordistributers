import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContactCell, cleanName } from '../src/contacts.mjs';

test('почта без имени', () => {
  assert.deepEqual(parseContactCell('rfq@alprom.kz'), [{ name: '', email: 'rfq@alprom.kz' }]);
});

test('имя в угловых скобках', () => {
  assert.deepEqual(parseContactCell('Okan Arslan <okan@nako-kz.com>'),
    [{ name: 'Okan Arslan', email: 'okan@nako-kz.com' }]);
});

test('только почта в угловых скобках', () => {
  assert.deepEqual(parseContactCell('<azamat@ibemo-kz.com>'),
    [{ name: '', email: 'azamat@ibemo-kz.com' }]);
});

test('имя строкой выше с висящим дефисом', () => {
  assert.deepEqual(parseContactCell('Caterina Tassinari -\nsales@centerkit.net'),
    [{ name: 'Caterina Tassinari', email: 'sales@centerkit.net' }]);
});

test('имя и почта в одной строке через дефис', () => {
  assert.deepEqual(parseContactCell('Grant Stott - gstott@hubbell.com'),
    [{ name: 'Grant Stott', email: 'gstott@hubbell.com' }]);
});

test('несколько почт через точку с запятой', () => {
  const r = parseContactCell('sales1@intekno.kz; sales6@intekno.kz; dyesbergenov@intekno.kz');
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((c) => c.email),
    ['sales1@intekno.kz', 'sales6@intekno.kz', 'dyesbergenov@intekno.kz']);
});

test('кириллические имена в кавычках', () => {
  const r = parseContactCell("'Муратов Али' <corp2@220volt.kz>; 'Мухатаев Ержан' <220volt@220volt.kz>");
  assert.deepEqual(r, [
    { name: 'Муратов Али', email: 'corp2@220volt.kz' },
    { name: 'Мухатаев Ержан', email: '220volt@220volt.kz' },
  ]);
});

test('несколько почт на отдельных строках', () => {
  const r = parseContactCell('ruslan.imanbekov@kz.abb.com\ndaniil.bushkov@kz.abb.com\nYermek.Imashev@kz.abb.com');
  assert.equal(r.length, 3);
  assert.equal(r[2].email, 'yermek.imashev@kz.abb.com', 'почта приводится к нижнему регистру');
});

test('имя с запятой и тегом в скобках сохраняется', () => {
  assert.deepEqual(parseContactCell('Dmitriy, KAZAKOV [ANCON]\ncmd@ancon.kz'),
    [{ name: 'Dmitriy, KAZAKOV [ANCON]', email: 'cmd@ancon.kz' }]);
});

test('дубли почт внутри ячейки склеиваются', () => {
  const r = parseContactCell('a@b.kz\na@b.kz');
  assert.equal(r.length, 1);
});

test('имя без почты не теряется', () => {
  assert.deepEqual(parseContactCell('Иван Петров'), [{ name: 'Иван Петров', email: '' }]);
});

test('пустая ячейка даёт пустой список', () => {
  assert.deepEqual(parseContactCell(''), []);
  assert.deepEqual(parseContactCell(null), []);
});

test('cleanName убирает обрамление', () => {
  assert.equal(cleanName('  «Имя» , '), 'Имя');
  assert.equal(cleanName('Имя   Фамилия'), 'Имя Фамилия');
});
