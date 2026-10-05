// Общий контракт API. По нему проверяются обе реализации:
// серверная (src/api.mjs поверх SQLite) и демо (public/demo-store.js в браузере).
// Если они разойдутся, тесты это покажут.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Фикстура, которую должна создать каждая реализация:
 *   IBEMO (дистрибьютор, Алматы, +7 727 123-45-67) — бренды HAWKE, ROXTEC; контакт Lajos Korpas
 *   RM ELECTRICAL (дистрибьютор) — бренд HAWKE
 *   CORTEM (прямой поставщик) — без брендов и контактов
 *
 * @param {string} label название реализации для вывода
 * @param {() => (method: string, path: string, body?: any) => {status:number, body?:any, text?:string}} makeCall
 *   фабрика: возвращает функцию вызова поверх свежей копии фикстуры
 */
export function runApiContract(label, makeCall) {
  const name = (title) => `${label}: ${title}`;
  const idOf = (call, query) => call('GET', `/api/search?q=${encodeURIComponent(query)}`).body.suppliers[0].id;
  const brandNamed = (call, brandName) =>
    call('GET', '/api/brands').body.brands.find((b) => b.name === brandName);

  test(name('поиск отдаёт поставщиков и бренды'), () => {
    const call = makeCall();
    const res = call('GET', '/api/search?q=hawke');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.suppliers.map((s) => s.name).sort(), ['IBEMO', 'RM ELECTRICAL']);
    assert.equal(res.body.brands[0].name, 'HAWKE');
  });

  test(name('поиск по имени контакта объясняет совпадение'), () => {
    const call = makeCall();
    const res = call('GET', '/api/search?q=lajos');
    assert.deepEqual(res.body.suppliers.map((s) => s.name), ['IBEMO']);
    assert.ok(res.body.suppliers[0].hits.some((hit) => hit.display === 'Lajos Korpas'));
  });

  test(name('поиск терпит опечатку'), () => {
    const call = makeCall();
    assert.deepEqual(call('GET', '/api/search?q=hawkee').body.suppliers.map((s) => s.name).sort(),
      ['IBEMO', 'RM ELECTRICAL']);
  });

  test(name('поиск по фрагменту телефона'), () => {
    const call = makeCall();
    assert.deepEqual(call('GET', '/api/search?q=727').body.suppliers.map((s) => s.name), ['IBEMO']);
  });

  test(name('фильтр по виду поставщика'), () => {
    const call = makeCall();
    assert.deepEqual(call('GET', '/api/search?kind=direct').body.suppliers.map((s) => s.name), ['CORTEM']);
  });

  test(name('статус ищется словом на обоих языках'), () => {
    const call = makeCall();
    assert.ok(call('GET', '/api/search?q=active').body.total > 0);
    assert.ok(call('GET', '/api/search?q=%D0%B0%D0%BA%D1%82%D0%B8%D0%B2%D0%BD%D1%8B%D0%B9').body.total > 0);
  });

  test(name('создание поставщика'), () => {
    const call = makeCall();
    const res = call('POST', '/api/suppliers', { name: 'НОВЫЙ', city: 'Астана' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'НОВЫЙ');
    assert.deepEqual(res.body.brands, []);
    assert.equal(res.body.status, 'active', 'статус по умолчанию');
    assert.equal(call('GET', '/api/search?q=%D0%BD%D0%BE%D0%B2%D1%8B%D0%B9').body.total, 1,
      'новая запись сразу ищется');
  });

  test(name('создание без названия отклоняется'), () => {
    const call = makeCall();
    const res = call('POST', '/api/suppliers', { name: '   ' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'name_required');
  });

  test(name('изменение поставщика попадает в поиск'), () => {
    const call = makeCall();
    const id = idOf(call, 'ibemo');
    const res = call('PATCH', `/api/suppliers/${id}`, { city: 'Атырау', status: 'reserve' });
    assert.equal(res.body.city, 'Атырау');
    assert.equal(res.body.status, 'reserve');
    assert.equal(call('GET', '/api/search?q=%D0%B0%D1%82%D1%8B%D1%80%D0%B0%D1%83').body.total, 1);
  });

  test(name('переименование в пустое имя отклоняется'), () => {
    const call = makeCall();
    const id = idOf(call, 'ibemo');
    assert.equal(call('PATCH', `/api/suppliers/${id}`, { name: '  ' }).body.code, 'name_required');
  });

  test(name('несуществующий поставщик даёт 404'), () => {
    const call = makeCall();
    assert.equal(call('GET', '/api/suppliers/9999').status, 404);
    assert.equal(call('PATCH', '/api/suppliers/9999', { city: 'X' }).status, 404);
    assert.equal(call('GET', '/api/suppliers/9999').body.code, 'not_found');
  });

  test(name('удаление поставщика убирает его из поиска'), () => {
    const call = makeCall();
    const id = idOf(call, 'cortem');
    assert.equal(call('DELETE', `/api/suppliers/${id}`).status, 200);
    assert.equal(call('GET', '/api/search?q=cortem').body.total, 0);
  });

  test(name('удаление поставщика уносит его контакты'), () => {
    const call = makeCall();
    const id = idOf(call, 'ibemo');
    call('DELETE', `/api/suppliers/${id}`);
    assert.equal(call('GET', '/api/search?q=lajos').body.total, 0);
  });

  test(name('добавление бренда'), () => {
    const call = makeCall();
    const id = idOf(call, 'cortem');
    const res = call('POST', `/api/suppliers/${id}/brands`, { name: 'Cortem Group' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.brands.map((b) => b.name), ['Cortem Group']);
    assert.equal(call('GET', '/api/search?q=cortem%20group').body.total, 1);
  });

  test(name('бренд в другом регистре не дублируется'), () => {
    const call = makeCall();
    const id = idOf(call, 'cortem');
    call('POST', `/api/suppliers/${id}/brands`, { name: 'hawke' });
    const same = call('GET', '/api/brands').body.brands.filter((b) => b.name.toUpperCase() === 'HAWKE');
    assert.equal(same.length, 1);
    assert.equal(call('GET', '/api/brands').body.brands.find((b) => b.name === 'HAWKE').suppliers, 3);
  });

  test(name('бренд без названия отклоняется'), () => {
    const call = makeCall();
    const id = idOf(call, 'ibemo');
    assert.equal(call('POST', `/api/suppliers/${id}/brands`, { name: '' }).body.code, 'brand_name_required');
  });

  test(name('отвязка бренда у одного оставляет его у другого'), () => {
    const call = makeCall();
    const id = idOf(call, 'ibemo');
    call('DELETE', `/api/suppliers/${id}/brands/${brandNamed(call, 'HAWKE').id}`);
    assert.ok(brandNamed(call, 'HAWKE'), 'бренд остался у RM ELECTRICAL');
    assert.deepEqual(call('GET', '/api/search?q=hawke').body.suppliers.map((s) => s.name), ['RM ELECTRICAL']);
  });

  test(name('отвязка последнего бренда убирает его из справочника'), () => {
    const call = makeCall();
    const id = idOf(call, 'ibemo');
    call('DELETE', `/api/suppliers/${id}/brands/${brandNamed(call, 'ROXTEC').id}`);
    assert.equal(brandNamed(call, 'ROXTEC'), undefined);
  });

  test(name('страница бренда показывает всех его поставщиков'), () => {
    const call = makeCall();
    const res = call('GET', `/api/brands/${brandNamed(call, 'HAWKE').id}`);
    assert.deepEqual(res.body.suppliers.map((s) => s.name).sort(), ['IBEMO', 'RM ELECTRICAL']);
  });

  test(name('переименование бренда'), () => {
    const call = makeCall();
    const res = call('PATCH', `/api/brands/${brandNamed(call, 'ROXTEC').id}`, { name: 'Roxtec International' });
    assert.equal(res.body.name, 'Roxtec International');
    assert.equal(brandNamed(call, 'ROXTEC'), undefined);
  });

  test(name('переименование в существующий бренд объединяет записи'), () => {
    const call = makeCall();
    const hawkeId = brandNamed(call, 'HAWKE').id;
    const res = call('PATCH', `/api/brands/${brandNamed(call, 'ROXTEC').id}`, { name: 'HAWKE' });
    assert.equal(res.body.id, hawkeId);
    assert.equal(brandNamed(call, 'ROXTEC'), undefined);
    assert.equal(brandNamed(call, 'HAWKE').suppliers, 2);
  });

  test(name('контакты: добавление, изменение, удаление'), () => {
    const call = makeCall();
    const id = idOf(call, 'cortem');
    const created = call('POST', `/api/suppliers/${id}/contacts`, { name: 'Иван', email: 'ivan@cortem.it' });
    assert.equal(created.status, 201);
    const contact = created.body.contacts[0];

    assert.equal(call('PATCH', `/api/contacts/${contact.id}`, { role: 'менеджер' }).status, 200);
    assert.equal(call('GET', `/api/suppliers/${id}`).body.contacts[0].role, 'менеджер');
    assert.equal(call('GET', '/api/search?q=%D0%B8%D0%B2%D0%B0%D0%BD').body.total, 1);

    assert.equal(call('DELETE', `/api/contacts/${contact.id}`).status, 200);
    assert.equal(call('GET', `/api/suppliers/${id}`).body.contacts.length, 0);
    assert.equal(call('DELETE', `/api/contacts/${contact.id}`).status, 404);
  });

  test(name('статистика считает записи'), () => {
    const call = makeCall();
    const s = call('GET', '/api/stats').body;
    assert.equal(s.suppliers, 3);
    assert.equal(s.distributors, 2);
    assert.equal(s.direct, 1);
    assert.equal(s.brands, 2);
    assert.equal(s.links, 3);
    assert.equal(s.contacts, 1);
  });

  test(name('экспорт CSV на английском с BOM'), () => {
    const call = makeCall();
    const res = call('GET', '/api/export.csv');
    assert.ok(res.text.startsWith('﻿'));
    const lines = res.text.split('\r\n');
    assert.match(lines[0], /Supplier;Type;City/);
    assert.ok(lines.some((l) => l.includes('IBEMO') && l.includes('HAWKE')));
    assert.ok(lines.some((l) => l.includes('distributor')));
  });

  test(name('экспорт CSV на русском'), () => {
    const call = makeCall();
    const lines = call('GET', '/api/export.csv?lang=ru').text.split('\r\n');
    assert.match(lines[0], /Поставщик;Вид;Город/);
    assert.ok(lines.some((l) => l.includes('дистрибьютор')));
  });

  test(name('неизвестный путь даёт код unknown_route'), () => {
    const call = makeCall();
    const res = call('GET', '/api/нет-такого');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'unknown_route');
  });
}
