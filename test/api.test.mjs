import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, createSupplier, attachBrand, createContact } from '../src/db.mjs';
import { createStore, handleApi } from '../src/api.mjs';

let store;

const call = (method, path, body, query = '') =>
  handleApi(store, { method, path, query: new URLSearchParams(query), body });

beforeEach(() => {
  const db = openDb(':memory:');
  const ibemo = createSupplier(db, { name: 'IBEMO', kind: 'distributor', city: 'Алматы' });
  attachBrand(db, ibemo, 'HAWKE');
  attachBrand(db, ibemo, 'ROXTEC');
  createContact(db, ibemo, { name: 'Lajos Korpas', email: 'lajos@ibemo-kz.com' });

  const rm = createSupplier(db, { name: 'RM ELECTRICAL' });
  attachBrand(db, rm, 'HAWKE');

  createSupplier(db, { name: 'CORTEM', kind: 'direct' });
  store = createStore(db);
});

test('поиск отдаёт поставщиков и бренды', () => {
  const res = call('GET', '/api/search', null, 'q=hawke');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.suppliers.map((s) => s.name).sort(), ['IBEMO', 'RM ELECTRICAL']);
  assert.equal(res.body.brands[0].name, 'HAWKE');
});

test('поиск по опечатке в имени контакта', () => {
  const res = call('GET', '/api/search', null, 'q=lajos');
  assert.deepEqual(res.body.suppliers.map((s) => s.name), ['IBEMO']);
  assert.ok(res.body.suppliers[0].hits.some((hit) => hit.display === 'Lajos Korpas'));
});

test('фильтр по виду поставщика', () => {
  const res = call('GET', '/api/search', null, 'kind=direct');
  assert.deepEqual(res.body.suppliers.map((s) => s.name), ['CORTEM']);
});

