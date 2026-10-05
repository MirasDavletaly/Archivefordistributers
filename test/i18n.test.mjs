import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, LANGS, t, setLang, getLang, kindLabel, statusLabel, statusClass, tError }
  from '../public/i18n.js';

test('языком по умолчанию является английский', () => {
  assert.equal(getLang(), 'en');
});

test('в обоих языках один и тот же набор ключей', () => {
  const en = Object.keys(DICTIONARIES.en).sort();
  const ru = Object.keys(DICTIONARIES.ru).sort();
  const missingInRu = en.filter((k) => !DICTIONARIES.ru[k]);
  const missingInEn = ru.filter((k) => !DICTIONARIES.en[k]);
  assert.deepEqual(missingInRu, [], 'нет русского перевода');
  assert.deepEqual(missingInEn, [], 'нет английского перевода');
  assert.deepEqual(en, ru);
});

test('ключ одного типа в обоих языках', () => {
  for (const key of Object.keys(DICTIONARIES.en)) {
    assert.equal(typeof DICTIONARIES.en[key], typeof DICTIONARIES.ru[key], `разный тип у ключа ${key}`);
  }
});

test('каждая подпись даёт непустую строку', () => {
  const sample = {
    n: 2, name: 'HAWKE', capped: false, suppliers: 5, brands: 3, contacts: 4,
  };
  for (const lang of LANGS) {
    setLang(lang);
    for (const key of Object.keys(DICTIONARIES.en)) {
      const value = t(key, sample);
      assert.equal(typeof value, 'string', `ключ ${key} (${lang}) вернул не строку`);
      assert.ok(value.length > 0, `ключ ${key} (${lang}) пустой`);
    }
  }
  setLang('en');
});

test('русские формы множественного числа', () => {
  setLang('ru');
  assert.match(t('brands.inArchive', { n: 1 }), /^1 бренд /);
  assert.match(t('brands.inArchive', { n: 3 }), /^3 бренда /);
  assert.match(t('brands.inArchive', { n: 5 }), /^5 брендов /);
  assert.match(t('brands.inArchive', { n: 11 }), /^11 брендов /);
  assert.match(t('brands.inArchive', { n: 21 }), /^21 бренд /);
  setLang('en');
});

test('английские формы единственного и множественного числа', () => {
  assert.equal(t('brands.inArchive', { n: 1 }), '1 brand in the archive');
  assert.equal(t('brands.inArchive', { n: 5 }), '5 brands in the archive');
});

test('подписи вида и статуса переключаются вместе с языком', () => {
  assert.equal(kindLabel('direct'), 'direct supplier');
  assert.equal(statusLabel('blacklist'), 'blacklist');
  setLang('ru');
  assert.equal(kindLabel('direct'), 'прямой поставщик');
  assert.equal(statusLabel('blacklist'), 'чёрный список');
  setLang('en');
});

test('класс бейджа не зависит от языка', () => {
  assert.equal(statusClass('blacklist'), 'badge-bad');
  assert.equal(statusClass('reserve'), 'badge-warn');
  assert.equal(statusClass('active'), 'badge-ok');
  assert.equal(statusClass('что-то ещё'), '');
});

test('ошибка API переводится по коду', () => {
  assert.equal(tError({ code: 'name_required', message: 'Name is required' }), 'Name is required');
  setLang('ru');
  assert.equal(tError({ code: 'name_required', message: 'Name is required' }), 'Название обязательно');
  setLang('en');
});

test('неизвестный код ошибки показывает сообщение сервера', () => {
  assert.equal(tError({ code: 'нет_такого', message: 'Something broke' }), 'Something broke');
  assert.equal(tError({}), 'Server error');
});

test('неизвестный ключ возвращается как есть — это заметно при проверке', () => {
  assert.equal(t('нет.такого.ключа'), 'нет.такого.ключа');
});
