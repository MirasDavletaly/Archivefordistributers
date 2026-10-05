// Демо-хранилище (работает в браузере на GitHub Pages) проверяется тем же
// контрактом, что и сервер, плюс несколько проверок, специфичных для демо.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoStore } from '../public/demo-store.js';
import { runApiContract } from './api-contract.mjs';

const FIXTURE = {
  suppliers: [
    {
      id: 1, name: 'IBEMO', kind: 'distributor', city: 'Алматы', country: '',
      website: '', phone: '+7 727 123-45-67', email: '', terms: '', notes: '',
      status: 'active', created_at: '2026-10-05', updated_at: '2026-10-05',
    },
    {
      id: 2, name: 'RM ELECTRICAL', kind: 'distributor', city: '', country: '',
      website: '', phone: '', email: '', terms: '', notes: '',
      status: 'active', created_at: '2026-10-05', updated_at: '2026-10-05',
    },
    {
      id: 3, name: 'CORTEM', kind: 'direct', city: '', country: '',
      website: '', phone: '', email: '', terms: '', notes: '',
      status: 'active', created_at: '2026-10-05', updated_at: '2026-10-05',
    },
  ],
  brands: [
    { id: 1, name: 'HAWKE', name_key: 'HAWKE' },
    { id: 2, name: 'ROXTEC', name_key: 'ROXTEC' },
  ],
  links: [
    { supplier_id: 1, brand_id: 1, note: '' },
    { supplier_id: 1, brand_id: 2, note: '' },
    { supplier_id: 2, brand_id: 1, note: '' },
  ],
  contacts: [
    {
      id: 1, supplier_id: 1, name: 'Lajos Korpas', role: '',
      email: 'lajos@ibemo-kz.com', phone: '', note: '', sort: 0,
    },
  ],
};

// persist: false — тестам не нужно хранилище браузера.
const makeCall = () => {
  const store = createDemoStore(FIXTURE, { persist: false });
  return (method, path, body) => store.request(path, { method, body });
};

runApiContract('демо', makeCall);

/* ---------- поведение, которого нет у сервера ---------- */

test('демо: сессия всегда открыта и помечена как демонстрационная', () => {
  const call = makeCall();
  const res = call('GET', '/api/session');
  assert.equal(res.body.authed, true);
  assert.equal(res.body.protected, false);
  assert.equal(res.body.demo, true);
});

test('демо: сброс возвращает исходные данные', () => {
  const store = createDemoStore(FIXTURE, { persist: false });
  const call = (method, path, body) => store.request(path, { method, body });

  call('POST', '/api/suppliers', { name: 'ВРЕМЕННЫЙ' });
  const id = call('GET', '/api/search?q=ibemo').body.suppliers[0].id;
  call('DELETE', `/api/suppliers/${id}`);
  assert.equal(call('GET', '/api/stats').body.suppliers, 3);

  store.reset();
  const after = call('GET', '/api/stats').body;
  assert.equal(after.suppliers, 3);
  assert.equal(call('GET', '/api/search?q=ibemo').body.total, 1, 'IBEMO вернулся');
  assert.equal(call('GET', '/api/search?q=%D0%B2%D1%80%D0%B5%D0%BC%D0%B5%D0%BD%D0%BD%D1%8B%D0%B9').body.total, 0,
    'добавленная запись исчезла');
});

test('демо: исходные данные не меняются между копиями хранилища', () => {
  const first = createDemoStore(FIXTURE, { persist: false });
  first.request('/api/suppliers', { method: 'POST', body: { name: 'ТОЛЬКО ТУТ' } });

  const second = createDemoStore(FIXTURE, { persist: false });
  assert.equal(second.request('/api/stats', {}).body.suppliers, 3,
    'фикстура не испорчена предыдущим хранилищем');
});

test('демо: правки переживают перезагрузку страницы', () => {
  // Простейшая замена localStorage.
  const memory = new Map();
  const storage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, v),
  };

  const first = createDemoStore(FIXTURE, { storage });
  first.request('/api/suppliers', { method: 'POST', body: { name: 'СОХРАНЁННЫЙ' } });

  const second = createDemoStore(FIXTURE, { storage });
  assert.equal(second.request('/api/stats', {}).body.suppliers, 4);
  assert.equal(
    second.request('/api/search?q=%D1%81%D0%BE%D1%85%D1%80%D0%B0%D0%BD%D1%91%D0%BD%D0%BD%D1%8B%D0%B9', {}).body.total,
    1,
  );
});

test('демо: повреждённое хранилище не ломает запуск', () => {
  const storage = { getItem: () => '{не json', setItem: () => {} };
  const store = createDemoStore(FIXTURE, { storage });
  assert.equal(store.request('/api/stats', {}).body.suppliers, 3);
});
