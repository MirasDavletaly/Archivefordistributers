import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, search, searchBrands, similarity, tokenize } from '../src/search.mjs';

const FIXTURE = [
  {
    id: 1, name: 'IBEMO', kind: 'distributor', city: 'Алматы', country: 'Казахстан',
    phone: '+7 727 123-45-67', email: '', terms: '', notes: '', status: 'active',
    brands: [{ id: 10, name: 'HAWKE' }, { id: 11, name: 'ROXTEC' }, { id: 12, name: 'SCHNEIDER ELECTRIC' }],
    contacts: [{ id: 100, name: 'Lajos Korpas', email: 'lajos@ibemo-kz.com', phone: '' }],
  },
  {
    id: 2, name: 'RM ELECTRICAL', kind: 'distributor', city: '', country: '',
    phone: '', email: '', terms: '', notes: '', status: 'active',
    brands: [{ id: 10, name: 'HAWKE' }, { id: 13, name: 'GLAMOX' }],
    contacts: [{ id: 101, name: 'Mark Rood', email: 'mark.rood@rm-electrical.com', phone: '' }],
  },
  {
    id: 3, name: 'CORTEM', kind: 'direct', city: '', country: 'Италия',
    phone: '', email: '', terms: '', notes: '', status: 'active',
    brands: [{ id: 14, name: 'CORTEM' }],
    contacts: [{ id: 102, name: 'Antonello Scaburri', email: 'a.scaburri@cortemgroup.com', phone: '' }],
  },
];

const index = buildIndex(FIXTURE);
const names = (r) => r.map((x) => x.supplier.name);

test('пустой запрос возвращает весь список', () => {
  assert.equal(search(index, '').length, 3);
});

test('поиск по названию поставщика', () => {
  assert.deepEqual(names(search(index, 'ibemo')), ['IBEMO']);
});

test('поиск по бренду находит всех, кто его возит', () => {
  assert.deepEqual(names(search(index, 'hawke')).sort(), ['IBEMO', 'RM ELECTRICAL']);
});

test('опечатка в бренде всё равно находит', () => {
  assert.deepEqual(names(search(index, 'hawk')).sort(), ['IBEMO', 'RM ELECTRICAL']);
  assert.deepEqual(names(search(index, 'hawkee')).sort(), ['IBEMO', 'RM ELECTRICAL']);
  assert.deepEqual(names(search(index, 'haweke')).sort(), ['IBEMO', 'RM ELECTRICAL']);
});

test('опечатка в длинном бренде', () => {
  assert.deepEqual(names(search(index, 'schneder')), ['IBEMO']);
  assert.deepEqual(names(search(index, 'шнайдер')).length, 0, 'транслитерация не заявлена и не поддерживается');
});

test('поиск по имени контакта и по почте', () => {
  assert.deepEqual(names(search(index, 'lajos')), ['IBEMO']);
  assert.deepEqual(names(search(index, 'cortemgroup')), ['CORTEM']);
});

test('два слова работают как И', () => {
  assert.deepEqual(names(search(index, 'hawke glamox')), ['RM ELECTRICAL']);
  assert.equal(search(index, 'hawke cortem').length, 0);
});

test('поиск по фрагменту телефона в любом формате', () => {
  assert.deepEqual(names(search(index, '1234567')), ['IBEMO']);
  assert.deepEqual(names(search(index, '727')), ['IBEMO']);
});

test('поиск по городу', () => {
  assert.deepEqual(names(search(index, 'алматы')), ['IBEMO']);
});

test('совпадение в названии важнее совпадения в бренде', () => {
  const r = search(index, 'cortem');
  assert.equal(r[0].supplier.name, 'CORTEM');
});

test('бессмысленный запрос не находит ничего', () => {
  assert.equal(search(index, 'ззззззз').length, 0);
  assert.equal(search(index, 'qqqqwwww').length, 0);
});

test('фильтр по виду поставщика', () => {
  assert.deepEqual(names(search(index, '', { kind: 'direct' })), ['CORTEM']);
});

test('результат объясняет, почему запись найдена', () => {
  const [hit] = search(index, 'hawke');
  assert.ok(hit.hits.some((h) => h.kind === 'brand' && h.display === 'HAWKE'));
});

test('совпадение по названию не дублируется в пояснении', () => {
  const [hit] = search(index, 'ibemo');
  assert.ok(!hit.hits.some((h) => h.kind === 'name'));
});

test('searchBrands собирает бренд и его поставщиков', () => {
  const [brand] = searchBrands(index, 'hawke');
  assert.equal(brand.name, 'HAWKE');
  assert.deepEqual(brand.suppliers.map((s) => s.name).sort(), ['IBEMO', 'RM ELECTRICAL']);
});

test('similarity: точное совпадение, опечатка, мимо', () => {
  assert.equal(similarity('hawke', 'hawke'), 1);
  assert.ok(similarity('hawke', 'hawkes') > 0.5);
  assert.ok(similarity('hawke', 'glamox') < 0.5);
});

test('tokenize чистит пунктуацию и ё', () => {
  assert.deepEqual(tokenize('  Чёрный,  список! '), ['черный', 'список']);
  assert.deepEqual(tokenize('a@b.kz'), ['a@b.kz']);
});