test('создание поставщика', () => {
  const res = call('POST', '/api/suppliers', { name: 'НОВЫЙ', city: 'Астана' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'НОВЫЙ');
  assert.deepEqual(res.body.brands, []);
  assert.equal(call('GET', '/api/search', null, 'q=новый').body.total, 1, 'индекс пересобран');
});

test('создание без названия отклоняется', () => {
  const res = call('POST', '/api/suppliers', { name: '   ' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'name_required');
});

test('изменение поставщика', () => {
  const id = call('GET', '/api/search', null, 'q=ibemo').body.suppliers[0].id;
  const res = call('PATCH', `/api/suppliers/${id}`, { city: 'Атырау', status: 'reserve' });
  assert.equal(res.body.city, 'Атырау');
  assert.equal(res.body.status, 'reserve');
  assert.equal(call('GET', '/api/search', null, 'q=атырау').body.total, 1, 'новый город ищется');
});

test('изменение несуществующего поставщика даёт 404', () => {
  assert.equal(call('PATCH', '/api/suppliers/9999', { city: 'X' }).status, 404);
  assert.equal(call('GET', '/api/suppliers/9999').status, 404);
});

test('удаление поставщика убирает его из поиска', () => {
  const id = call('GET', '/api/search', null, 'q=cortem').body.suppliers[0].id;
  assert.equal(call('DELETE', `/api/suppliers/${id}`).status, 200);
  assert.equal(call('GET', '/api/search', null, 'q=cortem').body.total, 0);
});

test('добавление бренда поставщику', () => {
  const id = call('GET', '/api/search', null, 'q=cortem').body.suppliers[0].id;
  const res = call('POST', `/api/suppliers/${id}/brands`, { name: 'Cortem Group' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.brands.map((b) => b.name), ['Cortem Group']);
  assert.equal(call('GET', '/api/search', null, 'q=cortem group').body.total, 1);
});

test('бренд с тем же названием в другом регистре не дублируется', () => {
  const id = call('GET', '/api/search', null, 'q=ibemo').body.suppliers[0].id;
  call('POST', `/api/suppliers/${id}/brands`, { name: 'hawke' });
  const brands = call('GET', '/api/brands').body.brands.filter((b) => b.name.toUpperCase() === 'HAWKE');
  assert.equal(brands.length, 1);
});

test('бренд без названия отклоняется', () => {
  const id = call('GET', '/api/search', null, 'q=ibemo').body.suppliers[0].id;
  assert.equal(call('POST', `/api/suppliers/${id}/brands`, { name: '' }).status, 400);
});

test('отвязка бренда, который возит кто-то ещё, его не удаляет', () => {
  const id = call('GET', '/api/search', null, 'q=ibemo').body.suppliers[0].id;
  const hawke = call('GET', '/api/brands').body.brands.find((b) => b.name === 'HAWKE');
  call('DELETE', `/api/suppliers/${id}/brands/${hawke.id}`);
  assert.ok(call('GET', '/api/brands').body.brands.some((b) => b.name === 'HAWKE'),
    'бренд остался у RM ELECTRICAL');
  assert.deepEqual(call('GET', '/api/search', null, 'q=hawke').body.suppliers.map((s) => s.name),
    ['RM ELECTRICAL']);
});

test('отвязка последнего бренда удаляет его из справочника', () => {
  const id = call('GET', '/api/search', null, 'q=ibemo').body.suppliers[0].id;
  const roxtec = call('GET', '/api/brands').body.brands.find((b) => b.name === 'ROXTEC');
  call('DELETE', `/api/suppliers/${id}/brands/${roxtec.id}`);
  assert.ok(!call('GET', '/api/brands').body.brands.some((b) => b.name === 'ROXTEC'));
});

test('страница бренда показывает всех его поставщиков', () => {
  const hawke = call('GET', '/api/brands').body.brands.find((b) => b.name === 'HAWKE');
  const res = call('GET', `/api/brands/${hawke.id}`);
  assert.deepEqual(res.body.suppliers.map((s) => s.name).sort(), ['IBEMO', 'RM ELECTRICAL']);
});

test('переименование бренда в существующий объединяет записи', () => {
  const brands = call('GET', '/api/brands').body.brands;
  const roxtec = brands.find((b) => b.name === 'ROXTEC');
  const hawke = brands.find((b) => b.name === 'HAWKE');
  const res = call('PATCH', `/api/brands/${roxtec.id}`, { name: 'HAWKE' });
  assert.equal(res.body.id, hawke.id);
  assert.ok(!call('GET', '/api/brands').body.brands.some((b) => b.name === 'ROXTEC'));
});

test('контакты: добавление, изменение, удаление', () => {
  const id = call('GET', '/api/search', null, 'q=cortem').body.suppliers[0].id;
  const created = call('POST', `/api/suppliers/${id}/contacts`, { name: 'Иван', email: 'ivan@cortem.it' });
  assert.equal(created.status, 201);
  const contact = created.body.contacts[0];

  assert.equal(call('PATCH', `/api/contacts/${contact.id}`, { role: 'менеджер' }).status, 200);
  assert.equal(call('GET', `/api/suppliers/${id}`).body.contacts[0].role, 'менеджер');
  assert.equal(call('GET', '/api/search', null, 'q=иван').body.total, 1);

  assert.equal(call('DELETE', `/api/contacts/${contact.id}`).status, 200);
  assert.equal(call('GET', `/api/suppliers/${id}`).body.contacts.length, 0);
  assert.equal(call('DELETE', `/api/contacts/${contact.id}`).status, 404);
});

test('статистика считает записи', () => {
  const s = call('GET', '/api/stats').body;
  assert.equal(s.suppliers, 3);
  assert.equal(s.distributors, 2);
  assert.equal(s.direct, 1);
  assert.equal(s.brands, 2);
  assert.equal(s.links, 3);
  assert.equal(s.contacts, 1);
});

test('экспорт CSV по умолчанию на английском, с BOM для Excel', () => {
  const res = call('GET', '/api/export.csv');
  assert.equal(res.type, 'text/csv; charset=utf-8');
  assert.ok(res.text.startsWith('﻿'));
  const lines = res.text.split('\r\n');
  assert.match(lines[0], /Supplier;Type;City/);
  assert.ok(lines.some((l) => l.includes('IBEMO') && l.includes('HAWKE')));
  assert.ok(lines.some((l) => l.includes('distributor')));
});

test('экспорт CSV на русском по параметру lang', () => {
  const res = call('GET', '/api/export.csv', null, 'lang=ru');
  const lines = res.text.split('\r\n');
  assert.match(lines[0], /Поставщик;Вид;Город/);
  assert.ok(lines.some((l) => l.includes('дистрибьютор')));
});

test('статус ищется словом на обоих языках', () => {
  assert.ok(call('GET', '/api/search', null, 'q=active').body.total > 0);
  assert.ok(call('GET', '/api/search', null, 'q=активный').body.total > 0);
});

test('ошибки отдают код для перевода на клиенте', () => {
  assert.equal(call('POST', '/api/suppliers', { name: '' }).body.code, 'name_required');
  assert.equal(call('GET', '/api/suppliers/9999').body.code, 'not_found');
  assert.equal(call('GET', '/api/нет-такого').body.code, 'unknown_route');
});

test('неизвестный путь даёт 404', () => {
  assert.equal(call('GET', '/api/нет-такого').status, 404);
});
