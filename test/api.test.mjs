// Серверная реализация API проверяется общим контрактом (test/api-contract.mjs).
import { openDb, createSupplier, attachBrand, createContact } from '../src/db.mjs';
import { createStore, handleApi } from '../src/api.mjs';
import { runApiContract } from './api-contract.mjs';

function makeCall() {
  const db = openDb(':memory:');

  const ibemo = createSupplier(db, {
    name: 'IBEMO', kind: 'distributor', city: 'Алматы', phone: '+7 727 123-45-67',
  });
  attachBrand(db, ibemo, 'HAWKE');
  attachBrand(db, ibemo, 'ROXTEC');
  createContact(db, ibemo, { name: 'Lajos Korpas', email: 'lajos@ibemo-kz.com' });

  const rm = createSupplier(db, { name: 'RM ELECTRICAL' });
  attachBrand(db, rm, 'HAWKE');

  createSupplier(db, { name: 'CORTEM', kind: 'direct' });

  const store = createStore(db);
  return (method, path, body) => {
    const [pathname, qs] = path.split('?');
    return handleApi(store, { method, path: pathname, query: new URLSearchParams(qs || ''), body });
  };
}

runApiContract('сервер', makeCall);
